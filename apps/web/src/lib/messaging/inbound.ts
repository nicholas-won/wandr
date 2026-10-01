/**
 * Executes inbound text actions (FR-82, FR-83, FR-85, FR-16; N-1, N-6, N-7, N-9, J-4, M-12).
 * Server only. Lookups and messaging state use the service role and authorize against the
 * sender's number; votes are written *as the voter* (`link_member` claims) so RLS and the vote
 * trigger apply.
 */
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import {
  asService,
  auditLog,
  getDb,
  ideas,
  memberContacts,
  members,
  smsOpenQuestions,
  smsUndo,
  users,
  votes,
  withSession,
  type Tx,
} from "@wandr/db";
import { revokeLinksForMembers } from "@/lib/auth/personal-link";
import { appUrl, env } from "@/lib/env";
import { onTextedIdea, onTextedReceipt, onWrongNumber } from "@/lib/hooks";
import { parseInbound, routeInbound, type InboundAction, type VoteValue } from "./inbound-parse";
import { isPhoneOptedOut, setPhoneOptOut } from "./opt-out";
import { logReply, type OpenQuestionPayload } from "./send";
import { replies } from "./templates";

/** UNDO window for text-in actions (FR-82, N-9). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export type InboundSms = { from: string; body: string; mediaUrls: string[] };

type UndoPayload =
  | {
      type: "vote";
      ideaId: string;
      memberId: string;
      /** The vote before this text, or null if there was none. */
      previous: VoteValue | null;
    }
  | { type: "join"; memberId: string; tripId: string };

/** Members tied to this number, via a user account or an invite-list contact. */
async function membershipsForPhone(tx: Tx, phone: string) {
  const viaUser = await tx
    .select({ memberId: members.id, tripId: members.tripId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(users.phone, phone), ne(members.status, "removed")));
  const viaContact = await tx
    .select({ memberId: members.id, tripId: members.tripId })
    .from(memberContacts)
    .innerJoin(members, eq(members.id, memberContacts.memberId))
    .where(and(eq(memberContacts.phone, phone), ne(members.status, "removed")));
  const seen = new Map<string, { memberId: string; tripId: string }>();
  for (const m of [...viaUser, ...viaContact]) seen.set(m.memberId, m);
  return [...seen.values()];
}

/** Handle one inbound text; returns the reply text (or null for no reply). */
export async function handleInboundSms(msg: InboundSms): Promise<string | null> {
  const db = await getDb();
  const intent = parseInbound({ body: msg.body, mediaUrls: msg.mediaUrls });
  const now = new Date();

  const { action, question, undo, optedOut } = await asService(db, async (tx) => {
    const [question] = await tx.select().from(smsOpenQuestions).where(eq(smsOpenQuestions.phone, msg.from)).limit(1);
    const [undo] = await tx
      .select()
      .from(smsUndo)
      .where(and(eq(smsUndo.phone, msg.from), gt(smsUndo.expiresAt, now)))
      .limit(1);
    const optedOut = await isPhoneOptedOut(tx, msg.from);
    const action = routeInbound(intent, {
      openQuestion: question
        ? { kind: question.kind as "vote" | "approve_join", expired: question.expiresAt <= now }
        : null,
      hasUndo: !!undo,
      optedOut,
    });
    return { action, question, undo, optedOut };
  });

  const reply = await execute(action, msg, { question, undo, optedOut, now });
  if (reply) {
    await asService(db, (tx) => logReply(tx, msg.from, reply)).catch((err) =>
      console.error("[sms] failed to log reply", err),
    );
  }
  return reply;
}

type Ctx = {
  question: typeof smsOpenQuestions.$inferSelect | undefined;
  undo: typeof smsUndo.$inferSelect | undefined;
  optedOut: boolean;
  now: Date;
};

async function execute(action: InboundAction, msg: InboundSms, ctx: Ctx): Promise<string | null> {
  const db = await getDb();
  const phone = msg.from;

  switch (action.action) {
    case "opt_out":
      await asService(db, async (tx) => {
        await setPhoneOptOut(tx, phone, true, action.informal ? "informal" : "stop");
        await tx.delete(smsOpenQuestions).where(eq(smsOpenQuestions.phone, phone));
      });
      return replies.optedOut();

    case "opt_in":
      await asService(db, (tx) => setPhoneOptOut(tx, phone, false, "start"));
      return replies.optedIn();

    case "help":
      return replies.help({ url: appUrl(), supportEmail: env().SUPPORT_EMAIL });

    case "wrong_number": {
      const affected = await asService(db, async (tx) => {
        await setPhoneOptOut(tx, phone, true, "wrong");
        await tx.delete(smsOpenQuestions).where(eq(smsOpenQuestions.phone, phone));
        await tx.delete(smsUndo).where(eq(smsUndo.phone, phone));
        const ms = await membershipsForPhone(tx, phone);
        await revokeLinksForMembers(
          tx,
          ms.map((m) => m.memberId),
        );
        return ms;
      });
      await onWrongNumber({ members: affected });
      return replies.wrongNumber();
    }

    case "undo":
      return ctx.undo ? undoAction(phone, ctx.undo.payload as UndoPayload) : replies.nothingToUndo();
    case "nothing_to_undo":
      return replies.nothingToUndo();

    case "cast_vote":
      return ctx.question ? castVote(phone, ctx.question, action.value) : replies.noOpenQuestion();

    case "decide_join":
      return ctx.question ? decideJoin(phone, ctx.question, action.approve, ctx.now) : replies.noOpenQuestion();

    case "question_closed":
      await asService(db, (tx) => tx.delete(smsOpenQuestions).where(eq(smsOpenQuestions.phone, phone)));
      return replies.questionClosed();

    case "no_open_question":
      return replies.noOpenQuestion();
    case "hint":
      return replies.hint(action.expected);
    case "tapback":
      return replies.tapback();
    case "unrecognized":
      return replies.unrecognized();

    case "texted_idea":
      if (ctx.optedOut) return null;
      return (await onTextedIdea(phone, action.url)).reply;
    case "texted_receipt":
      if (ctx.optedOut) return null;
      return (await onTextedReceipt(phone, action.mediaUrls)).reply;
  }
}

/**
 * Record a texted vote. The write runs as the voter so the database refuses hidden/surprise
 * ideas (FR-91) and sets cast_in_size / open_to / change_count itself (FR-43, FR-T4/T5).
 */
async function castVote(phone: string, q: typeof smsOpenQuestions.$inferSelect, value: VoteValue): Promise<string> {
  const payload = q.payload as Extract<OpenQuestionPayload, { kind: "vote" }>;
  const db = await getDb();
  const row = await asService(db, async (tx) => {
    await tx.delete(smsOpenQuestions).where(eq(smsOpenQuestions.phone, phone));
    const [r] = await tx
      .select({ memberStatus: members.status, ideaTitle: ideas.title, ideaStatus: ideas.status })
      .from(members)
      .innerJoin(ideas, and(eq(ideas.id, payload.ideaId), eq(ideas.tripId, members.tripId)))
      .where(eq(members.id, q.memberId))
      .limit(1);
    return r;
  });
  if (!row || row.memberStatus !== "active") return replies.removed(); // N-7, M-12
  if (row.ideaStatus === "dropped") return replies.questionClosed();

  let previous: VoteValue | null;
  try {
    previous = await withSession(db, { link_member: q.memberId }, async (tx) => {
      const [prev] = await tx
        .select({ value: votes.value })
        .from(votes)
        .where(and(eq(votes.ideaId, payload.ideaId), eq(votes.memberId, q.memberId)))
        .limit(1);
      await tx
        .insert(votes)
        // trip_id / cast_in_size are overwritten by the vote trigger.
        .values({ ideaId: payload.ideaId, memberId: q.memberId, tripId: payload.tripId, value, castInSize: "solo" })
        .onConflictDoUpdate({ target: [votes.ideaId, votes.memberId], set: { value } });
      return prev?.value ?? null;
    });
  } catch (err) {
    console.warn("[sms] vote refused by RLS", err instanceof Error ? err.message : err);
    return replies.questionClosed();
  }

  await asService(db, (tx) =>
    saveUndo(tx, phone, { type: "vote", ideaId: payload.ideaId, memberId: q.memberId, previous }, new Date()),
  );
  return replies.voteRecorded({ ideaTitle: row.ideaTitle, value });
}

async function decideJoin(
  phone: string,
  q: typeof smsOpenQuestions.$inferSelect,
  approve: boolean,
  now: Date,
): Promise<string> {
  const payload = q.payload as Extract<OpenQuestionPayload, { kind: "approve_join" }>;
  const db = await getDb();
  return asService(db, async (tx) => {
    await tx.delete(smsOpenQuestions).where(eq(smsOpenQuestions.phone, phone));

    // Only an active organizer answering from their own verified number may decide (N-9).
    const [organizer] = await tx
      .select({ id: members.id, role: members.role, status: members.status, tripId: members.tripId })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.id, q.memberId), eq(users.phone, phone)))
      .limit(1);
    if (
      !organizer ||
      organizer.status !== "active" ||
      organizer.role === "member" ||
      organizer.tripId !== payload.tripId
    ) {
      return replies.removed();
    }

    const updated = await tx
      .update(members)
      .set(approve ? { status: "active", joinedAt: now } : { status: "removed", removedAt: now })
      .where(
        and(
          eq(members.id, payload.pendingMemberId),
          eq(members.tripId, payload.tripId),
          eq(members.status, "pending"),
        ),
      )
      .returning({ id: members.id });
    if (updated.length === 0) return replies.questionClosed(); // already decided elsewhere

    await tx.insert(auditLog).values({
      tripId: payload.tripId,
      actorMemberId: organizer.id,
      action: approve ? "member.approved" : "member.denied",
      entity: "member",
      entityId: payload.pendingMemberId,
      data: { via: "sms" },
    });
    await saveUndo(tx, phone, { type: "join", memberId: payload.pendingMemberId, tripId: payload.tripId }, now);
    return replies.joinDecided({ name: payload.name, approved: approve, tripName: payload.tripName });
  });
}

async function saveUndo(tx: Tx, phone: string, payload: UndoPayload, now: Date) {
  const expiresAt = new Date(now.getTime() + UNDO_WINDOW_MS);
  await tx
    .insert(smsUndo)
    .values({ phone, payload, expiresAt })
    .onConflictDoUpdate({ target: smsUndo.phone, set: { payload, expiresAt } });
}

async function undoAction(phone: string, payload: UndoPayload): Promise<string> {
  const db = await getDb();
  await asService(db, (tx) => tx.delete(smsUndo).where(eq(smsUndo.phone, phone)));

  if (payload.type === "vote") {
    try {
      await withSession(db, { link_member: payload.memberId }, async (tx) => {
        const where = and(eq(votes.ideaId, payload.ideaId), eq(votes.memberId, payload.memberId));
        if (payload.previous) await tx.update(votes).set({ value: payload.previous }).where(where);
        else await tx.delete(votes).where(where);
      });
    } catch (err) {
      console.warn("[sms] undo refused by RLS", err instanceof Error ? err.message : err);
      return replies.questionClosed();
    }
    return replies.undone();
  }

  await asService(db, async (tx) => {
    await tx
      .update(members)
      .set({ status: "pending", joinedAt: null, removedAt: null })
      .where(
        and(
          eq(members.id, payload.memberId),
          eq(members.tripId, payload.tripId),
          inArray(members.status, ["active", "removed"]),
        ),
      );
    await tx.insert(auditLog).values({
      tripId: payload.tripId,
      action: "member.decision_undone",
      entity: "member",
      entityId: payload.memberId,
      data: { via: "sms" },
    });
  });
  return replies.undone();
}
