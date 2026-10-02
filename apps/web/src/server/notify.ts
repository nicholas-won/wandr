/**
 * Outbound notifications (§6.6 FR-80–FR-87, §6.10 messaging rows, D43, N-5, N-12).
 *
 * Background-job bodies, run as the service (RLS bypassed), so every function here does its own
 * filtering: active members only, attendance per Stop (FR-S7, N-12), never anyone a surprise
 * item is hidden from (FR-91), never solo trips (§6.10). Every text goes through `sendMessage`,
 * which applies opt-outs, the per-person/per-trip throttle and the spend cap (FR-84, FR-85).
 *
 * Push is Phase 2, so in the POC every member gets the "no-app" column of FR-80.
 */
import { and, desc, eq, gt, gte, inArray, isNull, isNotNull, like, lte, or, sql } from "drizzle-orm";
import {
  asService,
  expenseAdjustments,
  expenses,
  expenseShares,
  ideas,
  memberContacts,
  members,
  notificationKeys,
  payments,
  pollOptions,
  polls,
  pollVotes,
  shareCards,
  smsOpenQuestions,
  stopAttendance,
  trips,
  users,
  votes,
  type Db,
  type Tx,
} from "@wandr/db";
import { attendingMemberIds, money, tripSize, type MemberStatus, type TripSize } from "@wandr/core";
import {
  balanceDirections,
  buildShareSnapshot,
  digestDay,
  digestEnabled,
  DIGEST_LOOKBACK_MS,
  pollFallbackDue,
  pollNudgeDue,
  pollTextRecipients,
  POLL_NUDGE_WINDOW_MS,
  ShareRefusedError,
} from "@wandr/core/messaging";
import type { resolveIdea } from "@wandr/ai";
import { createPersonalLink } from "@/lib/auth/personal-link";
import { appUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { digestEmail, notifyTexts } from "@/lib/messaging/notify-texts";
import { sendMessage, tryOpenSmsQuestion } from "@/lib/messaging/send";
import { texts } from "@/lib/messaging/templates";
import { EVENTS } from "@/inngest/client";
import { resolveIdeaJob } from "./ideas";
import { enqueue } from "./jobs";

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

export type TripPerson = {
  memberId: string;
  name: string;
  userId: string | null;
  role: "owner" | "organizer" | "member";
  status: MemberStatus;
  phone: string | null;
  email: string | null;
};

/** Everyone on a trip with their private contact details (service only, never returned to clients). */
export async function tripPeople(tx: Tx, tripId: string): Promise<TripPerson[]> {
  const rows = await tx
    .select({
      memberId: members.id,
      name: members.displayName,
      userId: members.userId,
      role: members.role,
      status: members.status,
      userPhone: users.phone,
      userEmail: users.email,
      contactPhone: memberContacts.phone,
      contactEmail: memberContacts.email,
    })
    .from(members)
    .leftJoin(users, eq(users.id, members.userId))
    .leftJoin(memberContacts, eq(memberContacts.memberId, members.id))
    .where(eq(members.tripId, tripId));
  return rows.map((r) => ({
    memberId: r.memberId,
    name: r.name,
    userId: r.userId,
    role: r.role,
    status: r.status,
    phone: r.userPhone ?? r.contactPhone ?? null,
    email: r.userEmail ?? r.contactEmail ?? null,
  }));
}

function sizeOf(people: TripPerson[]): TripSize {
  return tripSize(people.filter((p) => p.status === "active").length);
}

/** Members attending a Stop (or the whole trip), minus anyone the item is hidden from. */
async function eligibleFor(tx: Tx, people: TripPerson[], stopId: string | null, hiddenFrom: string[]) {
  const list = people.map((p) => ({ memberId: p.memberId, status: p.status }));
  if (!stopId) {
    const hidden = new Set(hiddenFrom);
    return list.filter((m) => m.status === "active" && !hidden.has(m.memberId)).map((m) => m.memberId);
  }
  const rows = await tx
    .select({ stopId: stopAttendance.stopId, memberId: stopAttendance.memberId, attending: stopAttendance.attending })
    .from(stopAttendance)
    .where(eq(stopAttendance.stopId, stopId));
  return attendingMemberIds(list, stopId, rows, hiddenFrom);
}

/** Claim an idempotency key; false if it was already claimed (job retries, overlapping runs). */
async function claimKey(tx: Tx, key: string, tripId: string | null): Promise<boolean> {
  const rows = await tx
    .insert(notificationKeys)
    .values({ key, tripId })
    .onConflictDoNothing()
    .returning({ key: notificationKeys.key });
  return rows.length > 0;
}

async function personalLink(db: Db, memberId: string): Promise<string> {
  return asService(db, async (tx) => (await createPersonalLink(tx, memberId)).url);
}

// ---------------------------------------------------------------------------
// New idea → resolve, then vote questions (FR-20–26, FR-82, FR-83, FR-84)
// ---------------------------------------------------------------------------

/** Job body for `wandr/idea.added`. */
export async function handleIdeaAdded(db: Db, ideaId: string, deps: { resolver?: typeof resolveIdea } = {}) {
  await resolveIdeaJob(db, ideaId, deps);
  await sendVoteQuestions(db, ideaId);
}

/**
 * Text "New idea: X. Reply 1 Must-do, 2 Down, 3 Pass" to members who haven't voted on it.
 * Holds the one-open-question rule (DN-23): if the person already has an open question, they
 * don't get this one (no queue; the trip page and digest still show it). If the text isn't
 * delivered as SMS (throttled, opted out), the question is closed again so a later "1" can't
 * vote on an idea they never saw.
 */
export async function sendVoteQuestions(db: Db, ideaId: string): Promise<{ texted: string[] }> {
  const ctx = await asService(db, async (tx) => {
    const [idea] = await tx.select().from(ideas).where(eq(ideas.id, ideaId));
    if (!idea) return null;
    if (idea.status === "dropped" || idea.candidates != null) return null;
    if (idea.extraction !== "resolved" && idea.extraction !== "needs_review") return null;
    const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, idea.tripId));
    const people = await tripPeople(tx, idea.tripId);
    const eligible = await eligibleFor(tx, people, idea.stopId, idea.hiddenFrom);
    const voted = await tx.select({ m: votes.memberId }).from(votes).where(eq(votes.ideaId, ideaId));
    return { idea, tripName: trip?.name ?? "", people, eligible, voted: voted.map((v) => v.m) };
  });
  if (!ctx || sizeOf(ctx.people) === "solo") return { texted: [] };

  const recipients = pollTextRecipients({
    eligible: ctx.eligible,
    voted: ctx.voted,
    alreadyTexted: [],
    exclude: ctx.idea.createdByMemberId ? [ctx.idea.createdByMemberId] : [],
  });
  const texted: string[] = [];
  for (const memberId of recipients) {
    const person = ctx.people.find((p) => p.memberId === memberId);
    if (!person?.phone) continue;
    const phone = person.phone;
    const opened = await asService(db, (tx) =>
      tryOpenSmsQuestion(tx, {
        phone,
        memberId,
        payload: { kind: "vote", tripId: ctx.idea.tripId, ideaId, ideaTitle: ctx.idea.title },
      }),
    );
    if (!opened) continue;
    const link = await personalLink(db, memberId);
    const sent = await sendMessage({
      kind: "vote_question",
      tripId: ctx.idea.tripId,
      memberId,
      phone,
      email: null, // "Reply 1/2/3" only makes sense by text
      body: texts.voteQuestion({ to: { name: person.name, link }, tripName: ctx.tripName, ideaTitle: ctx.idea.title }),
    });
    if (sent.channel === "sms") {
      texted.push(memberId);
    } else {
      await asService(db, (tx) =>
        tx
          .delete(smsOpenQuestions)
          .where(
            and(
              eq(smsOpenQuestions.phone, phone),
              eq(smsOpenQuestions.memberId, memberId),
              sql`${smsOpenQuestions.payload}->>'ideaId' = ${ideaId}`,
            ),
          ),
      );
    }
  }
  return { texted };
}

// ---------------------------------------------------------------------------
// Polls: closing nudges (FR-47, FR-80, N-5) and the FR-80c fallback
// ---------------------------------------------------------------------------

type PollRow = typeof polls.$inferSelect;

async function pollContext(tx: Tx, poll: PollRow) {
  const people = await tripPeople(tx, poll.tripId);
  const eligible = await eligibleFor(tx, people, poll.stopId, poll.hiddenFrom);
  const voted = (await tx.select({ m: pollVotes.memberId }).from(pollVotes).where(eq(pollVotes.pollId, poll.id))).map(
    (r) => r.m,
  );
  const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, poll.tripId));
  return { people, eligible, voted, tripName: trip?.name ?? "" };
}

async function textedKeys(tx: Tx, prefix: string): Promise<string[]> {
  const rows = await tx
    .select({ key: notificationKeys.key })
    .from(notificationKeys)
    .where(like(notificationKeys.key, `${prefix}%`));
  return rows.map((r) => r.key.slice(prefix.length));
}

/**
 * Cron: nudge people who haven't voted on polls closing within ~3h. Time-sensitive (N-5 P0), so
 * it bypasses the daily cap but not opt-outs or the spend cap. One nudge per person per poll.
 */
export async function runPollClosingNudges(db: Db, now = new Date()): Promise<{ texted: number }> {
  const due = await asService(db, (tx) =>
    tx
      .select()
      .from(polls)
      .where(
        and(isNull(polls.closedAt), gt(polls.closesAt, now), lte(polls.closesAt, new Date(now.getTime() + POLL_NUDGE_WINDOW_MS))),
      ),
  );
  let texted = 0;
  for (const poll of due) {
    if (!pollNudgeDue(poll, now)) continue;
    const prefix = `poll_closing:${poll.id}:`;
    const ctx = await asService(db, async (tx) => ({ ...(await pollContext(tx, poll)), done: await textedKeys(tx, prefix) }));
    if (sizeOf(ctx.people) === "solo") continue;
    const recipients = pollTextRecipients({ eligible: ctx.eligible, voted: ctx.voted, alreadyTexted: ctx.done });
    for (const memberId of recipients) {
      const person = ctx.people.find((p) => p.memberId === memberId);
      if (!person || (!person.phone && !person.email)) continue;
      if (!(await asService(db, (tx) => claimKey(tx, `${prefix}${memberId}`, poll.tripId)))) continue;
      const link = await personalLink(db, memberId);
      const r = await sendMessage({
        kind: "poll_closing",
        tripId: poll.tripId,
        memberId,
        phone: person.phone,
        email: person.email,
        timeSensitive: true,
        body: texts.pollClosing({
          to: { name: person.name, link },
          tripName: ctx.tripName,
          hoursLeft: (poll.closesAt!.getTime() - now.getTime()) / 3_600_000,
        }),
      });
      if (r.channel !== "none") texted++;
    }
  }
  return { texted };
}

/**
 * Cron: FR-80c. Open polls nobody shared to the group chat within ~12h get personal texts to
 * eligible people who haven't voted. Surprise polls (FR-80d) never go to the group chat, so they
 * are texted right away to the people allowed to see them.
 */
export async function runPollShareFallbacks(db: Db, now = new Date()): Promise<{ texted: number }> {
  const open = await asService(db, (tx) =>
    tx
      .select()
      .from(polls)
      .where(and(isNull(polls.closedAt), or(isNull(polls.closesAt), gt(polls.closesAt, now)))),
  );
  let texted = 0;
  for (const poll of open) {
    if (!pollFallbackDue(poll, now)) continue;
    const prefix = `poll_fallback:${poll.id}:`;
    const ctx = await asService(db, async (tx) => ({ ...(await pollContext(tx, poll)), done: await textedKeys(tx, prefix) }));
    if (sizeOf(ctx.people) === "solo") continue;
    const recipients = pollTextRecipients({
      eligible: ctx.eligible,
      voted: ctx.voted,
      alreadyTexted: ctx.done,
      exclude: poll.createdByMemberId ? [poll.createdByMemberId] : [],
    });
    for (const memberId of recipients) {
      const person = ctx.people.find((p) => p.memberId === memberId);
      if (!person || (!person.phone && !person.email)) continue;
      if (!(await asService(db, (tx) => claimKey(tx, `${prefix}${memberId}`, poll.tripId)))) continue;
      const link = await personalLink(db, memberId);
      const r = await sendMessage({
        kind: "nudge",
        tripId: poll.tripId,
        memberId,
        phone: person.phone,
        email: person.email,
        body: notifyTexts.pollFallback({
          to: { name: person.name, link },
          tripName: ctx.tripName,
          closesInHours: poll.closesAt ? (poll.closesAt.getTime() - now.getTime()) / 3_600_000 : null,
        }),
      });
      if (r.channel !== "none") texted++;
    }
  }
  return { texted };
}

// ---------------------------------------------------------------------------
// Daily idea digest (D43, FR-80, §6.10)
// ---------------------------------------------------------------------------

/**
 * Cron, once a day. For each group trip with new ideas in the last 24h: freeze a digest share
 * card (organizers see "Share today's ideas" on the Share page, FR-80a) and email verified
 * members who have an email address. Never surprise items (FR-80d/FR-91); never on quiet days.
 * Duo and solo trips get no digest (§6.10 defaults).
 */
export async function runDailyDigest(db: Db, now = new Date()): Promise<{ trips: string[] }> {
  const since = new Date(now.getTime() - DIGEST_LOOKBACK_MS);
  const day = digestDay(now);
  const tripIds = await asService(db, async (tx) =>
    (
      await tx
        .selectDistinct({ tripId: ideas.tripId })
        .from(ideas)
        .where(and(gte(ideas.createdAt, since), inArray(ideas.extraction, ["resolved", "needs_review"])))
    ).map((r) => r.tripId),
  );
  const done: string[] = [];
  for (const tripId of tripIds) {
    const ctx = await asService(db, async (tx) => {
      const people = await tripPeople(tx, tripId);
      if (!digestEnabled(sizeOf(people))) return null;
      const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId));
      const fresh = await tx
        .select({ title: ideas.title, hiddenFrom: ideas.hiddenFrom })
        .from(ideas)
        .where(
          and(
            eq(ideas.tripId, tripId),
            gte(ideas.createdAt, since),
            inArray(ideas.extraction, ["resolved", "needs_review"]),
            sql`${ideas.status} <> 'dropped'`,
          ),
        )
        .orderBy(desc(ideas.createdAt));
      let snapshot;
      try {
        snapshot = buildShareSnapshot({ kind: "digest", tripName: trip?.name ?? "", day, ideas: fresh });
      } catch (e) {
        if (e instanceof ShareRefusedError) return null; // only surprise items today
        throw e;
      }
      const inserted = await tx
        .insert(shareCards)
        .values({ tripId, kind: "digest", digestDay: day, snapshot })
        .onConflictDoNothing()
        .returning({ id: shareCards.id });
      if (inserted.length === 0) return null; // already ran today
      return { people, tripName: trip?.name ?? "", snapshot };
    });
    if (!ctx || ctx.snapshot.kind !== "digest") continue;
    done.push(tripId);

    // Email to verified members ("push or email" column; push is Phase 2).
    const mail = digestEmail({
      tripName: ctx.tripName,
      titles: ctx.snapshot.titles,
      count: ctx.snapshot.count,
      url: `${appUrl()}${routes.trip(tripId)}`,
    });
    for (const p of ctx.people) {
      if (p.status !== "active" || !p.userId || !p.email) continue;
      if (!(await asService(db, (tx) => claimKey(tx, `digest_email:${tripId}:${day}:${p.memberId}`, tripId)))) continue;
      await sendMessage({
        kind: "digest",
        tripId,
        memberId: p.memberId,
        phone: null,
        email: p.email,
        emailSubject: mail.subject,
        body: mail.text,
      });
    }
  }
  return { trips: done };
}

// ---------------------------------------------------------------------------
// Expenses: "you owe / are owed" (FR-80)
// ---------------------------------------------------------------------------

/**
 * Call after an expense is created, edited, adjusted or deleted (expenses slice §6.5).
 * Queues a background job that texts each person involved (payer and people with a share,
 * except whoever made the change and anyone the expense is hidden from) the direction of
 * their balance per currency. Inngest debounces repeated edits to the same expense.
 */
export async function notifyExpenseChange(tripId: string, expenseId: string): Promise<void> {
  await enqueue({ name: EVENTS.expenseChanged, data: { tripId, expenseId } });
}

/** Job body for `wandr/expense.changed`. */
export async function sendExpenseTexts(db: Db, tripId: string, expenseId: string): Promise<{ texted: string[] }> {
  const ctx = await asService(db, async (tx) => {
    const [expense] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)));
    if (!expense) return null;
    const people = await tripPeople(tx, tripId);
    const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId));
    const all = await tx.select().from(expenses).where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)));
    const shares = all.length
      ? await tx.select().from(expenseShares).where(inArray(expenseShares.expenseId, all.map((e) => e.id)))
      : [];
    const adjustments = await tx
      .select({
        expenseId: expenseAdjustments.expenseId,
        memberId: expenseAdjustments.memberId,
        deltaMinor: expenseAdjustments.deltaMinor,
        currency: expenses.currency,
        hiddenFrom: expenses.hiddenFrom,
      })
      .from(expenseAdjustments)
      .innerJoin(expenses, eq(expenses.id, expenseAdjustments.expenseId))
      .where(eq(expenseAdjustments.tripId, tripId));
    const pays = await tx.select().from(payments).where(eq(payments.tripId, tripId));
    const thisShares = await tx.select().from(expenseShares).where(eq(expenseShares.expenseId, expenseId));
    return { expense, people, tripName: trip?.name ?? "", all, shares, adjustments, pays, thisShares };
  });
  if (!ctx) return { texted: [] };
  const size = sizeOf(ctx.people);
  if (size === "solo") return { texted: [] };

  const hidden = new Set(ctx.expense.hiddenFrom);
  const involved = new Set([ctx.expense.paidByMemberId, ...ctx.thisShares.map((s) => s.memberId)]);
  involved.delete(ctx.expense.uploadedByMemberId);
  const actor = ctx.people.find((p) => p.memberId === ctx.expense.uploadedByMemberId);

  const texted: string[] = [];
  for (const memberId of involved) {
    if (hidden.has(memberId)) continue; // FR-91: never hint at a surprise expense
    const person = ctx.people.find((p) => p.memberId === memberId);
    if (!person || person.status !== "active" || (!person.phone && !person.email)) continue;

    // Balances over what this person may see (surprise expenses hidden from them are excluded).
    let balances: money.Balances;
    try {
      const visible = ctx.all.filter((e) => !e.hiddenFrom.includes(memberId));
      balances = money.computeBalances({
        expenses: visible.map((e) => ({
          id: e.id,
          currency: e.currency,
          totalMinor: e.totalMinor,
          payerId: e.paidByMemberId,
          shares: ctx.shares
            .filter((s) => s.expenseId === e.id)
            .map((s) => ({ memberId: s.memberId, shareMinor: s.shareMinor })),
        })),
        adjustments: ctx.adjustments
          .filter((a) => !a.hiddenFrom.includes(memberId))
          .map((a) => ({ memberId: a.memberId, currency: a.currency, deltaMinor: a.deltaMinor })),
        payments: ctx.pays.map((p) => ({
          fromMemberId: p.fromMemberId,
          toMemberId: p.toMemberId,
          currency: p.currency,
          amountMinor: p.amountMinor,
        })),
      });
    } catch (err) {
      // e.g. an itemized expense still waiting on claims; don't text a wrong balance.
      console.warn("[notify] balances not computable yet", err instanceof Error ? err.message : err);
      return { texted };
    }
    const directions = balanceDirections(balances, memberId);
    const other =
      size === "duo" ? ctx.people.find((p) => p.status === "active" && p.memberId !== memberId)?.name : null;
    const link = await personalLink(db, memberId);
    const r = await sendMessage({
      kind: "expense",
      tripId,
      memberId,
      phone: person.phone,
      email: person.email,
      body: notifyTexts.balance({
        to: { name: person.name, link },
        tripName: ctx.tripName,
        actorName: actor?.name ?? "",
        directions,
        otherName: other,
      }),
    });
    if (r.channel !== "none") texted.push(memberId);
  }
  return { texted };
}

// ---------------------------------------------------------------------------
// WRONG number (J-4, FR-16): alert organizers
// ---------------------------------------------------------------------------

export async function alertOrganizersWrongNumber(
  db: Db,
  affected: { memberId: string; tripId: string }[],
): Promise<number> {
  let sent = 0;
  for (const a of affected) {
    const ctx = await asService(db, async (tx) => {
      const people = await tripPeople(tx, a.tripId);
      const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, a.tripId));
      return { people, tripName: trip?.name ?? "" };
    });
    const who = ctx.people.find((p) => p.memberId === a.memberId);
    if (!who) continue;
    for (const org of ctx.people) {
      if (org.memberId === a.memberId || org.status !== "active" || org.role === "member") continue;
      if (!org.phone && !org.email) continue;
      const link = await personalLink(db, org.memberId);
      const r = await sendMessage({
        kind: "nudge",
        tripId: a.tripId,
        memberId: org.memberId,
        phone: org.phone,
        email: org.email,
        body: notifyTexts.wrongNumberAlert({ to: { name: org.name, link }, memberName: who.name, tripName: ctx.tripName }),
      });
      if (r.channel !== "none") sent++;
    }
  }
  return sent;
}

/** Shared-at for polls (FR-80c timer), exported for the share module. */
export async function markPollShared(tx: Tx, pollId: string, at = new Date()) {
  await tx.update(polls).set({ sharedAt: at }).where(and(eq(polls.id, pollId), isNull(polls.sharedAt)));
}

/** Option labels in order (poll share cards). */
export async function pollOptionLabels(tx: Tx, pollId: string): Promise<{ id: string; label: string }[]> {
  return tx
    .select({ id: pollOptions.id, label: pollOptions.label })
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId))
    .orderBy(pollOptions.position);
}

/** Polls decided recently (closed with a winner), for "Decision made" share prompts. */
export async function recentDecisions(tx: Tx, tripId: string, since: Date) {
  return tx
    .select()
    .from(polls)
    .where(and(eq(polls.tripId, tripId), isNotNull(polls.winningOptionId), isNotNull(polls.closedAt), gte(polls.closedAt, since)));
}
