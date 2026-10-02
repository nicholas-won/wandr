import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  adjustmentsForCorrection,
  applyAdjustments,
  correctionAdjustments,
  refundableRemaining,
  splitEven,
  sumMinor,
  type LedgerExpense,
} from "../../src/money";
import { errCode } from "./helpers";

const exp = (total: number, payer: string, ids: string[]): LedgerExpense => {
  const s = splitEven({ totalMinor: total, currency: "USD", participantIds: ids });
  return { currency: "USD", totalMinor: total, payerId: payer, shares: s.shares };
};

describe("correctionAdjustments (FR-69, E-22)", () => {
  it("with no prior entries equals adjustmentsForCorrection", () => {
    const a = exp(9000, "a", ["a", "b", "c"]);
    const b = exp(12000, "a", ["a", "b", "c"]);
    expect(correctionAdjustments(a, [], b)).toEqual(adjustmentsForCorrection(a, b));
  });

  it("a second correction is relative to the already-corrected state", () => {
    const orig = exp(9000, "a", ["a", "b", "c"]);
    const v2 = exp(12000, "a", ["a", "b", "c"]);
    const v3 = exp(6000, "b", ["a", "b"]);
    const first = correctionAdjustments(orig, [], v2);
    const second = correctionAdjustments(orig, first, v3);
    // Net effect of original + all entries equals the final version.
    const nz = (r: { netMinor: number }[]) => r.filter((x) => x.netMinor !== 0);
    expect(nz(applyAdjustments(orig, [...first, ...second]))).toEqual(nz(applyAdjustments(v3, [])));
  });

  it("correcting back to the original reverses prior entries", () => {
    const orig = exp(9000, "a", ["a", "b", "c"]);
    const first = correctionAdjustments(orig, [], exp(3000, "a", ["a", "b"]));
    const back = correctionAdjustments(orig, first, orig);
    expect(sumMinor(back.map((e) => e.deltaMinor))).toBe(0);
    expect(applyAdjustments(orig, [...first, ...back])).toEqual(applyAdjustments(orig, []));
  });

  it("rejects currency changes and mismatched priors", () => {
    const orig = exp(100, "a", ["a", "b"]);
    expect(errCode(() => correctionAdjustments(orig, [], { ...orig, currency: "EUR" }))).toBe("CURRENCY_MISMATCH");
    expect(
      errCode(() =>
        correctionAdjustments(
          orig,
          [
            { memberId: "a", currency: "EUR", deltaMinor: 1 },
            { memberId: "b", currency: "EUR", deltaMinor: -1 },
          ],
          orig,
        ),
      ),
    ).toBe("CURRENCY_MISMATCH");
  });

  it("property: chains of corrections always land exactly on the last version", () => {
    const ids = ["a", "b", "c", "d"];
    const version = fc.record({
      total: fc.integer({ min: 0, max: 1_000_000 }),
      payer: fc.constantFrom(...ids),
      people: fc.subarray(ids, { minLength: 1 }),
    });
    fc.assert(
      fc.property(version, fc.array(version, { minLength: 1, maxLength: 5 }), (o, vs) => {
        const orig = exp(o.total, o.payer, o.people);
        let entries: ReturnType<typeof correctionAdjustments> = [];
        let last = orig;
        for (const v of vs) {
          last = exp(v.total, v.payer, v.people);
          entries = [...entries, ...correctionAdjustments(orig, entries, last)];
        }
        const got = applyAdjustments(orig, entries).filter((r) => r.netMinor !== 0);
        const want = applyAdjustments(last, []).filter((r) => r.netMinor !== 0);
        expect(got).toEqual(want);
      }),
    );
  });
});

describe("refundableRemaining (FR-72)", () => {
  it("subtracts earlier refunds and never goes negative", () => {
    expect(refundableRemaining(10000, [])).toBe(10000);
    expect(refundableRemaining(10000, [-2500, -500])).toBe(7000);
    expect(refundableRemaining(10000, [-12000])).toBe(0);
  });
  it("rejects non-integers", () => {
    expect(errCode(() => refundableRemaining(10.5, []))).toBe("INVALID_AMOUNT");
  });
});

describe("sumMinor", () => {
  it("sums exactly", () => {
    expect(sumMinor([1, 2, -3, 9007199254740000])).toBe(9007199254740000);
    expect(errCode(() => sumMinor([Number.MAX_SAFE_INTEGER, 1]))).toBe("UNSAFE_INTEGER");
  });
});
