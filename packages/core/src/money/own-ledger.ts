import { assertCurrency, assertMinor, toSafeNumber, type CurrencyCode } from "./currency";
import { MoneyError } from "./errors";

/**
 * One member's own ledger (FR-9, M-1, M-2): the money-only view a removed member keeps. Built
 * only from rows that involve them, so it never needs anyone else's balance.
 *
 * Same sign convention as {@link computeBalances}: positive = they're owed, negative = they owe.
 * - Expense: +what they paid (their payer part, or the total if they were the only payer),
 *   -their share.
 * - Adjustment (FR-69 / FR-9 resolution): +delta.
 * - Payment they made: +amount; payment they received: -amount.
 *
 * For a member, this equals their row of `computeBalances` over the full trip ledger.
 */
export interface OwnExpenseLine {
  currency: CurrencyCode;
  myPaidMinor: number;
  myShareMinor: number;
}

export interface OwnAdjustmentLine {
  currency: CurrencyCode;
  deltaMinor: number;
}

export interface OwnPaymentLine {
  currency: CurrencyCode;
  amountMinor: number;
  /** True when the member paid it (from them), false when they received it. */
  fromMe: boolean;
}

export interface OwnLedger {
  expenses?: readonly OwnExpenseLine[];
  adjustments?: readonly OwnAdjustmentLine[];
  payments?: readonly OwnPaymentLine[];
}

/** Net balance per currency (sorted by currency code). Zero balances are kept. */
export function ownBalances(ledger: OwnLedger): Record<CurrencyCode, number> {
  const acc = new Map<CurrencyCode, bigint>();
  const add = (currency: CurrencyCode, delta: bigint) => {
    assertCurrency(currency);
    acc.set(currency, (acc.get(currency) ?? 0n) + delta);
  };
  for (const e of ledger.expenses ?? []) {
    assertMinor(e.myPaidMinor, "myPaidMinor");
    assertMinor(e.myShareMinor, "myShareMinor");
    add(e.currency, BigInt(e.myPaidMinor) - BigInt(e.myShareMinor));
  }
  for (const a of ledger.adjustments ?? []) {
    assertMinor(a.deltaMinor, "deltaMinor");
    add(a.currency, BigInt(a.deltaMinor));
  }
  for (const p of ledger.payments ?? []) {
    assertMinor(p.amountMinor, "amountMinor");
    if (p.amountMinor <= 0) {
      throw new MoneyError("INVALID_PAYMENT", "Payments must be positive", { amountMinor: p.amountMinor });
    }
    add(p.currency, p.fromMe ? BigInt(p.amountMinor) : -BigInt(p.amountMinor));
  }
  const out: Record<CurrencyCode, number> = {};
  for (const c of [...acc.keys()].sort()) out[c] = toSafeNumber(acc.get(c)!, "balance");
  return out;
}

/** What a balance means for its owner, for the settle-up line ("You owe $12.00"). */
export type OwnStanding = "settled" | "you_owe" | "owed_to_you";

export function standingOf(balanceMinor: number): OwnStanding {
  assertMinor(balanceMinor, "balance");
  return balanceMinor === 0 ? "settled" : balanceMinor < 0 ? "you_owe" : "owed_to_you";
}
