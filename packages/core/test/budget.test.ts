import { describe, expect, it } from "vitest";
import {
  BUDGET_TAG_LABELS,
  budgetView,
  computeBudgetOpenTo,
  groupBudgetBand,
  minorPerMajor,
  roundBandDown,
  roundBandUp,
  tagIdeaPrice,
  type BudgetAnswer,
} from "../src/budget";

const usd = (dollars: number) => dollars * 100;
const ans = (memberId: string, min: number, max: number, openTo: string[] = [], currency = "USD"): BudgetAnswer => ({
  memberId,
  currency,
  minMinor: usd(min),
  maxMinor: usd(max),
  openTo,
});

describe("rounding (FR-74, V-5)", () => {
  it.each([
    [0, 0],
    [usd(47), usd(40)],
    [usd(320) + 75, usd(300)],
    [usd(1250), usd(1000)],
    [usd(9), usd(9)],
  ])("down %i → %i", (input, out) => expect(roundBandDown(input, "USD")).toBe(out));

  it.each([
    [0, 0],
    [usd(41), usd(50)],
    [usd(470), usd(500)],
    [usd(500), usd(500)],
    [usd(1001), usd(2000)],
    [usd(999) + 50, usd(1000)],
  ])("up %i → %i", (input, out) => expect(roundBandUp(input, "USD")).toBe(out));

  it("respects currency exponent", () => {
    expect(minorPerMajor("USD")).toBe(100);
    expect(minorPerMajor("JPY")).toBe(1);
    expect(roundBandUp(34_500, "JPY")).toBe(40_000);
    expect(roundBandDown(34_500, "JPY")).toBe(30_000);
  });

  it("rejects floats and negatives", () => {
    expect(() => roundBandUp(1.5, "USD")).toThrow(RangeError);
    expect(() => roundBandDown(-1, "USD")).toThrow(RangeError);
  });
});

describe("groupBudgetBand (FR-74)", () => {
  it("hidden until 3 answers", () => {
    expect(groupBudgetBand([ans("a", 300, 500), ans("b", 200, 400)], "USD")).toBeNull();
  });
  it("[lowest min, lowest max] rounded outward", () => {
    expect(groupBudgetBand([ans("a", 320, 470), ans("b", 450, 900), ans("c", 380, 1200)], "USD")).toEqual({
      currency: "USD",
      lowMinor: usd(300),
      highMinor: usd(500),
    });
  });
  it("only counts answers in the requested currency", () => {
    expect(groupBudgetBand([ans("a", 1, 2), ans("b", 1, 2), ans("c", 1, 2, [], "EUR")], "USD")).toBeNull();
  });
});

describe("budgetView + tags", () => {
  it("solo: own only; within/over", () => {
    const view = budgetView({ viewerId: "me", size: "solo", answers: [ans("me", 100, 300)], currency: "USD" });
    expect(view).toMatchObject({ own: { maxMinor: usd(300) }, others: [], band: null });
    expect(tagIdeaPrice({ amountMinor: usd(300), currency: "USD" }, view)).toBe("within_budget");
    expect(tagIdeaPrice({ amountMinor: usd(301), currency: "USD" }, view)).toBe("over_budget");
    expect(tagIdeaPrice(null, view)).toBeNull();
    expect(tagIdeaPrice({ amountMinor: usd(10), currency: "EUR" }, view)).toBeNull();
  });

  describe("duo (FR-T9)", () => {
    const pair = ["me", "sam"];
    it("partner hidden until the viewer has answered too", () => {
      const view = budgetView({ viewerId: "me", size: "duo", answers: [ans("sam", 100, 200, pair)], currency: "USD" });
      expect(view.others).toEqual([]);
      expect(tagIdeaPrice({ amountMinor: usd(50), currency: "USD" }, view)).toBeNull();
    });
    it("both answered → see each other; tags", () => {
      const view = budgetView({
        viewerId: "me",
        size: "duo",
        answers: [ans("me", 100, 400, pair), ans("sam", 100, 200, pair)],
        currency: "USD",
      });
      expect(view.others.map((o) => o.memberId)).toEqual(["sam"]);
      expect(tagIdeaPrice({ amountMinor: usd(200), currency: "USD" }, view)).toBe("within_both");
      expect(tagIdeaPrice({ amountMinor: usd(300), currency: "USD" }, view)).toBe("over_one");
      expect(tagIdeaPrice({ amountMinor: usd(500), currency: "USD" }, view)).toBe("over_both");
      expect(BUDGET_TAG_LABELS.over_one).toBe("over one of your budgets");
      expect(BUDGET_TAG_LABELS.within_both).toBe("within both budgets");
    });
    it("group → duo: answers given privately in the group stay hidden", () => {
      const view = budgetView({ viewerId: "me", size: "duo", answers: [ans("me", 1, 2), ans("sam", 1, 2)], currency: "USD" });
      expect(view.others).toEqual([]);
      expect(view.band).toBeNull();
    });
  });

  describe("group (FR-74, FR-T4)", () => {
    const pair = ["a", "b"];
    const answers = [ans("a", 320, 470, pair), ans("b", 450, 900, pair), ans("c", 380, 1200)];

    it("original duo still sees each other's ranges; newcomer sees only the band", () => {
      const a = budgetView({ viewerId: "a", size: "group", answers, currency: "USD" });
      const c = budgetView({ viewerId: "c", size: "group", answers, currency: "USD" });
      expect(a.others.map((o) => o.memberId)).toEqual(["b"]);
      expect(c.others).toEqual([]);
      expect(c.band).toEqual({ currency: "USD", lowMinor: usd(300), highMinor: usd(500) });
    });

    it("tags against the band's rounded top", () => {
      const view = budgetView({ viewerId: "c", size: "group", answers, currency: "USD" });
      expect(tagIdeaPrice({ amountMinor: usd(480), currency: "USD" }, view)).toBe("within_budget");
      expect(tagIdeaPrice({ amountMinor: usd(501), currency: "USD" }, view)).toBe("splurge");
    });

    it("no band and no tags with fewer than 3 answers", () => {
      const view = budgetView({ viewerId: "c", size: "group", answers: answers.slice(1), currency: "USD" });
      expect(view.band).toBeNull();
      expect(tagIdeaPrice({ amountMinor: usd(1), currency: "USD" }, view)).toBeNull();
    });
  });

  it("computeBudgetOpenTo mirrors votes", () => {
    expect(computeBudgetOpenTo("duo", ["a", "b"])).toEqual(["a", "b"]);
    expect(computeBudgetOpenTo("group", ["a", "b", "c"])).toEqual([]);
  });
});
