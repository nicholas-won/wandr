/**
 * Joining, approvals, removal and size-change notices (REQUIREMENTS §6.1 FR-6..FR-11, FR-17,
 * §6.10 FR-T3..T5; edge cases J-7, J-8, J-9, J-17, M-1..M-4, M-11). Pure functions.
 */
import { allocate, compareIds } from "./money/allocate";
import { validateAdjustmentSet } from "./money/adjustments";
import type { Balances } from "./money/balances";
import type { AdjustmentEntry } from "./money/types";
import { toMs, type Instant, type MemberId, type MemberStatus, type TripSize } from "./domain";
import { transitionNotices, tripSize, type SizeNoticeId } from "./trip-size";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Limits for the group link (J-7). The only cap on join requests is the open-request pause (JR6:
 * no per-hour/per-day limits). SMS-code rate limits (FR-15) live with sign-in, not here.
 */
export const JOIN_LIMITS = {
  /** Open (unexpired) pending requests at which the link pauses itself (J-7, JR5). */
  pendingCap: 20,
  /** Pending requests expire after this many days (J-7). */
  pendingTtlDays: 14,
  /** "Restore member" window (M-11). */
  restoreWindowDays: 30,
  /** FR-17 minimum age to join with your own number. */
  minimumAge: 13,
} as const;

export function isPendingExpired(requestedAt: Instant, now: Instant = Date.now()): boolean {
  return toMs(now) - toMs(requestedAt) >= JOIN_LIMITS.pendingTtlDays * DAY;
}

/** M-11: a member who had joined (not a denied request) and was removed within the window. */
export function canRestore(
  m: { status: MemberStatus; removedAt: Instant | null; joinedAt: Instant | null },
  now: Instant = Date.now(),
): boolean {
  if (m.status !== "removed" || !m.removedAt || !m.joinedAt) return false;
  return toMs(now) - toMs(m.removedAt) < JOIN_LIMITS.restoreWindowDays * DAY;
}

// ---------------------------------------------------------------------------
// Group link (FR-6, FR-7, J-7, J-8, J-9)
// ---------------------------------------------------------------------------

export interface GroupJoinInput {
  /** The group link is on (not regenerated away or auto-paused). */
  linkActive: boolean;
  inviteListOnly: boolean;
  /** The caller's existing member row in this trip (by verified user), if any. */
  existing: { status: MemberStatus } | null;
  /** An invite-list row whose phone/email matches the caller's verified contact (J-8). */
  invitedMatch: { memberId: MemberId; displayName: string } | null;
  /** Open (unexpired) pending requests in the trip. */
  openPending: number;
}

export type GroupJoinDecision =
  | { kind: "already_member" }
  | { kind: "already_pending" }
  /** J-8: confirm "Are you Jess?" before joining as that invitee. */
  | { kind: "confirm_name"; memberId: MemberId; expectedName: string }
  | { kind: "request" }
  /** FR-7 / J-9: unknown numbers see "Ask the organizer to add you". Also used after a denial or removal. */
  | { kind: "ask_organizer" }
  /** The link was replaced, or it is paused at the open-request cap (J-7, JR5). */
  | { kind: "link_off" };

/**
 * What happens when a verified person uses the group link. Evaluated only after the code is
 * verified, so the answer never reveals whether a number is on the invite list (J-17).
 */
export function decideGroupJoin(i: GroupJoinInput): GroupJoinDecision {
  if (i.existing) {
    switch (i.existing.status) {
      case "active":
      case "not_attending":
        return { kind: "already_member" };
      case "pending":
        return { kind: "already_pending" };
      case "removed":
        // Denied or removed: only an organizer can bring them back (restore / re-invite).
        return { kind: "ask_organizer" };
      case "invited":
        break; // an invite row already linked to this user: treat as the invite match
    }
  }
  if (!i.linkActive) return { kind: "link_off" };
  if (i.invitedMatch) {
    return { kind: "confirm_name", memberId: i.invitedMatch.memberId, expectedName: i.invitedMatch.displayName };
  }
  if (i.inviteListOnly) return { kind: "ask_organizer" };
  if (isGroupLinkPaused(i.openPending)) return { kind: "link_off" };
  return { kind: "request" };
}

/**
 * J-7 / JR5: the group link is paused while open requests are at the cap, and turns back on by
 * itself once requests are approved, denied or expire below the cap. Derived from the count, so
 * there is no stored "paused" flag to clear.
 */
export function isGroupLinkPaused(openPending: number): boolean {
  return openPending >= JOIN_LIMITS.pendingCap;
}

/** J-7: this request just brought open requests to the cap (record the pause once, JR12). */
export function shouldPauseAfterRequest(openPendingIncludingNew: number): boolean {
  return openPendingIncludingNew === JOIN_LIMITS.pendingCap;
}

// ---------------------------------------------------------------------------
// Removal with an open balance (FR-9, D24, M-1, M-2, M-4)
// ---------------------------------------------------------------------------

export type BalanceResolution =
  /** Move the whole balance to one other member. */
  | { kind: "reassign"; toMemberId: MemberId }
  /** Spread it evenly over the remaining active members. */
  | { kind: "split_group" }
  /**
   * Forgive it: the people on the other side of the balance absorb it in proportion to what
   * they're owed (or owe). Nobody outside that side is touched.
   */
  | { kind: "write_off" };

/** Non-zero balances for one member, per currency (sorted by currency). */
export function openBalancesFor(balances: Balances, memberId: MemberId): { currency: string; balanceMinor: number }[] {
  return Object.keys(balances)
    .sort()
    .map((currency) => ({ currency, balanceMinor: balances[currency]?.[memberId] ?? 0 }))
    .filter((b) => b.balanceMinor !== 0);
}

export class ResolutionError extends Error {
  constructor(
    public readonly code: "no_one_to_absorb" | "bad_target",
    message: string = code,
  ) {
    super(message);
    this.name = "ResolutionError";
  }
}

/**
 * Adjustment entries that bring `leaverId`'s balance to zero in every currency (FR-9). Each
 * currency's entries sum to zero, so the ledger stays balanced (FR-69). `remaining` are the
 * members who stay (active, excluding the leaver); they are the pool for split_group.
 */
export function planBalanceResolution(
  balances: Balances,
  leaverId: MemberId,
  resolution: BalanceResolution,
  remaining: readonly MemberId[],
): AdjustmentEntry[] {
  const pool = [...new Set(remaining)].filter((m) => m !== leaverId).sort(compareIds);
  const out: AdjustmentEntry[] = [];
  for (const { currency, balanceMinor } of openBalancesFor(balances, leaverId)) {
    // Leaver's entry cancels their balance; others together take +balance.
    out.push({ memberId: leaverId, currency, deltaMinor: -balanceMinor });
    let targets: MemberId[];
    let weights: number[];
    if (resolution.kind === "reassign") {
      if (resolution.toMemberId === leaverId || !pool.includes(resolution.toMemberId)) {
        throw new ResolutionError("bad_target");
      }
      targets = [resolution.toMemberId];
      weights = [1];
    } else if (resolution.kind === "split_group") {
      targets = pool;
      weights = pool.map(() => 1);
    } else {
      const row = balances[currency] ?? {};
      // Counterparties: opposite sign to the leaver (any status: former members included).
      targets = Object.keys(row)
        .filter((m) => m !== leaverId && Math.sign(row[m]!) === -Math.sign(balanceMinor))
        .sort(compareIds);
      weights = targets.map((m) => Math.abs(row[m]!));
    }
    if (targets.length === 0) throw new ResolutionError("no_one_to_absorb");
    const parts = allocate(balanceMinor, weights);
    targets.forEach((memberId, i) => {
      if (parts[i] !== 0) out.push({ memberId, currency, deltaMinor: parts[i]! });
    });
  }
  validateAdjustmentSet(out, { allowMultipleCurrencies: true });
  return out;
}

// ---------------------------------------------------------------------------
// Size-change notices (FR-T4, FR-T5) from the membership history
// ---------------------------------------------------------------------------

/** A member becoming active (true) or inactive (false) at a time. */
export interface ActivityEvent {
  memberId: MemberId;
  at: Instant;
  active: boolean;
}

export interface SizeTransition {
  from: TripSize;
  to: TripSize;
  at: number;
  /** Active members just before the change. */
  before: MemberId[];
}

/**
 * Replays activity events (in time order; ties keep input order) and returns the last change of
 * trip size, or null if the size never changed. Size follows FR-T1 (active members only).
 */
export function lastSizeTransition(events: readonly ActivityEvent[]): SizeTransition | null {
  const sorted = events.map((e, i) => ({ ...e, t: toMs(e.at), i })).sort((a, b) => a.t - b.t || a.i - b.i);
  const active = new Set<MemberId>();
  let last: SizeTransition | null = null;
  for (const e of sorted) {
    const before = [...active];
    const from = tripSize(active.size);
    if (e.active) active.add(e.memberId);
    else active.delete(e.memberId);
    const to = tripSize(active.size);
    if (from !== to) last = { from, to, at: e.t, before };
  }
  return last;
}

/**
 * The one-time size notices a member should see now (FR-T4, FR-T5): only for the trip's latest
 * size change, only to people who were in the trip before it, and only if not seen yet.
 */
export function pendingSizeNotices(
  last: SizeTransition | null,
  currentSize: TripSize,
  memberId: MemberId,
  noticesSeen: readonly string[],
): SizeNoticeId[] {
  if (!last || last.to !== currentSize || !last.before.includes(memberId)) return [];
  return transitionNotices(last.from, last.to)
    .filter((n) => n.audience === "existing_members" && !noticesSeen.includes(n.id))
    .map((n) => n.id);
}
