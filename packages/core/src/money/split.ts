import { allocate, compareIds } from "./allocate";
import { assertCurrency, assertMinor, type CurrencyCode } from "./currency";
import { MoneyError } from "./errors";
import type { MemberId, Share, Split } from "./types";

/** Validates and sorts a member-id list; throws on empty ids or duplicates. */
export function normalizeMemberIds(ids: readonly MemberId[], label = "members"): MemberId[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) {
      throw new MoneyError("UNKNOWN_MEMBER", `${label}: member ids must be non-empty strings`);
    }
    if (seen.has(id)) {
      throw new MoneyError("DUPLICATE_MEMBER", `${label}: duplicate member ${id}`, { memberId: id });
    }
    seen.add(id);
  }
  return [...ids].sort(compareIds);
}

/** Throws unless the split is internally consistent (sorted, unique, sums to total). */
export function assertValidSplit(split: Split): void {
  assertCurrency(split.currency);
  assertMinor(split.totalMinor, "totalMinor");
  let sum = 0n;
  let prev: string | undefined;
  for (const s of split.shares) {
    assertMinor(s.shareMinor, "shareMinor");
    if (prev !== undefined && compareIds(prev, s.memberId) >= 0) {
      throw new MoneyError("DUPLICATE_MEMBER", "Shares must be sorted by memberId with no duplicates", {
        memberId: s.memberId,
      });
    }
    prev = s.memberId;
    sum += BigInt(s.shareMinor);
  }
  if (sum !== BigInt(split.totalMinor)) {
    throw new MoneyError("SHARES_DO_NOT_SUM", "Shares do not sum to the expense total", {
      totalMinor: split.totalMinor,
      sharesMinor: sum.toString(),
    });
  }
}

export interface EvenSplitInput {
  totalMinor: number;
  currency: CurrencyCode;
  /**
   * The selected people (FR-62). The caller supplies the default, which is the
   * people attending the expense's Stop (D19); this function does not look it up.
   */
  participantIds: readonly MemberId[];
  /** Members flagged guest of honor (FR-90): excluded, their share spread over the rest. */
  guestOfHonorIds?: readonly MemberId[];
  /** See `AllocateOptions.tieBreakStart`. Default 0 (lowest member id gets leftover pennies first). */
  tieBreakStart?: number;
}

export interface EvenSplit extends Split {
  /** Participants who were dropped because they are guests of honor. */
  excludedGuestOfHonorIds: MemberId[];
}

/**
 * Even split among the selected people (FR-62). Leftover pennies go to members
 * in ascending member-id order (rotated by `tieBreakStart`).
 *
 * Errors: NO_PARTICIPANTS (empty selection), DUPLICATE_MEMBER,
 * ALL_GUESTS_OF_HONOR (everyone selected is a guest of honor).
 */
export function splitEven(input: EvenSplitInput): EvenSplit {
  assertCurrency(input.currency);
  assertMinor(input.totalMinor, "totalMinor");
  const participants = normalizeMemberIds(input.participantIds, "participants");
  if (participants.length === 0) {
    throw new MoneyError("NO_PARTICIPANTS", "Select at least one person to split with");
  }
  const goh = new Set(input.guestOfHonorIds ?? []);
  const payers = participants.filter((id) => !goh.has(id));
  const excluded = participants.filter((id) => goh.has(id));
  if (payers.length === 0) {
    throw new MoneyError(
      "ALL_GUESTS_OF_HONOR",
      "Everyone in this split is a guest of honor; someone has to pay",
    );
  }
  const parts = allocate(
    input.totalMinor,
    payers.map(() => 1),
    input.tieBreakStart === undefined ? {} : { tieBreakStart: input.tieBreakStart },
  );
  return {
    currency: input.currency,
    totalMinor: input.totalMinor,
    shares: payers.map((memberId, i) => ({ memberId, shareMinor: parts[i]! })),
    excludedGuestOfHonorIds: excluded,
  };
}

/**
 * "Paid by me, for me" (FR-T10; split method `just_me`). Solo trips record every
 * expense this way. The whole amount is the member's own share, so it never moves
 * a balance (credit and debit cancel), but it counts toward their spend (FR-65).
 */
export function splitJustMe(input: { totalMinor: number; currency: CurrencyCode; memberId: MemberId }): Split {
  assertCurrency(input.currency);
  assertMinor(input.totalMinor, "totalMinor");
  normalizeMemberIds([input.memberId]);
  return {
    currency: input.currency,
    totalMinor: input.totalMinor,
    shares: [{ memberId: input.memberId, shareMinor: input.totalMinor }],
  };
}

/**
 * Splits `totalMinor` proportionally to existing shares (or any integer weights
 * keyed by member). Used for refunds, redistribution and adjustments. Members
 * with weight 0 keep a share of 0 (and are kept in the output).
 */
export function splitByWeights(input: {
  totalMinor: number;
  currency: CurrencyCode;
  weights: readonly { memberId: MemberId; weight: number }[];
  tieBreakStart?: number;
}): Split {
  assertCurrency(input.currency);
  assertMinor(input.totalMinor, "totalMinor");
  const sorted = [...input.weights].sort((a, b) => compareIds(a.memberId, b.memberId));
  normalizeMemberIds(sorted.map((w) => w.memberId), "weights");
  if (sorted.length === 0) throw new MoneyError("NO_PARTICIPANTS", "No members to split across");
  const parts = allocate(
    input.totalMinor,
    sorted.map((w) => w.weight),
    input.tieBreakStart === undefined ? {} : { tieBreakStart: input.tieBreakStart },
  );
  return {
    currency: input.currency,
    totalMinor: input.totalMinor,
    shares: sorted.map((w, i) => ({ memberId: w.memberId, shareMinor: parts[i]! })),
  };
}

/** Sorts shares and merges duplicates (summing them); drops nothing. */
export function mergeShares(shares: readonly Share[]): Share[] {
  const m = new Map<string, bigint>();
  for (const s of shares) {
    assertMinor(s.shareMinor, "shareMinor");
    m.set(s.memberId, (m.get(s.memberId) ?? 0n) + BigInt(s.shareMinor));
  }
  return [...m.keys()].sort(compareIds).map((memberId) => {
    const v = m.get(memberId)!;
    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new MoneyError("UNSAFE_INTEGER", "Merged share overflows", { memberId });
    }
    return { memberId, shareMinor: Number(v) };
  });
}
