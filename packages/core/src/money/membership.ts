import { allocate, compareIds } from "./allocate";
import { MoneyError } from "./errors";
import { assertValidSplit, mergeShares, normalizeMemberIds, splitEven } from "./split";
import type { MemberId, Split } from "./types";

/**
 * Membership changes that touch existing expenses: drop-outs (FR-13, M-8),
 * late joiners (FR-12, M-5) and solo expenses becoming shared (FR-T10).
 *
 * These functions return the NEW split. They never decide anything on their own:
 * the organizer picks per expense. If the expense is locked (FR-69), feed the
 * old and new versions to `adjustmentsForCorrection` instead of rewriting it.
 */

export type DropOutDecision = "keep" | "redistribute" | "refund_if_replaced";

export interface DropOutResult {
  split: Split;
  /**
   * Set for "refund_if_replaced": the share stays with the drop-out for now; when
   * a replacement joins, call {@link replaceMember} to move it to them.
   */
  pendingReplacement?: { memberId: MemberId; shareMinor: number };
}

/**
 * Applies the organizer's per-expense drop-out decision (FR-13).
 *
 * - keep: unchanged; they still owe their share (M-8 default).
 * - redistribute: their share is removed and spread over the others in
 *   proportion to the others' current shares (so an even split stays even,
 *   and an itemized split stays proportional). If `among` is given, it's spread
 *   evenly over exactly those people instead. If every remaining share is 0, it's
 *   spread evenly over the remaining members.
 * - refund_if_replaced: unchanged now, flagged for a future replacement.
 */
export function applyDropOut(
  split: Split,
  memberId: MemberId,
  decision: DropOutDecision,
  options: { among?: readonly MemberId[]; tieBreakStart?: number } = {},
): DropOutResult {
  assertValidSplit(split);
  const mine = split.shares.find((s) => s.memberId === memberId);
  if (!mine) {
    throw new MoneyError("UNKNOWN_MEMBER", "That member isn't part of this expense", { memberId });
  }
  if (decision === "keep") return { split };
  if (decision === "refund_if_replaced") {
    return { split, pendingReplacement: { memberId, shareMinor: mine.shareMinor } };
  }
  return { split: redistributeShare(split, memberId, options) };
}

/** Removes one member from a split and spreads their share over others (see {@link applyDropOut}). */
export function redistributeShare(
  split: Split,
  memberId: MemberId,
  options: { among?: readonly MemberId[]; tieBreakStart?: number } = {},
): Split {
  assertValidSplit(split);
  const mine = split.shares.find((s) => s.memberId === memberId);
  if (!mine) throw new MoneyError("UNKNOWN_MEMBER", "That member isn't part of this expense", { memberId });
  const rest = split.shares.filter((s) => s.memberId !== memberId);
  const opts = options.tieBreakStart === undefined ? {} : { tieBreakStart: options.tieBreakStart };

  let added: { memberId: MemberId; shareMinor: number }[];
  if (options.among) {
    const among = normalizeMemberIds(options.among, "among");
    if (among.includes(memberId)) {
      throw new MoneyError("UNKNOWN_MEMBER", "Can't redistribute a share back to the person dropping out");
    }
    added = splitEven({ totalMinor: mine.shareMinor, currency: split.currency, participantIds: among, ...opts }).shares;
  } else {
    if (rest.length === 0) {
      throw new MoneyError("NO_PARTICIPANTS", "No one else is on this expense to take over the share");
    }
    const sameSign = rest.every((s) => s.shareMinor >= 0);
    const weights = rest.map((s) => (sameSign ? s.shareMinor : 0));
    const useEven = !sameSign || weights.every((w) => w === 0);
    const parts = allocate(mine.shareMinor, useEven ? rest.map(() => 1) : weights, opts);
    added = rest.map((s, i) => ({ memberId: s.memberId, shareMinor: parts[i]! }));
  }
  const shares = mergeShares([...rest, ...added]);
  const result = { currency: split.currency, totalMinor: split.totalMinor, shares };
  assertValidSplit(result);
  return result;
}

/**
 * Moves one member's whole share to another (the "refund if replaced" follow-up,
 * FR-13). If the replacement is already on the expense the amounts are added.
 */
export function replaceMember(split: Split, fromMemberId: MemberId, toMemberId: MemberId): Split {
  assertValidSplit(split);
  if (fromMemberId === toMemberId) return split;
  if (!split.shares.some((s) => s.memberId === fromMemberId)) {
    throw new MoneyError("UNKNOWN_MEMBER", "That member isn't part of this expense", { memberId: fromMemberId });
  }
  normalizeMemberIds([toMemberId], "replacement");
  const shares = mergeShares(
    split.shares.map((s) => (s.memberId === fromMemberId ? { memberId: toMemberId, shareMinor: s.shareMinor } : s)),
  );
  return { currency: split.currency, totalMinor: split.totalMinor, shares };
}

/**
 * Re-splits an expense evenly among a new set of people. Used for:
 * - late joiners the organizer ticked on the checklist (FR-12): pass the
 *   current participants plus the new member(s);
 * - turning a solo "just me" expense into a shared one (FR-T10).
 * Guest-of-honor exclusion (FR-90) applies as in `splitEven`.
 */
export function resplitEvenly(
  split: Split,
  participantIds: readonly MemberId[],
  options: { guestOfHonorIds?: readonly MemberId[]; tieBreakStart?: number } = {},
): Split {
  assertValidSplit(split);
  const { excludedGuestOfHonorIds: _ignored, ...rest } = splitEven({
    totalMinor: split.totalMinor,
    currency: split.currency,
    participantIds,
    ...options,
  });
  return rest;
}

/**
 * Late joiner on an even expense (FR-12): current participants + new members,
 * re-split evenly. With default tie-breaking, existing members' shares never go
 * up (for non-negative totals; property-tested).
 */
export function addToEvenSplit(
  split: Split,
  newMemberIds: readonly MemberId[],
  options: { guestOfHonorIds?: readonly MemberId[]; tieBreakStart?: number } = {},
): Split {
  const current = split.shares.map((s) => s.memberId);
  const merged = [...new Set([...current, ...newMemberIds])].sort(compareIds);
  return resplitEvenly(split, merged, options);
}
