import { allocateDetailed, compareIds, remainderIndex } from "./allocate";
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
  /**
   * Q18: who takes every leftover penny, in order of preference (e.g. [uploader, payer]). The
   * first one who is in the split gets them all; if none is, `tieBreakStart` decides.
   */
  leftoverTo?: readonly MemberId[];
}

/**
 * Q18: whether rounding was needed and who absorbed it. `leftoverMinor` is 0 when the
 * amount divided exactly; `memberId` is null when the default tie-break spread it.
 */
export interface Rounding {
  leftoverMinor: number;
  memberId: MemberId | null;
}

export interface EvenSplit extends Split {
  /** Participants who were dropped because they are guests of honor. */
  excludedGuestOfHonorIds: MemberId[];
  rounding: Rounding;
}

/** Builds `AllocateOptions` from the shared tieBreakStart / leftoverTo inputs. */
export function allocOptions(
  ids: readonly MemberId[],
  weights: readonly (number | bigint)[],
  o: { tieBreakStart?: number | undefined; leftoverTo?: readonly MemberId[] | undefined },
): { tieBreakStart?: number; remainderTo?: number } {
  const out: { tieBreakStart?: number; remainderTo?: number } = {};
  if (o.tieBreakStart !== undefined) out.tieBreakStart = o.tieBreakStart;
  const r = remainderIndex(ids, weights, o.leftoverTo);
  if (r !== undefined) out.remainderTo = r;
  return out;
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
  const weights = payers.map(() => 1);
  const d = allocateDetailed(input.totalMinor, weights, allocOptions(payers, weights, input));
  return {
    currency: input.currency,
    totalMinor: input.totalMinor,
    shares: payers.map((memberId, i) => ({ memberId, shareMinor: d.parts[i]! })),
    excludedGuestOfHonorIds: excluded,
    rounding: roundingOf(d, payers),
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
  leftoverTo?: readonly MemberId[];
}): Split & { rounding: Rounding } {
  assertCurrency(input.currency);
  assertMinor(input.totalMinor, "totalMinor");
  const sorted = [...input.weights].sort((a, b) => compareIds(a.memberId, b.memberId));
  normalizeMemberIds(sorted.map((w) => w.memberId), "weights");
  if (sorted.length === 0) throw new MoneyError("NO_PARTICIPANTS", "No members to split across");
  const ids = sorted.map((w) => w.memberId);
  const ws = sorted.map((w) => w.weight);
  const d = allocateDetailed(input.totalMinor, ws, allocOptions(ids, ws, input));
  return {
    currency: input.currency,
    totalMinor: input.totalMinor,
    shares: sorted.map((w, i) => ({ memberId: w.memberId, shareMinor: d.parts[i]! })),
    rounding: roundingOf(d, ids),
  };
}

/** Rounding info from an allocation over `ids`. */
export function roundingOf(d: { leftoverMinor: number; leftoverIndex: number | null }, ids: readonly MemberId[]): Rounding {
  return { leftoverMinor: d.leftoverMinor, memberId: d.leftoverIndex === null ? null : ids[d.leftoverIndex]! };
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
