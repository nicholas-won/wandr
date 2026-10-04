import { describe, expect, it } from "vitest";
import {
  assertValidSplit,
  looksLikeGratuity,
  splitItemized,
  validateReceipt,
  type ItemizedSplitInput,
} from "../../src/money";
import { errCode, shareMap, sum } from "./helpers";

const dinner: ItemizedSplitInput = {
  totalMinor: 8450,
  currency: "USD",
  payerId: "a",
  items: [
    { id: "pasta", amountMinor: 2000, claims: [{ memberId: "a" }] },
    { id: "steak", amountMinor: 3000, claims: [{ memberId: "b" }] },
    { id: "wine", amountMinor: 1500, claims: [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }] },
  ],
  charges: [
    { kind: "tax", amountMinor: 650 },
    { kind: "tip", amountMinor: 1300 },
  ],
};

describe("validateReceipt (FR-61)", () => {
  it("balanced receipt", () => {
    const v = validateReceipt(dinner);
    expect(v).toEqual({
      itemsMinor: 6500,
      chargesMinor: 1950,
      computedTotalMinor: 8450,
      discrepancyMinor: 0,
      balanced: true,
      warnings: [],
    });
  });

  it("reports the gap when lines don't add up (E-6)", () => {
    const v = validateReceipt({ ...dinner, totalMinor: 9690 });
    expect(v.balanced).toBe(false);
    expect(v.discrepancyMinor).toBe(1240);
    expect(v.warnings).toEqual([{ code: "DISCREPANCY", message: expect.any(String), amountMinor: 1240 }]);
    expect(validateReceipt({ ...dinner, totalMinor: 8000 }).discrepancyMinor).toBe(-450);
  });

  it("VAT-inclusive tax is not added twice (E-4)", () => {
    const v = validateReceipt({
      totalMinor: 1200,
      currency: "EUR",
      items: [{ amountMinor: 1200 }],
      charges: [{ kind: "tax", amountMinor: 200, includedInItems: true }],
    });
    expect(v.balanced).toBe(true);
    expect(v.chargesMinor).toBe(0);
  });

  it("discounts and fees count toward the total (E-5)", () => {
    const v = validateReceipt({
      totalMinor: 1050,
      currency: "USD",
      items: [{ amountMinor: 1000 }],
      charges: [
        { kind: "discount", amountMinor: -100 },
        { kind: "fee", amountMinor: 150, label: "Card surcharge" },
      ],
    });
    expect(v.balanced).toBe(true);
  });

  describe("double gratuity (E-4/6/7)", () => {
    it("service charge line plus a tip", () => {
      const v = validateReceipt({
        totalMinor: 14800,
        currency: "USD",
        items: [{ amountMinor: 10000 }],
        charges: [
          { kind: "service_charge", amountMinor: 1800, label: "Auto gratuity 18% (party of 8)" },
          { kind: "tip", amountMinor: 2000 },
          { kind: "tax", amountMinor: 1000 },
        ],
      });
      expect(v.balanced).toBe(true);
      expect(v.warnings.map((w) => w.code)).toEqual(["DOUBLE_GRATUITY"]);
      expect(v.warnings[0]!.amountMinor).toBe(2000);
    });

    it("gratuity hidden in an item line plus a tip", () => {
      const v = validateReceipt({
        totalMinor: 13000,
        currency: "USD",
        items: [{ amountMinor: 10000, label: "Food" }, { amountMinor: 2000, label: "GRATUITY 20%" }],
        charges: [{ kind: "tip", amountMinor: 1000 }],
      });
      expect(v.warnings.map((w) => w.code)).toEqual(["DOUBLE_GRATUITY"]);
    });

    it("fee labelled as a service charge plus a tip", () => {
      const v = validateReceipt({
        totalMinor: 1300,
        currency: "EUR",
        items: [{ amountMinor: 1000 }],
        charges: [
          { kind: "fee", amountMinor: 200, label: "Servizio 20%" },
          { kind: "tip", amountMinor: 100 },
        ],
      });
      expect(v.warnings.map((w) => w.code)).toEqual(["DOUBLE_GRATUITY"]);
    });

    it("service charge without tip: 'Tip already included'", () => {
      const v = validateReceipt({
        totalMinor: 11800,
        currency: "USD",
        items: [{ amountMinor: 10000 }],
        charges: [{ kind: "service_charge", amountMinor: 1800 }],
      });
      expect(v.warnings.map((w) => w.code)).toEqual(["GRATUITY_INCLUDED"]);
    });

    it("a tip alone is fine", () => {
      expect(validateReceipt(dinner).warnings).toEqual([]);
    });

    it("zero tip with a service charge is not double", () => {
      const v = validateReceipt({
        totalMinor: 11800,
        currency: "USD",
        items: [{ amountMinor: 10000 }],
        charges: [
          { kind: "service_charge", amountMinor: 1800 },
          { kind: "tip", amountMinor: 0 },
        ],
      });
      expect(v.warnings.map((w) => w.code)).toEqual(["GRATUITY_INCLUDED"]);
    });

    it("both warnings at once: double gratuity and discrepancy", () => {
      const v = validateReceipt({
        totalMinor: 99999,
        currency: "USD",
        items: [{ amountMinor: 10000 }],
        charges: [
          { kind: "service_charge", amountMinor: 1800 },
          { kind: "tip", amountMinor: 500 },
        ],
      });
      expect(v.warnings.map((w) => w.code)).toEqual(["DOUBLE_GRATUITY", "DISCREPANCY"]);
    });
  });

  it("looksLikeGratuity", () => {
    for (const l of ["Gratuity", "SERVICE CHARGE", "Service chg 18%", "auto-grat", "Pourboire", "Propina sugerida", "Trinkgeld", "服务费", "サービス料", "봉사료"]) {
      expect(looksLikeGratuity(l), l).toBe(true);
    }
    for (const l of ["Grilled fish", "Tax", "Service station snacks", undefined]) {
      expect(looksLikeGratuity(l), String(l)).toBe(false);
    }
  });

  it("rejects wrongly signed charges", () => {
    expect(errCode(() => validateReceipt({ totalMinor: 0, currency: "USD", items: [], charges: [{ kind: "discount", amountMinor: 100 }] }))).toBe(
      "INVALID_AMOUNT",
    );
    expect(errCode(() => validateReceipt({ totalMinor: 0, currency: "USD", items: [], charges: [{ kind: "tip", amountMinor: -100 }] }))).toBe(
      "INVALID_AMOUNT",
    );
    expect(errCode(() => validateReceipt({ totalMinor: 0, currency: "USD", items: [{ amountMinor: 1.5 }] }))).toBe("INVALID_AMOUNT");
  });
});

describe("splitItemized (FR-62)", () => {
  it("tax and tip are proportional to item subtotals; shared item split equally", () => {
    const s = splitItemized(dinner);
    assertValidSplit(s);
    expect(s.breakdown).toEqual([
      { memberId: "a", itemsMinor: 2500, chargesMinor: 750, differenceMinor: 0, shareMinor: 3250 },
      { memberId: "b", itemsMinor: 3500, chargesMinor: 1050, differenceMinor: 0, shareMinor: 4550 },
      { memberId: "c", itemsMinor: 500, chargesMinor: 150, differenceMinor: 0, shareMinor: 650 },
    ]);
    expect(s.unclaimedItemIds).toEqual([]);
  });

  it("rounding: shares still sum exactly to the total", () => {
    const s = splitItemized({
      totalMinor: 1000,
      currency: "USD",
      payerId: "a",
      items: [{ id: "x", amountMinor: 899, claims: [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }] }],
      charges: [{ kind: "tax", amountMinor: 101 }],
    });
    expect(sum(s.shares.map((x) => x.shareMinor))).toBe(1000);
    expect(s.shares.map((x) => x.shareMinor)).toEqual([334, 333, 333]);
    for (const b of s.breakdown) expect(b.itemsMinor + b.chargesMinor + b.differenceMinor).toBe(b.shareMinor);
    expect(sum(s.breakdown.map((b) => b.itemsMinor))).toBe(899);
  });

  it("quantity claims via weights (E-3)", () => {
    const s = splitItemized({
      totalMinor: 3600,
      currency: "USD",
      payerId: "a",
      items: [{ id: "margs", label: "3 x Margarita", amountMinor: 3600, claims: [{ memberId: "a", weight: 2 }, { memberId: "b", weight: 1 }] }],
    });
    expect(shareMap(s.shares)).toEqual({ a: 2400, b: 1200 });
  });

  it("uneven shared item weights with odd amounts stay exact", () => {
    const s = splitItemized({
      totalMinor: 1001,
      currency: "USD",
      payerId: "a",
      items: [
        { id: "1", amountMinor: 333, claims: [{ memberId: "a", weight: 3 }, { memberId: "b", weight: 4 }] },
        { id: "2", amountMinor: 668, claims: [{ memberId: "b" }, { memberId: "c" }, { memberId: "d" }] },
      ],
    });
    assertValidSplit(s);
    // exact: a 142.714, b 190.286 + 222.667 = 412.952, c 222.667, d 222.667
    expect(shareMap(s.shares)).toEqual({ a: 143, b: 413, c: 223, d: 222 });
  });

  it("bill-level discount is proportional; line-level discount sticks to the item (E-5)", () => {
    const s = splitItemized({
      totalMinor: 2500,
      currency: "USD",
      payerId: "a",
      items: [
        { id: "a1", amountMinor: 2000, claims: [{ memberId: "a" }] },
        { id: "a1-coupon", amountMinor: -500, claims: [{ memberId: "a" }] },
        { id: "b1", amountMinor: 1500, claims: [{ memberId: "b" }] },
      ],
      charges: [{ kind: "discount", amountMinor: -500 }],
    });
    // subtotals a 1500, b 1500; bill discount 500 split 250/250
    expect(shareMap(s.shares)).toEqual({ a: 1250, b: 1250 });
  });

  it("VAT-inclusive receipt: tax info line doesn't change shares", () => {
    const s = splitItemized({
      totalMinor: 3000,
      currency: "EUR",
      payerId: "a",
      items: [
        { id: "1", amountMinor: 1000, claims: [{ memberId: "a" }] },
        { id: "2", amountMinor: 2000, claims: [{ memberId: "b" }] },
      ],
      charges: [{ kind: "tax", amountMinor: 500, includedInItems: true }],
    });
    expect(shareMap(s.shares)).toEqual({ a: 1000, b: 2000 });
  });

  it("surfaces double-gratuity warnings without blocking the split", () => {
    const s = splitItemized({
      totalMinor: 1300,
      currency: "USD",
      payerId: "a",
      items: [{ id: "1", amountMinor: 1000, claims: [{ memberId: "a" }, { memberId: "b" }] }],
      charges: [
        { kind: "service_charge", amountMinor: 200 },
        { kind: "tip", amountMinor: 100 },
      ],
    });
    expect(s.validation.warnings.map((w) => w.code)).toEqual(["DOUBLE_GRATUITY"]);
    expect(shareMap(s.shares)).toEqual({ a: 650, b: 650 });
  });

  it("JPY and KWD", () => {
    const jpy = splitItemized({
      totalMinor: 10000,
      currency: "JPY",
      payerId: "a",
      items: [
        { id: "1", amountMinor: 3000, claims: [{ memberId: "a" }] },
        { id: "2", amountMinor: 6091, claims: [{ memberId: "b" }, { memberId: "c" }] },
      ],
      charges: [{ kind: "tax", amountMinor: 909 }],
    });
    assertValidSplit(jpy);
    const kwd = splitItemized({
      totalMinor: 12345,
      currency: "KWD",
      payerId: "a",
      items: [{ id: "1", amountMinor: 11111, claims: [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }] }],
      charges: [{ kind: "service_charge", amountMinor: 1234 }],
    });
    assertValidSplit(kwd);
    expect(kwd.shares.map((s) => s.shareMinor)).toEqual([4115, 4115, 4115]);
  });

  it("zero-amount items need no claims", () => {
    const s = splitItemized({
      totalMinor: 500,
      currency: "USD",
      payerId: "a",
      items: [
        { id: "free-bread", amountMinor: 0, claims: [] },
        { id: "1", amountMinor: 500, claims: [{ memberId: "b" }] },
      ],
    });
    expect(shareMap(s.shares)).toEqual({ b: 500 });
  });

  describe("unclaimed items (FR-62, E-1)", () => {
    const base: ItemizedSplitInput = {
      totalMinor: 3300,
      currency: "USD",
      payerId: "p",
      items: [
        { id: "1", amountMinor: 1000, claims: [{ memberId: "a" }] },
        { id: "2", amountMinor: 2000, claims: [] },
      ],
      charges: [{ kind: "tax", amountMinor: 300 }],
    };

    it("blocks by default and lists the items", () => {
      try {
        splitItemized(base);
        expect.unreachable();
      } catch (e) {
        expect((e as { code: string }).code).toBe("UNCLAIMED_ITEMS");
        expect((e as { details: unknown }).details).toEqual({ itemIds: ["2"] });
      }
    });

    it("an absorbed item goes to the payer (with its share of tax)", () => {
      const s = splitItemized({ ...base, items: [base.items[0]!, { ...base.items[1]!, absorbed: true }] });
      expect(shareMap(s.shares)).toEqual({ a: 1100, p: 2200 });
      expect(s.unclaimedItemIds).toEqual(["2"]);
    });

    it("absorb policy covers all unclaimed items", () => {
      expect(shareMap(splitItemized({ ...base, unclaimed: "absorb" }).shares)).toEqual({ a: 1100, p: 2200 });
    });

    it("split-evenly policy (DN-17 A)", () => {
      const s = splitItemized({ ...base, unclaimed: { splitEvenlyAmong: ["a", "b"] } });
      expect(shareMap(s.shares)).toEqual({ a: 2200, b: 1100 });
      expect(errCode(() => splitItemized({ ...base, unclaimed: { splitEvenlyAmong: [] } }))).toBe("NO_PARTICIPANTS");
    });

    it("claims win over the absorbed flag", () => {
      const s = splitItemized({ ...base, items: [base.items[0]!, { ...base.items[1]!, claims: [{ memberId: "b" }], absorbed: true }] });
      expect(shareMap(s.shares)).toEqual({ a: 1100, b: 2200 });
    });

    it("all items unclaimed and absorbed: the payer covers everything", () => {
      const s = splitItemized({
        ...base,
        items: base.items.map((i) => ({ ...i, claims: [] })),
        unclaimed: "absorb",
      });
      expect(s.shares).toEqual([{ memberId: "p", shareMinor: 3300 }]);
      expect(s.unclaimedItemIds).toEqual(["1", "2"]);
    });

    it("all items unclaimed with the default policy is an error", () => {
      expect(errCode(() => splitItemized({ ...base, items: base.items.map((i) => ({ ...i, claims: [] })) }))).toBe("UNCLAIMED_ITEMS");
    });
  });

  describe("receipt discrepancy (E-6)", () => {
    const off: ItemizedSplitInput = { ...dinner, totalMinor: 8650 }; // 200 unaccounted

    it("blocks by default", () => {
      expect(errCode(() => splitItemized(off))).toBe("RECEIPT_DISCREPANCY");
    });

    it("assign the difference to one person", () => {
      const s = splitItemized({ ...off, difference: { assignTo: "c" } });
      assertValidSplit(s);
      expect(shareMap(s.shares)).toEqual({ a: 3250, b: 4550, c: 850 });
      expect(s.breakdown.find((b) => b.memberId === "c")!.differenceMinor).toBe(200);
    });

    it("assign to someone not otherwise on the receipt", () => {
      const s = splitItemized({ ...off, difference: { assignTo: "z" } });
      expect(shareMap(s.shares)).toEqual({ a: 3250, b: 4550, c: 650, z: 200 });
    });

    it("split the difference evenly", () => {
      const s = splitItemized({ ...off, difference: { splitEvenlyAmong: ["a", "b", "c"] } });
      expect(shareMap(s.shares)).toEqual({ a: 3317, b: 4617, c: 716 });
    });

    it("negative difference (lines exceed total) is split too", () => {
      const s = splitItemized({ ...dinner, totalMinor: 8350, difference: { splitEvenlyAmong: ["a", "b"] } });
      expect(shareMap(s.shares)).toEqual({ a: 3200, b: 4500, c: 650 });
    });
  });

  describe("guest of honor (FR-90)", () => {
    it("policy proportional: their items are redistributed proportionally to everyone else's subtotal", () => {
      const s = splitItemized({
        totalMinor: 6600,
        currency: "USD",
        payerId: "a",
        items: [
          { id: "1", amountMinor: 1000, claims: [{ memberId: "a" }] },
          { id: "2", amountMinor: 3000, claims: [{ memberId: "b" }] },
          { id: "3", amountMinor: 2000, claims: [{ memberId: "bride" }] },
        ],
        charges: [{ kind: "tax", amountMinor: 600 }],
        guestOfHonorIds: ["bride"],
        guestOfHonorPolicy: "proportional",
      });
      expect(shareMap(s.shares)).toEqual({ a: 1650, b: 4950 });
      expect(s.excludedGuestOfHonorIds).toEqual(["bride"]);
    });

    // Q19: default "sharers"; alternatives "even" and "proportional".
    const bach = {
      totalMinor: 9900,
      currency: "USD",
      payerId: "a",
      items: [
        { id: "1", amountMinor: 1000, claims: [{ memberId: "a" }] },
        { id: "2", amountMinor: 3000, claims: [{ memberId: "b" }] },
        { id: "3", amountMinor: 3000, claims: [{ memberId: "c" }, { memberId: "bride" }] },
        { id: "4", amountMinor: 2000, claims: [{ memberId: "bride" }] },
      ],
      charges: [{ kind: "tax" as const, amountMinor: 900 }],
      guestOfHonorIds: ["bride"],
    };

    it("Q19 default (sharers): only the people who shared the item pick it up", () => {
      const s = splitItemized(bach);
      // item 3 goes wholly to c; item 4 (only the bride) falls back to even among a, b, c.
      // subtotals: a 1000+666.67, b 3000+666.67, c 3000+666.67 (c took the whole shared bottle) → +10% tax.
      expect(s.gohFallbackItemIds).toEqual(["4"]);
      expect(sum(s.shares.map((x) => x.shareMinor))).toBe(9900);
      expect(s.shares.find((x) => x.memberId === "bride")).toBeUndefined();
      const m = shareMap(s.shares);
      expect(m).toEqual({ a: 1834, b: 4033, c: 4033 });
      // Q18: with leftoverTo the uploader takes the leftover penny instead.
      const u = splitItemized({ ...bach, leftoverTo: ["c"] });
      expect(shareMap(u.shares)).toEqual({ a: 1833, b: 4033, c: 4034 });
      expect(u.rounding).toEqual({ leftoverMinor: 1, memberId: "c" });
    });

    it("Q19 even: the guest of honor's portion of each item goes evenly to everyone else", () => {
      const s = splitItemized({ ...bach, guestOfHonorPolicy: "even", everyoneElse: ["a", "b", "c", "bride"] });
      // bride's portion: 1500 (half of item 3) + 2000 = 3500 → 1166.67 each.
      // subtotals: a 2166.67, b 4166.67, c 2666.67 → ×1.1
      expect(sum(s.shares.map((x) => x.shareMinor))).toBe(9900);
      expect(s.gohFallbackItemIds).toEqual([]);
      expect(shareMap(s.shares)).toEqual({ a: 2384, b: 4583, c: 2933 });
    });

    it("Q19 proportional matches the old behavior", () => {
      const s = splitItemized({ ...bach, guestOfHonorPolicy: "proportional" });
      expect(sum(s.shares.map((x) => x.shareMinor))).toBe(9900);
      // a 1000, b 3000, c 1500 → weights 2:6:3 over 9000 + tax
      expect(shareMap(s.shares)).toEqual({ a: 1800, b: 5400, c: 2700 });
    });

    it("Q19: a receipt only the guest of honor claimed still errors", () => {
      expect(
        errCode(() =>
          splitItemized({
            totalMinor: 1000,
            currency: "USD",
            payerId: "a",
            items: [{ id: "1", amountMinor: 1000, claims: [{ memberId: "bride" }] }],
            guestOfHonorIds: ["bride"],
          }),
        ),
      ).toBe("ALL_GUESTS_OF_HONOR");
    });

    it("shared item with the guest of honor", () => {
      const s = splitItemized({
        totalMinor: 1500,
        currency: "USD",
        payerId: "a",
        items: [{ id: "wine", amountMinor: 1500, claims: [{ memberId: "a" }, { memberId: "b" }, { memberId: "bride" }] }],
        guestOfHonorIds: ["bride"],
      });
      expect(shareMap(s.shares)).toEqual({ a: 750, b: 750 });
    });

    it("guest of honor as payer still pays nothing but is credited", () => {
      const s = splitItemized({
        totalMinor: 2000,
        currency: "USD",
        payerId: "bride",
        items: [
          { id: "1", amountMinor: 1000, claims: [{ memberId: "a" }] },
          { id: "2", amountMinor: 1000, claims: [{ memberId: "bride" }] },
        ],
        guestOfHonorIds: ["bride"],
      });
      expect(shareMap(s.shares)).toEqual({ a: 2000 });
    });

    it("only guests of honor claimed items: error", () => {
      expect(
        errCode(() =>
          splitItemized({
            totalMinor: 1000,
            currency: "USD",
            payerId: "a",
            items: [{ id: "1", amountMinor: 1000, claims: [{ memberId: "bride" }] }],
            guestOfHonorIds: ["bride"],
          }),
        ),
      ).toBe("ALL_GUESTS_OF_HONOR");
    });

    it("difference can't be assigned to a guest of honor; even-split skips them", () => {
      const input: ItemizedSplitInput = {
        totalMinor: 1100,
        currency: "USD",
        payerId: "a",
        items: [{ id: "1", amountMinor: 1000, claims: [{ memberId: "a" }, { memberId: "b" }] }],
        guestOfHonorIds: ["g"],
      };
      expect(errCode(() => splitItemized({ ...input, difference: { assignTo: "g" } }))).toBe("ALL_GUESTS_OF_HONOR");
      const s = splitItemized({ ...input, difference: { splitEvenlyAmong: ["a", "b", "g"] } });
      expect(shareMap(s.shares)).toEqual({ a: 550, b: 550 });
      expect(s.excludedGuestOfHonorIds).toEqual(["g"]);
    });
  });

  describe("validation errors", () => {
    const one = (claims: { memberId: string; weight?: number }[], amountMinor = 100) =>
      ({ totalMinor: amountMinor, currency: "USD", payerId: "a", items: [{ id: "1", amountMinor, claims }] }) as ItemizedSplitInput;

    it("duplicate claims", () => {
      expect(errCode(() => splitItemized(one([{ memberId: "a" }, { memberId: "a" }])))).toBe("DUPLICATE_MEMBER");
    });
    it("bad claim weights", () => {
      expect(errCode(() => splitItemized(one([{ memberId: "a", weight: 0 }])))).toBe("INVALID_WEIGHT");
      expect(errCode(() => splitItemized(one([{ memberId: "a", weight: 1.5 }])))).toBe("INVALID_WEIGHT");
      expect(errCode(() => splitItemized(one([{ memberId: "a", weight: -1 }])))).toBe("INVALID_WEIGHT");
    });
    it("duplicate item ids", () => {
      expect(
        errCode(() =>
          splitItemized({
            totalMinor: 200,
            currency: "USD",
            payerId: "a",
            items: [
              { id: "1", amountMinor: 100, claims: [{ memberId: "a" }] },
              { id: "1", amountMinor: 100, claims: [{ memberId: "a" }] },
            ],
          }),
        ),
      ).toBe("DUPLICATE_MEMBER");
    });
    it("a member whose claims net negative", () => {
      expect(
        errCode(() =>
          splitItemized({
            totalMinor: 500,
            currency: "USD",
            payerId: "a",
            items: [
              { id: "1", amountMinor: 1000, claims: [{ memberId: "a" }] },
              { id: "2", amountMinor: -500, claims: [{ memberId: "b" }] },
            ],
          }),
        ),
      ).toBe("NEGATIVE_SUBTOTAL");
    });
    it("charges with nothing claimed", () => {
      expect(
        errCode(() =>
          splitItemized({
            totalMinor: 100,
            currency: "USD",
            payerId: "a",
            items: [{ id: "1", amountMinor: 0, claims: [{ memberId: "a" }] }],
            charges: [{ kind: "fee", amountMinor: 100 }],
          }),
        ),
      ).toBe("ZERO_TOTAL_WEIGHT");
    });
    it("bad payer", () => {
      expect(errCode(() => splitItemized({ ...dinner, payerId: "" }))).toBe("UNKNOWN_MEMBER");
    });
  });
});
