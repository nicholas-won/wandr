/**
 * Group-chat share cards (FR-80a/b/d/e, §6.10 "Send to Sam").
 *
 * - `createShare` reads the subject AS THE CALLER (RLS: you can only share what you can see),
 *   refuses anything with a non-empty hidden_from (surprise, FR-80d), freezes a group-safe
 *   snapshot (core buildShareSnapshot), and stores it as the service (share_cards has no client
 *   grants). The returned URL is /s/[kind]/[id] with an unguessable id.
 * - `getPublicShare` serves the frozen snapshot to anyone with the link, re-checking only that
 *   the subject still exists and hasn't since become a surprise. Never live tallies (FR-80b).
 * - `pendingShareMoments` lists the organizer prompts: today's digest, new polls not yet
 *   shared, recent decisions.
 */
import { and, desc, eq, gte, inArray, isNull, or, gt } from "drizzle-orm";
import {
  asService,
  ideas,
  ideaSources,
  members,
  polls,
  shareCards,
  trips,
  withSession,
  type Claims,
  type Db,
  type Tx,
} from "@wandr/db";
import { tripSize } from "@wandr/core";
import {
  buildShareSnapshot,
  shareMessage,
  sharePromptLabel,
  ShareRefusedError,
  SHARE_KINDS,
  type ShareKind,
  type ShareSnapshot,
} from "@wandr/core/messaging";
import { appUrl } from "@/lib/env";
import { markPollShared, pollOptionLabels, recentDecisions } from "./notify";

export const shareRoutes = {
  page: (kind: ShareKind, id: string) => `/s/${kind}/${id}`,
  open: (kind: ShareKind, id: string) => `/s/${kind}/${id}/open`,
};

export function isShareKind(k: string): k is ShareKind {
  return (SHARE_KINDS as readonly string[]).includes(k);
}

/**
 * The trip's group link (FR-6) for "Tap to vote" from a group chat (FR-80b).
 * TODO(joining slice, FR-6): the group-link token is stored hashed, so the URL can't be rebuilt
 * here. Return the live /j/[token] URL once the joining slice exposes one; until then null, and
 * the share page falls back to sign-in → trip.
 */
export async function groupLinkFor(tripId: string): Promise<string | null> {
  void tripId;
  return null;
}

async function callerMember(tx: Tx, claims: Claims, tripId: string) {
  const rows = await tx
    .select({ id: members.id, userId: members.userId, role: members.role, status: members.status, name: members.displayName })
    .from(members)
    .where(eq(members.tripId, tripId));
  const me = rows.find((m) => (claims.sub ? m.userId === claims.sub : m.id === claims.link_member));
  if (!me || me.status !== "active") return null;
  return { me, active: rows.filter((m) => m.status === "active") };
}

export type CreateShareResult =
  | { ok: true; shareId: string; url: string; message: string }
  | { ok: false; error: "not_found" | "surprise" | "not_ready" };

export async function createShare(
  db: Db,
  claims: Claims,
  args: { tripId: string; kind: ShareKind; subjectId: string },
): Promise<CreateShareResult> {
  const now = new Date();
  // 1. Read as the caller so RLS decides what they can see.
  const read = await withSession(db, claims, async (tx) => {
    const who = await callerMember(tx, claims, args.tripId);
    if (!who) return null;
    const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, args.tripId));
    if (!trip) return null;
    if (args.kind === "idea") {
      const [idea] = await tx
        .select()
        .from(ideas)
        .where(and(eq(ideas.id, args.subjectId), eq(ideas.tripId, args.tripId)));
      if (!idea) return null;
      const [src] = await tx
        .select({ thumb: ideaSources.thumbnailUrl })
        .from(ideaSources)
        .where(eq(ideaSources.ideaId, idea.id))
        .limit(1);
      return { who, input: { kind: "idea" as const, tripName: trip.name, idea: { title: idea.title, category: idea.category, city: idea.cityHint, summary: idea.summary, imageUrl: src?.thumb ?? null, hiddenFrom: idea.hiddenFrom } } };
    }
    if (args.kind === "poll" || args.kind === "decision") {
      const [poll] = await tx
        .select()
        .from(polls)
        .where(and(eq(polls.id, args.subjectId), eq(polls.tripId, args.tripId)));
      if (!poll) return null;
      const options = await pollOptionLabels(tx, poll.id);
      if (args.kind === "poll") {
        return { who, poll, input: { kind: "poll" as const, tripName: trip.name, poll: { question: poll.question, closesAt: poll.closesAt, options: options.map((o) => o.label), hiddenFrom: poll.hiddenFrom } } };
      }
      const winner = options.find((o) => o.id === poll.winningOptionId)?.label ?? null;
      return { who, poll, input: { kind: "decision" as const, tripName: trip.name, poll: { question: poll.question, winner, hiddenFrom: poll.hiddenFrom } } };
    }
    // digest: the subject is the frozen digest card itself (made by the daily job).
    return { who, digestCardId: args.subjectId };
  });
  if (!read) return { ok: false, error: "not_found" };

  if ("digestCardId" in read) {
    const card = await asService(db, async (tx) => {
      const [c] = await tx
        .select()
        .from(shareCards)
        .where(and(eq(shareCards.id, read.digestCardId!), eq(shareCards.tripId, args.tripId), eq(shareCards.kind, "digest"), isNull(shareCards.revokedAt)));
      if (c && !c.sharedAt) await tx.update(shareCards).set({ sharedAt: now }).where(eq(shareCards.id, c.id));
      return c;
    });
    if (!card) return { ok: false, error: "not_found" };
    const url = `${appUrl()}${shareRoutes.page("digest", card.id)}`;
    return { ok: true, shareId: card.id, url, message: shareMessage(card.snapshot as ShareSnapshot, url) };
  }

  // 2. Freeze a group-safe snapshot (refuses surprise items).
  let snapshot: ShareSnapshot;
  try {
    snapshot = buildShareSnapshot(read.input);
  } catch (e) {
    if (e instanceof ShareRefusedError) return { ok: false, error: e.reason === "surprise" ? "surprise" : "not_ready" };
    throw e;
  }

  // 3. Store as the service; a poll counts as shared for the FR-80c timer.
  const shareId = await asService(db, async (tx) => {
    const [row] = await tx
      .insert(shareCards)
      .values({ tripId: args.tripId, kind: args.kind, subjectId: args.subjectId, snapshot, createdByMemberId: read.who.me.id, sharedAt: now })
      .returning({ id: shareCards.id });
    if (args.kind === "poll") await markPollShared(tx, args.subjectId, now);
    return row!.id;
  });
  const url = `${appUrl()}${shareRoutes.page(args.kind, shareId)}`;
  return { ok: true, shareId, url, message: shareMessage(snapshot, url) };
}

/** Public: the frozen card, or null if unknown, revoked, deleted or since made a surprise. */
export async function getPublicShare(
  db: Db,
  kind: string,
  id: string,
): Promise<{ snapshot: ShareSnapshot; tripId: string; createdAt: Date } | null> {
  if (!isShareKind(kind) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return asService(db, async (tx) => {
    const [card] = await tx
      .select()
      .from(shareCards)
      .where(and(eq(shareCards.id, id), eq(shareCards.kind, kind), isNull(shareCards.revokedAt)));
    if (!card) return null;
    if (card.subjectId && kind === "idea") {
      const [i] = await tx.select({ h: ideas.hiddenFrom, s: ideas.status }).from(ideas).where(eq(ideas.id, card.subjectId));
      if (!i || i.h.length > 0) return null;
    }
    if (card.subjectId && (kind === "poll" || kind === "decision")) {
      const [p] = await tx.select({ h: polls.hiddenFrom }).from(polls).where(eq(polls.id, card.subjectId));
      if (!p || p.h.length > 0) return null;
    }
    return { snapshot: card.snapshot as ShareSnapshot, tripId: card.tripId, createdAt: card.createdAt };
  });
}

export type ShareMoment = {
  kind: ShareKind;
  subjectId: string;
  title: string;
  why: string;
};

/**
 * What's worth sharing now. Prompts (FR-80a) go to organizers only; everyone gets the recent
 * ideas list ("any member can share"). Nothing hidden from anyone is ever listed.
 */
export async function shareMoments(
  db: Db,
  claims: Claims,
  tripId: string,
  now = new Date(),
): Promise<{ prompts: ShareMoment[]; ideas: ShareMoment[]; label: string; isOrganizer: boolean } | null> {
  const DAY = 86_400_000;
  const ctx = await withSession(db, claims, async (tx) => {
    const who = await callerMember(tx, claims, tripId);
    if (!who) return null;
    const isOrganizer = who.me.role !== "member";
    const size = tripSize(who.active.length);
    const label = sharePromptLabel(size, who.active.filter((m) => m.id !== who.me.id).map((m) => m.name));
    const recentIdeas = await tx
      .select({ id: ideas.id, title: ideas.title, hiddenFrom: ideas.hiddenFrom })
      .from(ideas)
      .where(
        and(
          eq(ideas.tripId, tripId),
          gte(ideas.createdAt, new Date(now.getTime() - 3 * DAY)),
          inArray(ideas.extraction, ["resolved", "needs_review"]),
        ),
      )
      .orderBy(desc(ideas.createdAt))
      .limit(8);
    const openPolls = isOrganizer
      ? await tx
          .select()
          .from(polls)
          .where(and(eq(polls.tripId, tripId), isNull(polls.closedAt), isNull(polls.sharedAt), or(isNull(polls.closesAt), gt(polls.closesAt, now))))
      : [];
    const decided = isOrganizer ? await recentDecisions(tx, tripId, new Date(now.getTime() - 3 * DAY)) : [];
    return { isOrganizer, size, label, recentIdeas, openPolls, decided };
  });
  if (!ctx || ctx.size === "solo") return null;

  const prompts: ShareMoment[] = [];
  if (ctx.isOrganizer) {
    const svc = await asService(db, async (tx) => {
      const digests = await tx
        .select()
        .from(shareCards)
        .where(
          and(
            eq(shareCards.tripId, tripId),
            eq(shareCards.kind, "digest"),
            isNull(shareCards.sharedAt),
            isNull(shareCards.revokedAt),
            gte(shareCards.createdAt, new Date(now.getTime() - DAY)),
          ),
        );
      const decisionShares = ctx.decided.length
        ? await tx
            .select({ subjectId: shareCards.subjectId })
            .from(shareCards)
            .where(and(eq(shareCards.tripId, tripId), eq(shareCards.kind, "decision"), inArray(shareCards.subjectId, ctx.decided.map((d) => d.id))))
        : [];
      return { digests, decisionShares: new Set(decisionShares.map((d) => d.subjectId)) };
    });
    for (const d of svc.digests) {
      const s = d.snapshot as ShareSnapshot;
      if (s.kind === "digest") prompts.push({ kind: "digest", subjectId: d.id, title: `${s.count} new idea${s.count === 1 ? "" : "s"} today`, why: "Today's ideas" });
    }
    for (const p of ctx.openPolls) {
      if (p.hiddenFrom.length > 0) continue; // surprise polls go by personal text only (FR-80d)
      prompts.push({ kind: "poll", subjectId: p.id, title: p.question, why: "New vote" });
    }
    for (const p of ctx.decided) {
      if (p.hiddenFrom.length > 0 || svc.decisionShares.has(p.id)) continue;
      prompts.push({ kind: "decision", subjectId: p.id, title: p.question, why: "Decided" });
    }
  }
  const ideaMoments = ctx.recentIdeas
    .filter((i) => i.hiddenFrom.length === 0)
    .map((i) => ({ kind: "idea" as const, subjectId: i.id, title: i.title, why: "New idea" }));
  return { prompts, ideas: ideaMoments, label: ctx.label, isOrganizer: ctx.isOrganizer };
}
