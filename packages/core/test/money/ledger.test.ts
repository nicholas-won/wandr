import { describe, expect, it } from "vitest";
import {
  adjustmentsForCorrection,
  applyAdjustments,
  computeBalances,
  duoSettleUp,
  refundFromOriginal,
  settleUpFor,
  simplifyAll,
  simplifyDebts,
  splitEven,
  splitJustMe,
  validateAdjustmentSet,
  type LedgerExpense,
  type Split,
} from "../../src/money";
import { errCode, shareMap } from "./helpers";

const even = (totalMinor: number, ids: string[], currency = "USD"): Split => {
  const { excludedGuestOfHonorIds: _x, ...s } = splitEven({ totalMinor, currency, participantIds: ids });
  return s;
};
const exp = (payerId: string, s: Split): LedgerExpense => ({ payerId, ...s });

describe("refundFromOriginal (FR-72, E-12)", () => {
  const original = even(1000, ["a", "b", "c"]); // 334/333/333

  it("full refund exactly negates the original shares", () => {
    const r = refundFromOriginal(original, 1000);
    expect(r.totalMinor).toBe(-1000);
    expect(shareMap(r.shares)).toEqual({ a: -334, b: -333, c: -333 });
  });

  it("partial refund follows the original proportions", () => {
    const r = refundFromOriginal(original, 300);
    expect(r.shares.reduce((x, s) => x + s.shareMinor, 0)).toBe(-300);
    expect(shareMap(r.shares)).toEqual({ a: -100, b: -100, c: -100 });
  });

  it("refund of an itemized-style uneven split", () => {
    const orig: Split = {
      currency: "USD",
      totalMinor: 1000,
      shares: [
        { memberId: "a", shareMinor: 700 },
        { memberId: "b", shareMinor: 300 },
        { memberId: "c", shareMinor: 0 },
      ],
    };
    expect(shareMap(refundFromOriginal(orig, 101).shares)).toEqual({ a: -71, b: -30, c: 0 });
  });

  it("refund plus original nets to the remaining cost, and balances revert on a full refund", () => {
    const e = exp("a", original);
    const r = exp("a", refundFromOriginal(original, 1000));
    const bal = computeBalances({ expenses: [e, r] });
    expect(bal).toEqual({ USD: { a: 0, b: 0, c: 0 } });
  });

  it("JPY refund", () => {
    const o = even(10000, ["a", "b", "c"], "JPY");
    expect(shareMap(refundFromOriginal(o, 5000).shares)).toEqual({ a: -1667, b: -1667, c: -1666 });
  });

  it("errors", () => {
    expect(errCode(() => refundFromOriginal(original, 0))).toBe("INVALID_AMOUNT");
    expect(errCode(() => refundFromOriginal(original, -5))).toBe("INVALID_AMOUNT");
    expect(errCode(() => refundFromOriginal(original, 1001))).toBe("REFUND_EXCEEDS_ORIGINAL");
    expect(errCode(() => refundFromOriginal(refundFromOriginal(original, 10), 5))).toBe("INVALID_AMOUNT");
    expect(errCode(() => refundFromOriginal({ ...original, totalMinor: 999 }, 5))).toBe("SHARES_DO_NOT_SUM");
  });
});

describe("adjustments (FR-69)", () => {
  it("validates zero-sum", () => {
    expect(() =>
      validateAdjustmentSet([
        { memberId: "a", currency: "USD", deltaMinor: 800 },
        { memberId: "b", currency: "USD", deltaMinor: -800 },
      ]),
    ).not.toThrow();
    expect(() => validateAdjustmentSet([])).not.toThrow();
    expect(errCode(() => validateAdjustmentSet([{ memberId: "a", currency: "USD", deltaMinor: 1 }]))).toBe("ADJUSTMENT_NOT_BALANCED");
    expect(
      errCode(() =>
        validateAdjustmentSet([
          { memberId: "a", currency: "USD", deltaMinor: 1 },
          { memberId: "b", currency: "EUR", deltaMinor: -1 },
        ]),
      ),
    ).toBe("CURRENCY_MISMATCH");
    expect(
      errCode(() =>
        validateAdjustmentSet(
          [
            { memberId: "a", currency: "USD", deltaMinor: 1 },
            { memberId: "b", currency: "EUR", deltaMinor: -1 },
          ],
          { allowMultipleCurrencies: true },
        ),
      ),
    ).toBe("ADJUSTMENT_NOT_BALANCED");
    expect(errCode(() => validateAdjustmentSet([{ memberId: "a", currency: "USD", deltaMinor: 0.5 }]))).toBe("INVALID_AMOUNT");
    expect(errCode(() => validateAdjustmentSet([{ memberId: "", currency: "USD", deltaMinor: 0 }]))).toBe("UNKNOWN_MEMBER");
  });

  it("total corrected from $42 to $50 (E-22)", () => {
    const before = exp("sam", even(4200, ["sam", "jo"]));
    const after = exp("sam", even(5000, ["sam", "jo"]));
    const adj = adjustmentsForCorrection(before, after);
    expect(adj).toEqual([
      { memberId: "jo", currency: "USD", deltaMinor: -400 },
      { memberId: "sam", currency: "USD", deltaMinor: 400 },
    ]);
    // Ledger with original + adjustments equals ledger with the corrected expense.
    expect(computeBalances({ expenses: [before], adjustments: adj })).toEqual(computeBalances({ expenses: [after] }));
  });

  it("payer changed", () => {
    const before = exp("a", even(900, ["a", "b", "c"]));
    const after = exp("b", even(900, ["a", "b", "c"]));
    const adj = adjustmentsForCorrection(before, after);
    expect(adj).toEqual([
      { memberId: "a", currency: "USD", deltaMinor: -900 },
      { memberId: "b", currency: "USD", deltaMinor: 900 },
    ]);
  });

  it("participant removed from the split", () => {
    const before = exp("a", even(900, ["a", "b", "c"]));
    const after = exp("a", even(900, ["a", "b"]));
    const adj = adjustmentsForCorrection(before, after);
    expect(computeBalances({ expenses: [before], adjustments: adj })).toEqual({
      USD: { a: 450, b: -450, c: 0 },
    });
  });

  it("no change produces no entries", () => {
    const e = exp("a", even(900, ["a", "b"]));
    expect(adjustmentsForCorrection(e, e)).toEqual([]);
  });

  it("currency can't change via adjustment", () => {
    expect(errCode(() => adjustmentsForCorrection(exp("a", even(900, ["a"])), exp("a", even(900, ["a"], "EUR"))))).toBe("CURRENCY_MISMATCH");
  });

  it("applyAdjustments gives the corrected net per member", () => {
    const before = exp("sam", even(4200, ["sam", "jo"]));
    const after = exp("sam", even(5000, ["sam", "jo"]));
    expect(applyAdjustments(before, adjustmentsForCorrection(before, after))).toEqual([
      { memberId: "jo", netMinor: -2500 },
      { memberId: "sam", netMinor: 2500 },
    ]);
    expect(
      errCode(() =>
        applyAdjustments(before, [
          { memberId: "a", currency: "EUR", deltaMinor: 1 },
          { memberId: "b", currency: "EUR", deltaMinor: -1 },
        ]),
      ),
    ).toBe("CURRENCY_MISMATCH");
  });
});

describe("computeBalances (FR-70, FR-71)", () => {
  it("payer credited, shares debited, per currency", () => {
    const bal = computeBalances({
      expenses: [exp("a", even(9000, ["a", "b", "c"])), exp("b", even(6000, ["a", "b"], "EUR")), exp("c", even(10000, ["a", "c"], "JPY"))],
    });
    expect(bal).toEqual({
      EUR: { a: -3000, b: 3000 },
      JPY: { a: -5000, c: 5000 },
      USD: { a: 6000, b: -3000, c: -3000 },
    });
  });

  it("payments reduce what's owed and never cross currencies", () => {
    const bal = computeBalances({
      expenses: [exp("a", even(9000, ["a", "b", "c"]))],
      payments: [
        { fromMemberId: "b", toMemberId: "a", currency: "USD", amountMinor: 3000 },
        { fromMemberId: "c", toMemberId: "a", currency: "EUR", amountMinor: 1000 },
      ],
    });
    expect(bal).toEqual({ EUR: { a: -1000, c: 1000 }, USD: { a: 3000, b: 0, c: -3000 } });
  });

  it("payer not in the split (E-16)", () => {
    expect(computeBalances({ expenses: [exp("org", even(1000, ["a", "b"]))] })).toEqual({
      USD: { a: -500, b: -500, org: 1000 },
    });
  });

  it("just-me expenses never move balances (FR-T10)", () => {
    expect(computeBalances({ expenses: [exp("me", splitJustMe({ totalMinor: 5000, currency: "USD", memberId: "me" }))] })).toEqual({
      USD: { me: 0 },
    });
  });

  it("empty ledger", () => {
    expect(computeBalances({})).toEqual({});
  });

  it("rejects invalid input", () => {
    expect(errCode(() => computeBalances({ expenses: [{ payerId: "a", currency: "USD", totalMinor: 10, shares: [{ memberId: "a", shareMinor: 9 }] }] }))).toBe(
      "SHARES_DO_NOT_SUM",
    );
    expect(errCode(() => computeBalances({ payments: [{ fromMemberId: "a", toMemberId: "a", currency: "USD", amountMinor: 1 }] }))).toBe(
      "INVALID_PAYMENT",
    );
    expect(errCode(() => computeBalances({ payments: [{ fromMemberId: "a", toMemberId: "b", currency: "USD", amountMinor: 0 }] }))).toBe(
      "INVALID_PAYMENT",
    );
    expect(errCode(() => computeBalances({ adjustments: [{ memberId: "a", currency: "USD", deltaMinor: 5 }] }))).toBe("ADJUSTMENT_NOT_BALANCED");
  });

  it("accepts unsorted shares on expenses", () => {
    expect(
      computeBalances({
        expenses: [
          {
            payerId: "a",
            currency: "USD",
            totalMinor: 10,
            shares: [
              { memberId: "b", shareMinor: 5 },
              { memberId: "a", shareMinor: 5 },
            ],
          },
        ],
      }),
    ).toEqual({ USD: { a: 5, b: -5 } });
  });

  it("huge amounts stay exact", () => {
    const big = Number.MAX_SAFE_INTEGER;
    const bal = computeBalances({ expenses: [exp("a", even(big, ["b"]))] });
    expect(bal).toEqual({ USD: { a: big, b: -big } });
  });
});

describe("simplifyDebts (FR-70)", () => {
  it("chain a->b->c collapses to one transfer", () => {
    // a owes b 10, b owes c 10 => a pays c 10
    expect(simplifyDebts({ a: -1000, b: 0, c: 1000 }, "USD")).toEqual([
      { fromMemberId: "a", toMemberId: "c", currency: "USD", amountMinor: 1000 },
    ]);
  });

  it("matches largest creditor with largest debtor", () => {
    const t = simplifyDebts({ a: 6000, b: -3000, c: -2000, d: -1000 }, "USD");
    expect(t).toEqual([
      { fromMemberId: "b", toMemberId: "a", currency: "USD", amountMinor: 3000 },
      { fromMemberId: "c", toMemberId: "a", currency: "USD", amountMinor: 2000 },
      { fromMemberId: "d", toMemberId: "a", currency: "USD", amountMinor: 1000 },
    ]);
  });

  it("ties broken by member id", () => {
    expect(simplifyDebts({ d: -500, c: -500, b: 500, a: 500 }, "USD")).toEqual([
      { fromMemberId: "c", toMemberId: "a", currency: "USD", amountMinor: 500 },
      { fromMemberId: "d", toMemberId: "b", currency: "USD", amountMinor: 500 },
    ]);
  });

  it("partial matches", () => {
    const t = simplifyDebts({ a: 700, b: 300, c: -600, d: -400 }, "USD");
    expect(t).toEqual([
      { fromMemberId: "c", toMemberId: "a", currency: "USD", amountMinor: 600 },
      { fromMemberId: "d", toMemberId: "b", currency: "USD", amountMinor: 300 },
      { fromMemberId: "d", toMemberId: "a", currency: "USD", amountMinor: 100 },
    ]);
  });

  it("all settled -> no transfers", () => {
    expect(simplifyDebts({ a: 0, b: 0 }, "USD")).toEqual([]);
    expect(simplifyDebts({}, "USD")).toEqual([]);
  });

  it("rejects unbalanced input", () => {
    expect(errCode(() => simplifyDebts({ a: 1 }, "USD"))).toBe("UNBALANCED_LEDGER");
    expect(errCode(() => simplifyDebts({ a: 1.5, b: -1.5 }, "USD"))).toBe("INVALID_AMOUNT");
  });

  it("simplifyAll keeps currencies separate", () => {
    const bal = computeBalances({
      expenses: [exp("a", even(1000, ["a", "b"])), exp("b", even(1000, ["a", "b"], "EUR"))],
    });
    expect(simplifyAll(bal)).toEqual({
      EUR: [{ fromMemberId: "a", toMemberId: "b", currency: "EUR", amountMinor: 500 }],
      USD: [{ fromMemberId: "b", toMemberId: "a", currency: "USD", amountMinor: 500 }],
    });
  });
});

describe("settle-up views", () => {
  it("duo: one 'You owe Sam $X' line per currency (FR-T8)", () => {
    const bal = computeBalances({
      expenses: [
        exp("sam", even(8000, ["me", "sam"])),
        exp("me", even(2000, ["me", "sam"])),
        exp("me", even(6000, ["me", "sam"], "EUR")),
        exp("sam", even(1000, ["me", "sam"], "JPY")),
        exp("me", even(1000, ["me", "sam"], "JPY")),
      ],
    });
    expect(duoSettleUp(bal, "me", "sam")).toEqual([
      { currency: "EUR", direction: "owes_you", otherMemberId: "sam", amountMinor: 3000 },
      { currency: "USD", direction: "you_owe", otherMemberId: "sam", amountMinor: 3000 },
    ]);
    expect(duoSettleUp(bal, "sam", "me")).toEqual([
      { currency: "EUR", direction: "you_owe", otherMemberId: "me", amountMinor: 3000 },
      { currency: "USD", direction: "owes_you", otherMemberId: "me", amountMinor: 3000 },
    ]);
    expect(settleUpFor(bal, "me")).toEqual(duoSettleUp(bal, "me", "sam"));
  });

  it("duo settle-up refuses when a third person holds a balance", () => {
    const bal = computeBalances({ expenses: [exp("me", even(900, ["me", "sam", "former"]))] });
    expect(errCode(() => duoSettleUp(bal, "me", "sam"))).toBe("UNBALANCED_LEDGER");
    expect(settleUpFor(bal, "me")).toEqual([
      { currency: "USD", direction: "owes_you", otherMemberId: "former", amountMinor: 300 },
      { currency: "USD", direction: "owes_you", otherMemberId: "sam", amountMinor: 300 },
    ]);
  });

  it("settled currencies produce no line", () => {
    const bal = computeBalances({
      expenses: [exp("me", even(1000, ["me", "sam"]))],
      payments: [{ fromMemberId: "sam", toMemberId: "me", currency: "USD", amountMinor: 500 }],
    });
    expect(duoSettleUp(bal, "me", "sam")).toEqual([]);
    expect(settleUpFor(bal, "me")).toEqual([]);
  });
});
