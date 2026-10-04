import { compareIds } from "./allocate";
import { assertCurrency, assertMinor, toSafeNumber, type CurrencyCode } from "./currency";
import { MoneyError } from "./errors";
import { payerPartsOf } from "./payers";
import { assertValidSplit } from "./split";
import type { AdjustmentEntry, LedgerExpense, MemberId, Share } from "./types";

/**
 * Adjustment entries for locked expenses (FR-69, NFR-5, E-22).
 *
 * Once a payment involving an expense is recorded, the expense row is frozen.
 * Fixes are appended as adjustment entries: signed deltas to members' NET
 * balances in the expense currency (positive = owed more). Every set of entries
 * for one correction sums to zero, so the ledger stays balanced.
 */

/**
 * Validates a set of adjustment entries (FR-69): safe integers, valid currency,
 * and the deltas sum to zero per currency. By default a set must be in a single
 * currency (one correction to one expense).
 */
export function validateAdjustmentSet(
  entries: readonly AdjustmentEntry[],
  options: { allowMultipleCurrencies?: boolean } = {},
): void {
  const sums = new Map<CurrencyCode, bigint>();
  for (const e of entries) {
    assertCurrency(e.currency);
    assertMinor(e.deltaMinor, "deltaMinor");
    if (!e.memberId) throw new MoneyError("UNKNOWN_MEMBER", "Adjustment entry needs a member");
    sums.set(e.currency, (sums.get(e.currency) ?? 0n) + BigInt(e.deltaMinor));
  }
  if (!options.allowMultipleCurrencies && sums.size > 1) {
    throw new MoneyError("CURRENCY_MISMATCH", "An adjustment set must be in one currency", {
      currencies: [...sums.keys()],
    });
  }
  for (const [currency, sum] of sums) {
    if (sum !== 0n) {
      throw new MoneyError("ADJUSTMENT_NOT_BALANCED", "Adjustment deltas must sum to zero", {
        currency,
        sumMinor: sum.toString(),
      });
    }
  }
}

/** Net balance contribution of one expense: each payer +paid (Q23a), shares -share. Personal-only: nothing. */
export function expenseNet(e: LedgerExpense): Map<MemberId, bigint> {
  const m = new Map<MemberId, bigint>();
  if (e.personal) return m;
  for (const p of payerPartsOf(e)) m.set(p.memberId, (m.get(p.memberId) ?? 0n) + BigInt(p.paidMinor));
  for (const s of e.shares) m.set(s.memberId, (m.get(s.memberId) ?? 0n) - BigInt(s.shareMinor));
  return m;
}

/**
 * Builds the adjustment entries that turn a locked expense's old effect on
 * balances into a corrected one (FR-69, E-22). Handles a changed total, changed
 * shares and a changed payer. The original expense row is never edited. Entries
 * with a zero delta are omitted; output is sorted by member id; sums to zero.
 */
export function adjustmentsForCorrection(before: LedgerExpense, after: LedgerExpense): AdjustmentEntry[] {
  if (before.currency !== after.currency) {
    throw new MoneyError(
      "CURRENCY_MISMATCH",
      "A correction can't change the currency; refund and re-enter the expense instead",
    );
  }
  for (const e of [before, after]) {
    assertValidSplit({ currency: e.currency, totalMinor: e.totalMinor, shares: sortShares(e.shares) });
  }
  const a = expenseNet(before);
  const b = expenseNet(after);
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort(compareIds);
  const out: AdjustmentEntry[] = [];
  for (const memberId of ids) {
    const d = (b.get(memberId) ?? 0n) - (a.get(memberId) ?? 0n);
    if (d !== 0n) out.push({ memberId, currency: after.currency, deltaMinor: toSafeNumber(d, "deltaMinor") });
  }
  validateAdjustmentSet(out);
  return out;
}

function sortShares(shares: readonly Share[]): Share[] {
  return [...shares].sort((x, y) => compareIds(x.memberId, y.memberId));
}

/**
 * Applies adjustment entries to an expense's net effect and returns the
 * corrected per-member net (sorted by member id). Validates the entries first.
 */
export function applyAdjustments(
  expense: LedgerExpense,
  entries: readonly AdjustmentEntry[],
): { memberId: MemberId; netMinor: number }[] {
  validateAdjustmentSet(entries);
  const net = expenseNet(expense);
  for (const e of entries) {
    if (e.currency !== expense.currency) {
      throw new MoneyError("CURRENCY_MISMATCH", "Adjustment currency differs from the expense currency");
    }
    net.set(e.memberId, (net.get(e.memberId) ?? 0n) + BigInt(e.deltaMinor));
  }
  return [...net.keys()].sort(compareIds).map((memberId) => ({
    memberId,
    netMinor: toSafeNumber(net.get(memberId)!, "netMinor"),
  }));
}
