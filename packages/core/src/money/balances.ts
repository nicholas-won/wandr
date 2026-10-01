import { compareIds } from "./allocate";
import { assertCurrency, assertMinor, toSafeNumber, type CurrencyCode } from "./currency";
import { MoneyError } from "./errors";
import { assertValidSplit } from "./split";
import { validateAdjustmentSet } from "./adjustments";
import type { AdjustmentEntry, LedgerExpense, MemberId, Payment, Share } from "./types";

/**
 * Net balances per currency (FR-66, FR-70, FR-71, D29).
 *
 * Sign convention: positive = the member is owed money; negative = they owe.
 * - Expense: payer +total, each share -share.
 * - Adjustment entry (FR-69): +deltaMinor.
 * - Payment from A to B: A +amount (debt paid down), B -amount.
 *
 * Currencies are never converted or netted against each other. Within each
 * currency the balances always sum to exactly zero.
 */
export type Balances = Record<CurrencyCode, Record<MemberId, number>>;

export interface LedgerInput {
  expenses?: readonly LedgerExpense[];
  adjustments?: readonly AdjustmentEntry[];
  payments?: readonly Payment[];
}

/** Rows of net balances for one currency, sorted by member id. Zero balances are kept. */
export function computeBalances(input: LedgerInput): Balances {
  const acc = new Map<CurrencyCode, Map<MemberId, bigint>>();
  const add = (currency: CurrencyCode, memberId: MemberId, delta: bigint) => {
    let m = acc.get(currency);
    if (!m) acc.set(currency, (m = new Map()));
    m.set(memberId, (m.get(memberId) ?? 0n) + delta);
  };

  for (const e of input.expenses ?? []) {
    assertValidSplit({ currency: e.currency, totalMinor: e.totalMinor, shares: sortShares(e.shares) });
    add(e.currency, e.payerId, BigInt(e.totalMinor));
    for (const s of e.shares) add(e.currency, s.memberId, -BigInt(s.shareMinor));
  }

  validateAdjustmentSet(input.adjustments ?? [], { allowMultipleCurrencies: true });
  for (const a of input.adjustments ?? []) add(a.currency, a.memberId, BigInt(a.deltaMinor));

  for (const p of input.payments ?? []) {
    assertPayment(p);
    add(p.currency, p.fromMemberId, BigInt(p.amountMinor));
    add(p.currency, p.toMemberId, -BigInt(p.amountMinor));
  }

  const out: Balances = {};
  for (const currency of [...acc.keys()].sort()) {
    const m = acc.get(currency)!;
    const row: Record<MemberId, number> = {};
    for (const id of [...m.keys()].sort(compareIds)) row[id] = toSafeNumber(m.get(id)!, "balance");
    out[currency] = row;
  }
  return out;
}

export function assertPayment(p: Payment): void {
  assertCurrency(p.currency);
  assertMinor(p.amountMinor, "payment amountMinor");
  if (p.amountMinor <= 0) {
    throw new MoneyError("INVALID_PAYMENT", "Payments must be positive", { amountMinor: p.amountMinor });
  }
  if (!p.fromMemberId || !p.toMemberId || p.fromMemberId === p.toMemberId) {
    throw new MoneyError("INVALID_PAYMENT", "A payment needs two different members");
  }
}

function sortShares(shares: readonly Share[]): Share[] {
  return [...shares].sort((x, y) => compareIds(x.memberId, y.memberId));
}

