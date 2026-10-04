import { allocate } from "./allocate";
import { assertMinor } from "./currency";
import { MoneyError } from "./errors";
import { allocOptions, assertValidSplit } from "./split";
import type { MemberId, Split } from "./types";

/**
 * Refunds are negative expenses that reuse the original split (FR-72, E-12).
 *
 * `refundMinor` is the positive amount returned. The result is a Split with a
 * negative total, allocated in proportion to the original shares (largest
 * remainder, symmetric for negatives). A full refund is the exact negation of
 * the original shares. The refund's payer should be the original payer (the
 * person the money went back to), so the ledger reverses cleanly.
 *
 * The original must have a positive total and no negative shares. A refund
 * larger than the original is rejected (REFUND_EXCEEDS_ORIGINAL).
 */
export function refundFromOriginal(
  original: Split,
  refundMinor: number,
  options: { tieBreakStart?: number; leftoverTo?: readonly MemberId[] } = {},
): Split {
  assertValidSplit(original);
  assertMinor(refundMinor, "refundMinor");
  if (refundMinor <= 0) {
    throw new MoneyError("INVALID_AMOUNT", "Enter the refund as a positive amount", { refundMinor });
  }
  if (original.totalMinor <= 0 || original.shares.some((s) => s.shareMinor < 0)) {
    throw new MoneyError("INVALID_AMOUNT", "Only a positive expense with non-negative shares can be refunded");
  }
  if (refundMinor > original.totalMinor) {
    throw new MoneyError("REFUND_EXCEEDS_ORIGINAL", "The refund is larger than the original expense", {
      refundMinor,
      originalMinor: original.totalMinor,
    });
  }
  const weights = original.shares.map((s) => s.shareMinor);
  const parts = allocate(
    -refundMinor,
    weights,
    allocOptions(
      original.shares.map((s) => s.memberId),
      weights,
      options,
    ),
  );
  return {
    currency: original.currency,
    totalMinor: -refundMinor,
    shares: original.shares.map((s, i) => ({ memberId: s.memberId, shareMinor: parts[i]! })),
  };
}
