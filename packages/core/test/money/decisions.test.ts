/**
 * Founder money decisions, 2026-10-02 (docs/open-questions.md Q16–Q24, MT1).
 */
import { describe, expect, it } from "vitest";
import {
  adjustmentsForCorrection,
  allocate,
  allocateDetailed,
  applyCoveredBy,
  categoryTotals,
  computeBalances,
  correctedForReport,
  findSimilarReceiptPairs,
  lineItemSimilarity,
  mainPayer,
  moneyActivityFor,
  normalizeItemLabel,
  normalizePayers,
  payerPartsOf,
  refundFromOriginal,
  scalePayers,
  spendPerPerson,
  splitByWeights,
  splitEven,
  splitItemized,
  type LedgerExpense,
} from "../../src/money";
import { errCode, shareMap, sum } from "./helpers";

describe("Q18: leftover pennies go to the uploader", () => {
  it("allocate remainderTo gives every leftover unit to one position", () => {
    expect(allocate(1001, [1, 1, 1, 1], { remainderTo: 2 })).toEqual([250, 250, 251, 250]);
    expect(allocate(1003, [1, 1, 1, 1], { remainderTo: 2 })).toEqual([250, 250, 253, 250]);
    expect(allocate(-1003, [1, 1, 1, 1], { remainderTo: 2 })).toEqual([-250, -250, -253, -250]);
    // weight 0 never receives pennies: falls back to largest remainder
    expect(allocate(1001, [1, 1, 0], { remainderTo: 2 })).toEqual([501, 500, 0]);
    expect(errCode(() => allocate(10, [1, 1], { remainderTo: 5 }))).toBe("INVALID_WEIGHT");
  });

  it("allocateDetailed reports the leftover", () => {
    expect(allocateDetailed(1000, [1, 1, 1, 1])).toMatchObject({ leftoverMinor: 0, leftoverIndex: null });
    expect(allocateDetailed(1001, [1, 1, 1])).toMatchObject({ leftoverMinor: 2, leftoverIndex: null });
    expect(allocateDetailed(1001, [1, 1, 1], { remainderTo: 1 })).toMatchObject({ leftoverMinor: 2, leftoverIndex: 1 });
  });

  it("splitEven: [uploader, payer] preference, deterministic", () => {
    const base = { totalMinor: 1000, currency: "USD", participantIds: ["a", "b", "c"] };
    const up = splitEven({ ...base, leftoverTo: ["c", "a"] });
    expect(shareMap(up.shares)).toEqual({ a: 333, b: 333, c: 334 });
    expect(up.rounding).toEqual({ leftoverMinor: 1, memberId: "c" });
    // uploader not in the split → payer
    const payer = splitEven({ ...base, leftoverTo: ["z", "b"] });
    expect(shareMap(payer.shares)).toEqual({ a: 333, b: 334, c: 333 });
    // neither → default (lowest id), flagged with no recipient
    const dflt = splitEven({ ...base, leftoverTo: ["z"] });
    expect(dflt.rounding).toEqual({ leftoverMinor: 1, memberId: null });
    // exact division: no rounding flag
    expect(splitEven({ ...base, totalMinor: 999, leftoverTo: ["c"] }).rounding.leftoverMinor).toBe(0);
    // a guest of honor uploader can't take pennies
    const goh = splitEven({ ...base, guestOfHonorIds: ["c"], totalMinor: 1001, leftoverTo: ["c", "b"] });
    expect(shareMap(goh.shares)).toEqual({ a: 500, b: 501 });
  });

  it("splitByWeights and refunds honor leftoverTo", () => {
    const s = splitByWeights({
      totalMinor: 100,
      currency: "USD",
      weights: [
        { memberId: "a", weight: 1 },
        { memberId: "b", weight: 1 },
        { memberId: "c", weight: 1 },
      ],
      leftoverTo: ["b"],
    });
    expect(shareMap(s.shares)).toEqual({ a: 33, b: 34, c: 33 });
    const orig = { currency: "USD", totalMinor: 900, shares: [{ memberId: "a", shareMinor: 300 }, { memberId: "b", shareMinor: 300 }, { memberId: "c", shareMinor: 300 }] };
    expect(shareMap(refundFromOriginal(orig, 100, { leftoverTo: ["c"] }).shares)).toEqual({ a: -33, b: -33, c: -34 });
  });
});

describe("Q16: unclaimed items default to the uploader", () => {
  it("assignTo puts unclaimed items on one person and reports them", () => {
    const s = splitItemized({
      totalMinor: 3300,
      currency: "USD",
      payerId: "a",
      items: [
        { id: "1", amountMinor: 1000, claims: [{ memberId: "a" }] },
        { id: "2", amountMinor: 2000, claims: [] },
      ],
      charges: [{ kind: "tax", amountMinor: 300 }],
      unclaimed: { assignTo: "u" },
    });
    expect(shareMap(s.shares)).toEqual({ a: 1100, u: 2200 });
    expect(s.unclaimedItemIds).toEqual(["2"]);
  });
});

describe("Q17: a gap the user proceeds with is covered by the payer", () => {
  const input = {
    totalMinor: 5000,
    currency: "USD",
    payerId: "a",
    items: [
      { id: "1", amountMinor: 2000, claims: [{ memberId: "a" }] },
      { id: "2", amountMinor: 2000, claims: [{ memberId: "b" }] },
    ],
  };
  it("assignTo payer", () => {
    expect(shareMap(splitItemized({ ...input, difference: { assignTo: "a" } }).shares)).toEqual({ a: 3000, b: 2000 });
  });
  it("several payers cover it in proportion to what they paid", () => {
    const s = splitItemized({
      ...input,
      difference: {
        proportionalTo: [
          { memberId: "a", weight: 3000 },
          { memberId: "b", weight: 2000 },
        ],
      },
    });
    expect(shareMap(s.shares)).toEqual({ a: 2600, b: 2400 });
    expect(sum(s.shares.map((x) => x.shareMinor))).toBe(5000);
  });
});

describe("Q23a: one bill, several payers", () => {
  it("parts must sum to the total, be positive and unique", () => {
    expect(normalizePayers(1000, [{ memberId: "b", paidMinor: 400 }, { memberId: "a", paidMinor: 600 }])).toEqual([
      { memberId: "a", paidMinor: 600 },
      { memberId: "b", paidMinor: 400 },
    ]);
    expect(errCode(() => normalizePayers(1000, [{ memberId: "a", paidMinor: 600 }]))).toBe("PAYERS_DO_NOT_SUM");
    expect(errCode(() => normalizePayers(1000, [{ memberId: "a", paidMinor: 1000 }, { memberId: "b", paidMinor: 0 }]))).toBe(
      "INVALID_AMOUNT",
    );
    expect(errCode(() => normalizePayers(1000, [{ memberId: "a", paidMinor: 1200 }, { memberId: "b", paidMinor: -200 }]))).toBe(
      "INVALID_AMOUNT",
    );
    expect(errCode(() => normalizePayers(1000, [{ memberId: "a", paidMinor: 500 }, { memberId: "a", paidMinor: 500 }]))).toBe(
      "DUPLICATE_MEMBER",
    );
    expect(errCode(() => normalizePayers(1000, []))).toBe("NO_PARTICIPANTS");
    // refunds: all negative
    expect(normalizePayers(-100, [{ memberId: "a", paidMinor: -60 }, { memberId: "b", paidMinor: -40 }])).toHaveLength(2);
  });

  it("balances credit each payer with what they paid", () => {
    const e: LedgerExpense = {
      currency: "USD",
      totalMinor: 9000,
      payerId: "a",
      payers: [
        { memberId: "a", paidMinor: 6000 },
        { memberId: "b", paidMinor: 3000 },
      ],
      shares: [
        { memberId: "a", shareMinor: 3000 },
        { memberId: "b", shareMinor: 3000 },
        { memberId: "c", shareMinor: 3000 },
      ],
    };
    expect(computeBalances({ expenses: [e] })).toEqual({ USD: { a: 3000, b: 0, c: -3000 } });
    expect(payerPartsOf({ ...e, payers: undefined })).toEqual([{ memberId: "a", paidMinor: 9000 }]);
    expect(() => computeBalances({ expenses: [{ ...e, payers: [{ memberId: "a", paidMinor: 1 }] }] })).toThrow();
  });

  it("main payer is the largest part; scaling keeps the sum", () => {
    expect(mainPayer([{ memberId: "b", paidMinor: 500 }, { memberId: "a", paidMinor: 500 }, { memberId: "c", paidMinor: 100 }])).toBe("a");
    const scaled = scalePayers([{ memberId: "a", paidMinor: 2 }, { memberId: "b", paidMinor: 1 }], -100, { leftoverTo: ["b"] });
    expect(scaled).toEqual([
      { memberId: "a", paidMinor: -66 },
      { memberId: "b", paidMinor: -34 },
    ]);
  });

  it("a correction from one payer to several is adjustments summing to zero", () => {
    const before: LedgerExpense = { currency: "USD", totalMinor: 1000, payerId: "a", shares: [{ memberId: "a", shareMinor: 500 }, { memberId: "b", shareMinor: 500 }] };
    const adj = adjustmentsForCorrection(before, { ...before, payers: [{ memberId: "a", paidMinor: 500 }, { memberId: "b", paidMinor: 500 }] });
    expect(adj).toEqual([
      { memberId: "a", currency: "USD", deltaMinor: -500 },
      { memberId: "b", currency: "USD", deltaMinor: 500 },
    ]);
  });
});

describe("Q23b: covered by", () => {
  const s = { currency: "USD", totalMinor: 900, shares: [{ memberId: "a", shareMinor: 300 }, { memberId: "b", shareMinor: 300 }, { memberId: "c", shareMinor: 300 }] };
  it("moves the share to the coverer; total unchanged", () => {
    const r = applyCoveredBy(s, [{ memberId: "c", coveredBy: "a" }]);
    expect(shareMap(r.shares)).toEqual({ a: 600, b: 300 });
    expect(r.moved).toEqual([{ memberId: "c", coveredBy: "a", shareMinor: 300 }]);
    // shows as theirs in balances: c owes nothing, a owes the payer for two shares
    expect(computeBalances({ expenses: [{ ...r, payerId: "b" }] })).toEqual({ USD: { a: -600, b: 600 } });
  });
  it("a coverer outside the split gets the share; chains resolve; cycles and self-covers are rejected", () => {
    expect(shareMap(applyCoveredBy(s, [{ memberId: "a", coveredBy: "z" }]).shares)).toEqual({ b: 300, c: 300, z: 300 });
    expect(shareMap(applyCoveredBy(s, [{ memberId: "a", coveredBy: "b" }, { memberId: "b", coveredBy: "c" }]).shares)).toEqual({ c: 900 });
    expect(errCode(() => applyCoveredBy(s, [{ memberId: "a", coveredBy: "b" }, { memberId: "b", coveredBy: "a" }]))).toBe("INVALID_COVER");
    expect(errCode(() => applyCoveredBy(s, [{ memberId: "a", coveredBy: "a" }]))).toBe("INVALID_COVER");
    expect(errCode(() => applyCoveredBy(s, [{ memberId: "a", coveredBy: "b" }, { memberId: "a", coveredBy: "c" }]))).toBe("INVALID_COVER");
    // covering someone not on the expense changes nothing
    expect(applyCoveredBy(s, [{ memberId: "q", coveredBy: "a" }]).shares).toEqual(s.shares);
  });
});

describe("Q23c: personal-only expenses", () => {
  it("never touch group balances", () => {
    const shared: LedgerExpense = { currency: "USD", totalMinor: 1000, payerId: "a", shares: [{ memberId: "a", shareMinor: 500 }, { memberId: "b", shareMinor: 500 }] };
    const personal: LedgerExpense = { currency: "USD", totalMinor: 7000, payerId: "b", personal: true, shares: [{ memberId: "b", shareMinor: 7000 }] };
    expect(computeBalances({ expenses: [shared, personal] })).toEqual(computeBalances({ expenses: [shared] }));
    expect(computeBalances({ expenses: [personal] })).toEqual({});
    expect(adjustmentsForCorrection(personal, { ...personal, totalMinor: 9000, shares: [{ memberId: "b", shareMinor: 9000 }] })).toEqual([]);
  });
});

describe("Q24: line-item similarity", () => {
  const a = [
    { label: "2x Margherita", amountMinor: 2400 },
    { label: "Coke", amountMinor: 300 },
    { label: "Tiramisù", amountMinor: 800 },
    { label: "Espresso", amountMinor: 250 },
    { label: "Water", amountMinor: 200 },
  ];
  it("normalizes labels", () => {
    expect(normalizeItemLabel("2x Margherita")).toBe("margherita");
    expect(normalizeItemLabel("Margherita x2")).toBe("margherita");
    expect(normalizeItemLabel("TIRAMISU!")).toBe("tiramisu");
    expect(normalizeItemLabel("7up")).toBe("7up");
    expect(normalizeItemLabel("3")).toBe("3");
  });
  it("same receipt read twice is similar; a different meal is not", () => {
    const b = [
      { label: "Margherita x2", amountMinor: 2400 },
      { label: "COKE", amountMinor: 300 },
      { label: "Tiramisu", amountMinor: 800 },
      { label: "Espresso", amountMinor: 250 },
      { label: "Water", amountMinor: 200 },
    ];
    expect(lineItemSimilarity(a, b)).toMatchObject({ similar: true, labelPermille: 1000, amountPermille: 1000 });
    // 4 of 5 lines match (Jaccard 4/6 < 4/5): not flagged
    const c = [...b.slice(0, 4), { label: "Beer", amountMinor: 500 }];
    expect(lineItemSimilarity(a, c)).toMatchObject({ similar: false, labelPermille: 666 });
    // labels match but amounts differ: not flagged
    expect(lineItemSimilarity(a, b.map((x) => ({ ...x, amountMinor: x.amountMinor + 1 }))).similar).toBe(false);
    // single-line receipts never count
    expect(lineItemSimilarity([a[0]!], [a[0]!]).similar).toBe(false);
  });
  it("threshold is exactly 4/5", () => {
    const base = Array.from({ length: 9 }, (_, i) => ({ label: `item ${String.fromCharCode(97 + i)}`, amountMinor: 100 + i }));
    // 8 shared + 1 each different → 8/10 = 0.8 → similar
    const other = [...base.slice(0, 8), { label: "item z", amountMinor: 999 }];
    expect(lineItemSimilarity(base, other)).toMatchObject({ labelIntersection: 8, labelUnion: 10, similar: true });
    const fewer = [...base.slice(0, 7), { label: "item y", amountMinor: 998 }, { label: "item z", amountMinor: 999 }];
    expect(lineItemSimilarity(base, fewer).similar).toBe(false);
  });
  it("pairs need the same currency and one day", () => {
    const day = 24 * 3600 * 1000;
    const r = (id: string, currency: string, at: number) => ({ id, currency, occurredAtMs: at, items: a });
    expect(findSimilarReceiptPairs([r("2", "USD", 0), r("1", "USD", day), r("3", "EUR", 0), r("4", "USD", 3 * day)]).map((p) => [p.a, p.b])).toEqual([
      ["1", "2"],
    ]);
  });
});

describe("Q21: corrections update the spending reports", () => {
  it("the latest correction replaces total and shares", () => {
    const e = { currency: "USD", totalMinor: 1000, category: "food_drink" as const, shares: [{ memberId: "a", shareMinor: 500 }, { memberId: "b", shareMinor: 500 }] };
    const fixed = correctedForReport(e, [
      { totalMinor: 1200, shares: [{ memberId: "a", shareMinor: 600 }, { memberId: "b", shareMinor: 600 }] },
      { totalMinor: 1500, shares: [{ memberId: "a", shareMinor: 500 }, { memberId: "b", shareMinor: 500 }, { memberId: "c", shareMinor: 500 }] },
    ]);
    expect(categoryTotals([fixed])).toEqual({ USD: { food_drink: 1500 } });
    expect(spendPerPerson([fixed])).toEqual({ USD: { a: 500, b: 500, c: 500 } });
    expect(correctedForReport(e, [])).toBe(e);
    expect(errCode(() => correctedForReport(e, [{ totalMinor: 10, shares: [] }]))).toBe("SHARES_DO_NOT_SUM");
  });
});

describe("MT1: what changed (in-app money activity)", () => {
  it("lists changes affecting me, newest first, with my balance effect", () => {
    const list = moneyActivityFor("me", [
      {
        kind: "expense",
        expenseId: "e1",
        atMs: 1,
        merchant: "Dinner",
        currency: "USD",
        totalMinor: 900,
        payerId: "x",
        shares: [{ memberId: "me", shareMinor: 300 }, { memberId: "x", shareMinor: 600 }],
        isRefund: false,
        actorId: "x",
      },
      {
        kind: "expense",
        expenseId: "e2",
        atMs: 2,
        merchant: "Not mine",
        currency: "USD",
        totalMinor: 900,
        payerId: "x",
        shares: [{ memberId: "x", shareMinor: 900 }],
        isRefund: false,
        actorId: "x",
      },
      { kind: "correction", expenseId: "e1", atMs: 3, merchant: "Dinner", currency: "USD", entries: [{ memberId: "me", deltaMinor: -50 }, { memberId: "x", deltaMinor: 50 }], reason: "tip", actorId: "x" },
      { kind: "payment", paymentId: "p1", atMs: 4, fromMemberId: "me", toMemberId: "x", currency: "USD", amountMinor: 350, actorId: "me" },
      { kind: "edit", expenseId: "e1", atMs: 5, merchant: "Dinner", currency: "USD", shares: [{ memberId: "me", shareMinor: 300 }], actorId: "x" },
      {
        kind: "expense",
        expenseId: "e3",
        atMs: 6,
        merchant: "Split by two",
        currency: "EUR",
        totalMinor: 1000,
        payerId: "me",
        payers: [{ memberId: "me", paidMinor: 400 }, { memberId: "x", paidMinor: 600 }],
        shares: [{ memberId: "me", shareMinor: 500 }, { memberId: "x", shareMinor: 500 }],
        isRefund: false,
        actorId: "me",
      },
    ]);
    expect(list.map((e) => [e.kind, e.effectMinor, e.myShareMinor])).toEqual([
      ["expense", -100, 500],
      ["edit", null, 300],
      ["payment", 350, null],
      ["correction", -50, null],
      ["expense", -300, 300],
    ]);
    expect(list[2]!.otherMemberId).toBe("x");
    expect(moneyActivityFor("me", [], 5)).toEqual([]);
  });
});
