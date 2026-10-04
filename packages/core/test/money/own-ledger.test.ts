/** FR-9, M-1, M-2: a removed member's own ledger gives the same balance as the full trip ledger. */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  computeBalances,
  ownBalances,
  splitEven,
  standingOf,
  type AdjustmentEntry,
  type LedgerExpense,
  type Payment,
} from "../../src/money";
import { errCode } from "./helpers";

const ids = ["a", "b", "c", "d"];

function ownFrom(memberId: string, expenses: LedgerExpense[], adjustments: AdjustmentEntry[], payments: Payment[]) {
  return ownBalances({
    expenses: expenses
      .filter((e) => e.payerId === memberId || e.shares.some((s) => s.memberId === memberId) || e.payers?.some((p) => p.memberId === memberId))
      .map((e) => ({
        currency: e.currency,
        myPaidMinor: e.payers ? (e.payers.find((p) => p.memberId === memberId)?.paidMinor ?? 0) : e.payerId === memberId ? e.totalMinor : 0,
        myShareMinor: e.shares.find((s) => s.memberId === memberId)?.shareMinor ?? 0,
      })),
    adjustments: adjustments.filter((a) => a.memberId === memberId).map((a) => ({ currency: a.currency, deltaMinor: a.deltaMinor })),
    payments: payments
      .filter((p) => p.fromMemberId === memberId || p.toMemberId === memberId)
      .map((p) => ({ currency: p.currency, amountMinor: p.amountMinor, fromMe: p.fromMemberId === memberId })),
  });
}

describe("ownBalances", () => {
  it("sums paid minus share, adjustments and payments per currency", () => {
    const b = ownBalances({
      expenses: [
        { currency: "USD", myPaidMinor: 9000, myShareMinor: 3000 },
        { currency: "USD", myPaidMinor: 0, myShareMinor: 2500 },
        { currency: "EUR", myPaidMinor: 0, myShareMinor: 1000 },
      ],
      adjustments: [{ currency: "USD", deltaMinor: -100 }],
      payments: [
        { currency: "EUR", amountMinor: 1000, fromMe: true },
        { currency: "USD", amountMinor: 1400, fromMe: false },
      ],
    });
    expect(b).toEqual({ EUR: 0, USD: 9000 - 3000 - 2500 - 100 - 1400 });
    expect(Object.keys(b)).toEqual(["EUR", "USD"]);
  });

  it("standing reads the sign", () => {
    expect(standingOf(0)).toBe("settled");
    expect(standingOf(-1)).toBe("you_owe");
    expect(standingOf(250)).toBe("owed_to_you");
  });

  it("rejects floats, bad currencies and non-positive payments", () => {
    expect(errCode(() => ownBalances({ expenses: [{ currency: "USD", myPaidMinor: 1.5, myShareMinor: 0 }] }))).toBe("INVALID_AMOUNT");
    expect(errCode(() => ownBalances({ adjustments: [{ currency: "usd", deltaMinor: 1 }] }))).toBe("INVALID_CURRENCY");
    expect(errCode(() => ownBalances({ payments: [{ currency: "USD", amountMinor: 0, fromMe: true }] }))).toBe("INVALID_PAYMENT");
  });

  it("matches the member's row of computeBalances on random ledgers", () => {
    const expenseArb = fc
      .record({
        payer: fc.constantFrom(...ids),
        total: fc.integer({ min: 1, max: 100_000 }),
        currency: fc.constantFrom("USD", "EUR", "JPY"),
        who: fc.subarray(ids, { minLength: 1 }),
      })
      .map(({ payer, total, currency, who }): LedgerExpense => {
        const s = splitEven({ totalMinor: total, currency, participantIds: who });
        return { payerId: payer, currency, totalMinor: s.totalMinor, shares: s.shares };
      });
    const paymentArb = fc
      .record({
        from: fc.constantFrom(...ids),
        to: fc.constantFrom(...ids),
        amount: fc.integer({ min: 1, max: 50_000 }),
        currency: fc.constantFrom("USD", "EUR", "JPY"),
      })
      .filter((p) => p.from !== p.to)
      .map((p): Payment => ({ fromMemberId: p.from, toMemberId: p.to, amountMinor: p.amount, currency: p.currency }));
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 12 }), fc.array(paymentArb, { maxLength: 8 }), (expenses, payments) => {
        const full = computeBalances({ expenses, payments });
        for (const m of ids) {
          const own = ownFrom(m, expenses, [], payments);
          for (const [currency, row] of Object.entries(full)) {
            expect(own[currency] ?? 0).toBe(row[m] ?? 0);
          }
        }
      }),
    );
  });
});
