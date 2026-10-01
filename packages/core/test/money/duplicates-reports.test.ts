import { describe, expect, it } from "vitest";
import {
  approximateCategoryTotals,
  approximateTotal,
  categoryTotals,
  convertApprox,
  findProbableDuplicates,
  normalizeMerchant,
  parseRate,
  spendPerPerson,
  type DuplicateCandidate,
  type ExchangeRates,
  type ReportExpense,
} from "../../src/money";
import { errCode } from "./helpers";

const HOUR = 3600_000;
const T0 = Date.UTC(2026, 5, 12, 20, 0, 0);

describe("normalizeMerchant", () => {
  it.each([
    ["Taberna Ñam, LLC.", "taberna nam"],
    ["TABERNA  ÑAM", "taberna nam"],
    ["The Smith & Co", "smith and"],
    ["Café de Flore", "cafe de flore"],
    ["  Joe's Pizza Inc ", "joe s pizza"],
    ["すし匠", "すし匠"],
    ["Co", "co"],
    ["The", "the"],
    ["", ""],
  ])("%s -> %s", (a, b) => expect(normalizeMerchant(a)).toBe(b));
});

describe("findProbableDuplicates (FR-64, E-11)", () => {
  const existing: (DuplicateCandidate & { id: string })[] = [
    { id: "e1", merchant: "Taberna Ñam", totalMinor: 8420, currency: "EUR", occurredAtMs: T0 },
    { id: "e2", merchant: "Taberna Nam LLC", totalMinor: 8420, currency: "EUR", occurredAtMs: T0 + 2 * HOUR },
    { id: "e3", merchant: "Taberna Nam", totalMinor: 8420, currency: "USD", occurredAtMs: T0 },
    { id: "e4", merchant: "Taberna Nam", totalMinor: 8421, currency: "EUR", occurredAtMs: T0 },
    { id: "e5", merchant: "Taberna Nam", totalMinor: 8420, currency: "EUR", occurredAtMs: T0 + 30 * HOUR },
    { id: "e6", merchant: "Other place", totalMinor: 999, currency: "EUR", occurredAtMs: T0 - 90 * 24 * HOUR, imageHash: "abc" },
  ];

  it("matches merchant + total + currency within a day, closest first", () => {
    const m = findProbableDuplicates(
      { merchant: "taberna ñam", totalMinor: 8420, currency: "EUR", occurredAtMs: T0 + HOUR },
      existing,
    );
    expect(m.map((x) => [x.expense.id, x.reason, x.deltaMs])).toEqual([
      ["e1", "merchant_total_time", HOUR],
      ["e2", "merchant_total_time", HOUR],
    ]);
  });

  it("window boundary is inclusive and configurable", () => {
    const c = { merchant: "Taberna Nam", totalMinor: 8420, currency: "EUR", occurredAtMs: T0 + 6 * HOUR };
    expect(findProbableDuplicates(c, existing).map((x) => x.expense.id)).toEqual(["e2", "e1", "e5"]);
    expect(findProbableDuplicates(c, existing, { windowMs: HOUR }).map((x) => x.expense.id)).toEqual([]);
    expect(
      findProbableDuplicates({ ...c, occurredAtMs: T0 + 24 * HOUR }, existing, { windowMs: 24 * HOUR }).map((x) => x.expense.id),
    ).toEqual(["e5", "e2", "e1"]); // e1 is exactly 24h away: inclusive
  });

  it("same image hash always matches", () => {
    const m = findProbableDuplicates(
      { merchant: "x", totalMinor: 1, currency: "USD", occurredAtMs: T0, imageHash: "abc" },
      existing,
    );
    expect(m.map((x) => [x.expense.id, x.reason])).toEqual([["e6", "image_hash"]]);
  });

  it("skips itself", () => {
    expect(findProbableDuplicates(existing[0]!, existing).map((x) => x.expense.id)).toEqual(["e2"]);
  });

  it("empty merchant never matches on fields", () => {
    expect(findProbableDuplicates({ merchant: "!!!", totalMinor: 8420, currency: "EUR", occurredAtMs: T0 }, [{ ...existing[0]!, merchant: "..." }])).toEqual(
      [],
    );
  });

  it("validates input", () => {
    expect(errCode(() => findProbableDuplicates({ merchant: "a", totalMinor: 1.5, currency: "EUR", occurredAtMs: 0 }, []))).toBe("INVALID_AMOUNT");
  });
});

const expenses: ReportExpense[] = [
  { currency: "USD", totalMinor: 30000, category: "lodging", shares: [{ memberId: "a", shareMinor: 15000 }, { memberId: "b", shareMinor: 15000 }] },
  { currency: "USD", totalMinor: 5000, category: "food_drink", shares: [{ memberId: "a", shareMinor: 5000 }] },
  { currency: "USD", totalMinor: -1000, category: "food_drink", shares: [{ memberId: "a", shareMinor: -1000 }] },
  { currency: "JPY", totalMinor: 3000, category: "food_drink", shares: [{ memberId: "b", shareMinor: 1500 }, { memberId: "a", shareMinor: 1500 }] },
  { currency: "EUR", totalMinor: 1001, category: "transport", shares: [{ memberId: "b", shareMinor: 1001 }] },
];

describe("categoryTotals / spendPerPerson (FR-65)", () => {
  it("category totals per currency, refunds subtract", () => {
    expect(categoryTotals(expenses)).toEqual({
      EUR: { transport: 1001 },
      JPY: { food_drink: 3000 },
      USD: { food_drink: 4000, lodging: 30000 },
    });
  });

  it("spend per person is the sum of shares per currency", () => {
    expect(spendPerPerson(expenses)).toEqual({
      EUR: { b: 1001 },
      JPY: { a: 1500, b: 1500 },
      USD: { a: 19000, b: 15000 },
    });
  });

  it("empty", () => {
    expect(categoryTotals([])).toEqual({});
    expect(spendPerPerson([])).toEqual({});
  });
});

describe("approximate display-currency totals (FR-66)", () => {
  // Frankfurter style: 1 EUR = rates[X] X
  const rates: ExchangeRates = { base: "EUR", rates: { USD: "1.0800", JPY: "160.5", KWD: "0.331", GBP: "0.85" } };

  it("parseRate is exact", () => {
    expect(parseRate("1.0800")).toEqual({ n: 10800n, d: 10000n });
    expect(parseRate("160")).toEqual({ n: 160n, d: 1n });
    for (const bad of ["0", "-1", "abc", "1e3", "", "0.000"]) expect(errCode(() => parseRate(bad)), bad).toBe("INVALID_RATE");
  });

  it("converts across exponents with half-away-from-zero rounding", () => {
    expect(convertApprox(10000, "EUR", "USD", rates)).toBe(10800); // €100 -> $108
    expect(convertApprox(10800, "USD", "EUR", rates)).toBe(10000);
    expect(convertApprox(16050, "JPY", "EUR", rates)).toBe(10000); // ¥16050 -> €100.00
    expect(convertApprox(10000, "EUR", "JPY", rates)).toBe(16050);
    expect(convertApprox(1000, "USD", "JPY", rates)).toBe(1486); // $10 -> ¥1486.11
    expect(convertApprox(1000, "KWD", "USD", rates)).toBe(326); // 1 KWD -> $3.2628
    expect(convertApprox(-1000, "KWD", "USD", rates)).toBe(-326);
    expect(convertApprox(1, "JPY", "USD", rates)).toBe(1); // ¥1 = $0.0067 -> 1 cent
    expect(convertApprox(5, "USD", "USD", rates)).toBe(5);
  });

  it("rounds a half away from zero", () => {
    const r: ExchangeRates = { base: "USD", rates: { EUR: "0.5" } };
    expect(convertApprox(1, "USD", "EUR", r)).toBe(1); // 0.5 cents -> 1
    expect(convertApprox(-1, "USD", "EUR", r)).toBe(-1);
    expect(convertApprox(3, "USD", "EUR", r)).toBe(2); // 1.5 -> 2
  });

  it("missing rates", () => {
    expect(errCode(() => convertApprox(100, "CHF", "USD", rates))).toBe("MISSING_RATE");
    const t = approximateTotal({ USD: 10800, CHF: 500, EUR: 100 }, "EUR", rates);
    expect(t).toEqual({ currency: "EUR", approxMinor: 10100, approximate: true, missingCurrencies: ["CHF"] });
  });

  it("approximate category totals in a display currency", () => {
    const r = approximateCategoryTotals(expenses, "USD", rates);
    expect(r).toEqual({
      currency: "USD",
      approximate: true,
      byCategory: {
        food_drink: 4000 + 2019, // ¥3000 -> €18.69 -> $20.19 (rounded once)
        lodging: 30000,
        transport: 1081, // €10.01 -> $10.8108
      },
      missingCurrencies: [],
    });
  });

  it("rejects invalid currencies", () => {
    expect(errCode(() => convertApprox(1, "usd", "EUR", rates))).toBe("INVALID_CURRENCY");
  });
});
