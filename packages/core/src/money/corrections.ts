import { compareIds } from "./allocate";
import { adjustmentsForCorrection, validateAdjustmentSet } from "./adjustments";
import { assertMinor, toSafeNumber } from "./currency";
import { MoneyError } from "./errors";
import type { AdjustmentEntry, LedgerExpense } from "./types";

/**
 * Repeated corrections to a locked expense (FR-69, E-22).
 *
 * `adjustmentsForCorrection(original, target)` gives the deltas from the ORIGINAL row to a
 * corrected version. After earlier corrections, the new entries must be relative to the
 * already-corrected state: (target - original) - (sum of prior entries). The result still
 * sums to zero in the expense currency. Zero deltas are dropped; sorted by member id.
 */
export function correctionAdjustments(
  original: LedgerExpense,
  prior: readonly AdjustmentEntry[],
  target: LedgerExpense,
): AdjustmentEntry[] {
  validateAdjustmentSet(prior);
  for (const p of prior) {
    if (p.currency !== original.currency) {
      throw new MoneyError("CURRENCY_MISMATCH", "Prior adjustments are in another currency");
    }
  }
  const full = adjustmentsForCorrection(original, target);
  const d = new Map<string, bigint>();
  for (const e of full) d.set(e.memberId, (d.get(e.memberId) ?? 0n) + BigInt(e.deltaMinor));
  for (const p of prior) d.set(p.memberId, (d.get(p.memberId) ?? 0n) - BigInt(p.deltaMinor));
  const out: AdjustmentEntry[] = [];
  for (const memberId of [...d.keys()].sort(compareIds)) {
    const v = d.get(memberId)!;
    if (v !== 0n) out.push({ memberId, currency: original.currency, deltaMinor: toSafeNumber(v, "deltaMinor") });
  }
  validateAdjustmentSet(out);
  return out;
}

/**
 * How much of an expense can still be refunded (FR-72, E-12): original total minus refunds
 * already recorded against it (refund totals are negative). Never below zero.
 */
export function refundableRemaining(originalTotalMinor: number, refundTotalsMinor: readonly number[]): number {
  assertMinor(originalTotalMinor, "originalTotalMinor");
  let left = BigInt(originalTotalMinor);
  for (const r of refundTotalsMinor) {
    assertMinor(r, "refund total");
    left += BigInt(r); // refunds are stored as negative totals
  }
  return left < 0n ? 0 : toSafeNumber(left);
}

/**
 * Sum of minor amounts (e.g. a list of shares). Exact, BigInt-checked. Lets UI code total
 * amounts without hand-rolled arithmetic.
 */
export function sumMinor(amounts: readonly number[]): number {
  let s = 0n;
  for (const a of amounts) {
    assertMinor(a);
    s += BigInt(a);
  }
  return toSafeNumber(s);
}
