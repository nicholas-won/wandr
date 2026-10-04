/**
 * Push notifications for native app users (FR-87; D65 keeps texts to codes and invites, so push
 * is how app users hear about trip activity; D75).
 *
 * Rules:
 * - Only people who registered an Expo push token get anything; nobody is texted from here.
 * - Surprise safety (FR-91, FR-80d): an item hidden from someone is never pushed to them, and in
 *   bach mode new-idea pushes skip guests of honor entirely (an idea can be hidden right after
 *   it's added, so its title must not race ahead of the organizer).
 * - Never a phone number. Money amounts only to the person they belong to (private push).
 * - Throttle: at most PUSH_DAILY_CAP_PER_TRIP non-urgent pushes per person per trip per 24 h.
 *   Time-sensitive pushes (join requests, polls closing soon) bypass the cap.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { money } from "@wandr/core";
import {
  asService,
  expensePayers,
  expenses,
  expenseShares,
  ideas,
  ideaSources,
  members,
  notificationKeys,
  pollVotes,
  polls,
  pushLog,
  pushTokens,
  trips,
  type Db,
} from "@wandr/db";
import { appUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { getMoneyOverview } from "./expenses";

export const PUSH_DAILY_CAP_PER_TRIP = 5;
export const POLL_CLOSING_WINDOW_MS = 3 * 60 * 60 * 1000;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100;
const DAY_MS = 86_400_000;

export type PushKind = "idea_added" | "join_request" | "poll_closing" | "money";
export type PushMessage = { title: string; body: string; url: string };

export type ExpoMessage = { to: string; title: string; body: string; data: { url: string }; sound: "default" };
export type ExpoTicket = { status: "ok"; id?: string } | { status: "error"; message?: string; details?: { error?: string } };

/** Delivers one batch (≤100) and returns one ticket per message, in order. */
export interface PushSender {
  send(messages: ExpoMessage[]): Promise<ExpoTicket[]>;
}

export const expoPushSender: PushSender = {
  async send(messages) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`Expo push failed (${res.status})`);
    const json = (await res.json()) as { data?: ExpoTicket[] };
    return json.data ?? [];
  },
};

let sender: PushSender = expoPushSender;

/** Test hook: inject a fake sender (null restores Expo). */
export function setPushSenderForTests(s: PushSender | null) {
  sender = s ?? expoPushSender;
}

/** Pure: who may get a non-urgent push, given how many they've had on this trip in 24 h. */
export function underDailyCap(sentToday: number, timeSensitive: boolean, cap = PUSH_DAILY_CAP_PER_TRIP): boolean {
  return timeSensitive || sentToday < cap;
}

const tripUrl = (tripId: string) => `${appUrl()}${routes.trip(tripId)}`;

/**
 * Send one message to these people's devices. Applies the per-trip daily cap, logs each person
 * pushed, and forgets tokens Expo reports as DeviceNotRegistered. Never throws.
 */
export async function sendPush(
  db: Db,
  userIds: string[],
  msg: PushMessage,
  opts: { kind: PushKind; tripId: string | null; timeSensitive?: boolean; now?: Date },
): Promise<{ pushedUserIds: string[] }> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { pushedUserIds: [] };
  const now = opts.now ?? new Date();
  const timeSensitive = !!opts.timeSensitive;
  try {
    const targets = await asService(db, async (tx) => {
      const tokens = await tx
        .select({ userId: pushTokens.userId, token: pushTokens.token })
        .from(pushTokens)
        .where(inArray(pushTokens.userId, ids));
      if (tokens.length === 0) return [];
      let allowed = new Set(tokens.map((t) => t.userId));
      if (!timeSensitive && opts.tripId) {
        const counts = await tx
          .select({ userId: pushLog.userId, n: sql<number>`count(*)::int` })
          .from(pushLog)
          .where(
            and(
              inArray(pushLog.userId, [...allowed]),
              eq(pushLog.tripId, opts.tripId),
              eq(pushLog.timeSensitive, false),
              gte(pushLog.createdAt, new Date(now.getTime() - DAY_MS)),
            ),
          )
          .groupBy(pushLog.userId);
        const sent = new Map(counts.map((c) => [c.userId, c.n]));
        allowed = new Set([...allowed].filter((u) => underDailyCap(sent.get(u) ?? 0, false)));
      }
      if (allowed.size === 0) return [];
      await tx.insert(pushLog).values(
        [...allowed].map((userId) => ({ userId, tripId: opts.tripId, kind: opts.kind, timeSensitive, createdAt: now })),
      );
      return tokens.filter((t) => allowed.has(t.userId));
    });
    if (targets.length === 0) return { pushedUserIds: [] };

    const dead: string[] = [];
    for (let i = 0; i < targets.length; i += EXPO_BATCH) {
      const batch = targets.slice(i, i + EXPO_BATCH);
      const tickets = await sender.send(
        batch.map((t) => ({ to: t.token, title: msg.title, body: msg.body, data: { url: msg.url }, sound: "default" })),
      );
      tickets.forEach((ticket, j) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") dead.push(batch[j]!.token);
      });
    }
    if (dead.length) await asService(db, (tx) => tx.delete(pushTokens).where(inArray(pushTokens.token, dead)));
    return { pushedUserIds: [...new Set(targets.map((t) => t.userId))] };
  } catch (err) {
    console.error("[push] send failed", opts.kind, err);
    return { pushedUserIds: [] };
  }
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** A new idea in a trip: tell the other members who have the app (not the sharer, never hidden members). */
export async function notifyIdeaAdded(db: Db, ideaId: string): Promise<{ pushedUserIds: string[] }> {
  const ctx = await asService(db, async (tx) => {
    const [idea] = await tx.select().from(ideas).where(eq(ideas.id, ideaId));
    if (!idea) return null; // merged into an earlier card (FR-22): that one was already announced
    const [trip] = await tx.select({ name: trips.name, bachMode: trips.bachMode, deletedAt: trips.deletedAt }).from(trips).where(eq(trips.id, idea.tripId));
    if (!trip || trip.deletedAt) return null;
    const [source] = await tx.select({ by: ideaSources.sharedByMemberId }).from(ideaSources).where(eq(ideaSources.ideaId, ideaId)).limit(1);
    const sharerId = source?.by ?? idea.createdByMemberId;
    const rows = await tx
      .select({ id: members.id, userId: members.userId, name: members.displayName, goh: members.isGuestOfHonor })
      .from(members)
      .where(and(eq(members.tripId, idea.tripId), eq(members.status, "active")));
    const hidden = new Set(idea.hiddenFrom);
    const sharer = rows.find((m) => m.id === sharerId);
    const recipients = rows
      .filter((m) => m.userId && m.id !== sharerId && !hidden.has(m.id) && !(trip.bachMode && m.goh))
      .map((m) => m.userId!);
    return { idea, trip, sharerName: sharer?.name ?? "Someone", recipients };
  });
  if (!ctx || ctx.recipients.length === 0) return { pushedUserIds: [] };
  const what = ctx.idea.extraction === "processing" || ctx.idea.extraction === "failed" ? "an idea" : ctx.idea.title;
  return sendPush(
    db,
    ctx.recipients,
    { title: ctx.trip.name, body: `${ctx.sharerName} added ${what}. Vote on it.`, url: tripUrl(ctx.idea.tripId) },
    { kind: "idea_added", tripId: ctx.idea.tripId },
  );
}

/** Someone asked to join through the group link (FR-6): tell the organizers. Time-sensitive. */
export async function notifyJoinRequest(db: Db, tripId: string, pendingMemberId: string): Promise<{ pushedUserIds: string[] }> {
  const ctx = await asService(db, async (tx) => {
    const [pending] = await tx.select({ name: members.displayName, status: members.status }).from(members).where(eq(members.id, pendingMemberId));
    const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId));
    if (!pending || pending.status !== "pending" || !trip) return null;
    const orgs = await tx
      .select({ userId: members.userId, role: members.role })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.status, "active")));
    return {
      name: pending.name,
      trip: trip.name,
      recipients: orgs.filter((m) => m.userId && m.role !== "member").map((m) => m.userId!),
    };
  });
  if (!ctx) return { pushedUserIds: [] };
  return sendPush(
    db,
    ctx.recipients,
    { title: ctx.trip, body: `${ctx.name} asked to join. Approve or decline.`, url: `${tripUrl(tripId)}/people` },
    { kind: "join_request", tripId, timeSensitive: true },
  );
}

/**
 * Polls closing within 3 h (FR-47/48): remind members who haven't voted, once per poll. Only the
 * person themselves is told; nobody learns who hasn't voted (FR-42). Run from a cron.
 */
export async function notifyPollsClosingSoon(db: Db, now: Date = new Date()): Promise<number> {
  const due = await asService(db, async (tx) => {
    const open = await tx
      .select({ id: polls.id, tripId: polls.tripId, question: polls.question, hiddenFrom: polls.hiddenFrom, tripName: trips.name })
      .from(polls)
      .innerJoin(trips, eq(trips.id, polls.tripId))
      .where(
        and(
          isNull(polls.closedAt),
          isNull(polls.pausedAt),
          isNull(trips.deletedAt),
          gte(polls.closesAt, now),
          lte(polls.closesAt, new Date(now.getTime() + POLL_CLOSING_WINDOW_MS)),
        ),
      );
    const out: { poll: (typeof open)[number]; userIds: string[] }[] = [];
    for (const poll of open) {
      const voted = new Set(
        (await tx.select({ m: pollVotes.memberId }).from(pollVotes).where(eq(pollVotes.pollId, poll.id))).map((r) => r.m),
      );
      const hidden = new Set(poll.hiddenFrom);
      const rows = await tx
        .select({ id: members.id, userId: members.userId })
        .from(members)
        .where(and(eq(members.tripId, poll.tripId), eq(members.status, "active")));
      const userIds: string[] = [];
      for (const m of rows) {
        if (!m.userId || voted.has(m.id) || hidden.has(m.id)) continue;
        const [fresh] = await tx
          .insert(notificationKeys)
          .values({ key: `push_poll_closing:${poll.id}:${m.id}`, tripId: poll.tripId })
          .onConflictDoNothing()
          .returning({ key: notificationKeys.key });
        if (fresh) userIds.push(m.userId);
      }
      if (userIds.length) out.push({ poll, userIds });
    }
    return out;
  });
  let n = 0;
  for (const { poll, userIds } of due) {
    const r = await sendPush(
      db,
      userIds,
      { title: poll.tripName, body: `Closing soon: ${poll.question}`, url: `${tripUrl(poll.tripId)}/polls/${poll.id}` },
      { kind: "poll_closing", tripId: poll.tripId, timeSensitive: true, now },
    );
    n += r.pushedUserIds.length;
  }
  return n;
}

/** "You owe $12.50" / "You're owed $40.00" per currency, from the person's own settle lines. */
export function balanceLine(mine: { currency: string; direction: "you_owe" | "owes_you"; amountMinor: number }[]): string {
  const net = new Map<string, number>();
  for (const l of mine) net.set(l.currency, (net.get(l.currency) ?? 0) + (l.direction === "owes_you" ? l.amountMinor : -l.amountMinor));
  const parts = [...net].filter(([, v]) => v !== 0);
  if (parts.length === 0) return "You're all square.";
  const owe = parts.filter(([, v]) => v < 0).map(([c, v]) => money.formatMinor(-v, c));
  const owed = parts.filter(([, v]) => v > 0).map(([c, v]) => money.formatMinor(v, c));
  return [owe.length ? `You owe ${owe.join(" + ")}.` : null, owed.length ? `You're owed ${owed.join(" + ")}.` : null]
    .filter(Boolean)
    .join(" ");
}

/**
 * An expense changed (FR-68, MT1 in-app money activity): tell the people on it what they now owe
 * or are owed. Each person's figure is read as them (RLS), so it never includes anything hidden
 * from them; people the expense is hidden from (FR-91) and the person who made the change get nothing.
 */
export async function notifyMoneyChange(
  db: Db,
  args: { tripId: string; expenseId: string; actorUserId?: string | null },
): Promise<{ pushedUserIds: string[] }> {
  const ctx = await asService(db, async (tx) => {
    const [e] = await tx.select().from(expenses).where(and(eq(expenses.id, args.expenseId), eq(expenses.tripId, args.tripId)));
    if (!e || e.personalMemberId) return null; // personal-only expenses (Q23c) affect nobody else
    const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, args.tripId));
    const shareIds = (await tx.select({ m: expenseShares.memberId }).from(expenseShares).where(eq(expenseShares.expenseId, e.id))).map((r) => r.m);
    const payerIds = (await tx.select({ m: expensePayers.memberId }).from(expensePayers).where(eq(expensePayers.expenseId, e.id))).map((r) => r.m);
    const involved = new Set([e.paidByMemberId, ...shareIds, ...payerIds]);
    const hidden = new Set(e.hiddenFrom);
    const rows = await tx
      .select({ id: members.id, userId: members.userId })
      .from(members)
      .where(and(eq(members.tripId, args.tripId), eq(members.status, "active")));
    const recipients = rows
      .filter((m) => m.userId && involved.has(m.id) && !hidden.has(m.id) && m.userId !== args.actorUserId)
      .map((m) => m.userId!);
    return { merchant: e.merchant, tripName: trip?.name ?? "Your trip", recipients };
  });
  if (!ctx || ctx.recipients.length === 0) return { pushedUserIds: [] };
  const pushed: string[] = [];
  for (const userId of ctx.recipients) {
    let line: string;
    try {
      line = balanceLine((await getMoneyOverview(db, { sub: userId }, args.tripId)).mine);
    } catch {
      continue; // can't read the trip's money as them: say nothing
    }
    const r = await sendPush(
      db,
      [userId],
      { title: ctx.tripName, body: `Money update (${ctx.merchant}). ${line}`, url: `${tripUrl(args.tripId)}/money` },
      { kind: "money", tripId: args.tripId },
    );
    pushed.push(...r.pushedUserIds);
  }
  return { pushedUserIds: pushed };
}
