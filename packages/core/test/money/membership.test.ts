import { describe, expect, it } from "vitest";
import {
  addToEvenSplit,
  adjustmentsForCorrection,
  applyDropOut,
  redistributeShare,
  replaceMember,
  resplitEvenly,
  splitEven,
  splitJustMe,
  type Split,
} from "../../src/money";
import { errCode, shareMap } from "./helpers";

const even = (totalMinor: number, ids: string[]): Split => {
  const { excludedGuestOfHonorIds: _x, rounding: _r, ...s } = splitEven({ totalMinor, currency: "USD", participantIds: ids });
  return s;
};

describe("drop-outs (FR-13, M-8)", () => {
  const airbnb = even(100000, ["a", "b", "c", "d"]); // 25000 each

  it("keep: unchanged", () => {
    expect(applyDropOut(airbnb, "d", "keep")).toEqual({ split: airbnb });
  });

  it("redistribute: spread over the others", () => {
    const { split } = applyDropOut(airbnb, "d", "redistribute");
    expect(shareMap(split.shares)).toEqual({ a: 33334, b: 33333, c: 33333 });
    expect(split.totalMinor).toBe(100000);
  });

  it("redistribute is proportional on uneven splits", () => {
    const s: Split = {
      currency: "USD",
      totalMinor: 1000,
      shares: [
        { memberId: "a", shareMinor: 600 },
        { memberId: "b", shareMinor: 300 },
        { memberId: "c", shareMinor: 100 },
      ],
    };
    expect(shareMap(redistributeShare(s, "c").shares)).toEqual({ a: 667, b: 333 });
  });

  it("redistribute among a chosen set, evenly", () => {
    const { split } = applyDropOut(airbnb, "d", "redistribute", { among: ["a", "b"] });
    expect(shareMap(split.shares)).toEqual({ a: 37500, b: 37500, c: 25000 });
  });

  it("redistribute to someone new", () => {
    expect(shareMap(redistributeShare(airbnb, "d", { among: ["e"] }).shares)).toEqual({ a: 25000, b: 25000, c: 25000, e: 25000 });
  });

  it("redistribute when remaining shares are all zero falls back to even", () => {
    const s: Split = {
      currency: "USD",
      totalMinor: 1000,
      shares: [
        { memberId: "a", shareMinor: 0 },
        { memberId: "b", shareMinor: 0 },
        { memberId: "c", shareMinor: 1000 },
      ],
    };
    expect(shareMap(redistributeShare(s, "c").shares)).toEqual({ a: 500, b: 500 });
  });

  it("redistribute a refund (negative shares)", () => {
    const s = even(-900, ["a", "b", "c"]);
    expect(shareMap(redistributeShare(s, "c").shares)).toEqual({ a: -450, b: -450 });
  });

  it("refund if replaced: flagged now, moved later", () => {
    const r = applyDropOut(airbnb, "d", "refund_if_replaced");
    expect(r.split).toEqual(airbnb);
    expect(r.pendingReplacement).toEqual({ memberId: "d", shareMinor: 25000 });
    const replaced = replaceMember(r.split, "d", "e");
    expect(shareMap(replaced.shares)).toEqual({ a: 25000, b: 25000, c: 25000, e: 25000 });
  });

  it("replaceMember merges into an existing participant", () => {
    expect(shareMap(replaceMember(airbnb, "d", "a").shares)).toEqual({ a: 50000, b: 25000, c: 25000 });
    expect(replaceMember(airbnb, "a", "a")).toEqual(airbnb);
  });

  it("locked expense: changes become adjustments that sum to zero", () => {
    const { split } = applyDropOut(airbnb, "d", "redistribute");
    const adj = adjustmentsForCorrection({ payerId: "a", ...airbnb }, { payerId: "a", ...split });
    expect(adj).toEqual([
      { memberId: "a", currency: "USD", deltaMinor: -8334 },
      { memberId: "b", currency: "USD", deltaMinor: -8333 },
      { memberId: "c", currency: "USD", deltaMinor: -8333 },
      { memberId: "d", currency: "USD", deltaMinor: 25000 },
    ]);
  });

  it("errors", () => {
    expect(errCode(() => applyDropOut(airbnb, "zz", "keep"))).toBe("UNKNOWN_MEMBER");
    expect(errCode(() => redistributeShare(airbnb, "zz"))).toBe("UNKNOWN_MEMBER");
    expect(errCode(() => redistributeShare(even(100, ["a"]), "a"))).toBe("NO_PARTICIPANTS");
    expect(errCode(() => redistributeShare(airbnb, "d", { among: ["d"] }))).toBe("UNKNOWN_MEMBER");
    expect(errCode(() => redistributeShare(airbnb, "d", { among: [] }))).toBe("NO_PARTICIPANTS");
    expect(errCode(() => replaceMember(airbnb, "zz", "e"))).toBe("UNKNOWN_MEMBER");
    expect(errCode(() => replaceMember(airbnb, "d", ""))).toBe("UNKNOWN_MEMBER");
  });
});

describe("late joiners (FR-12, M-5)", () => {
  it("re-splits evenly including the new member", () => {
    const s = addToEvenSplit(even(1000, ["a", "b", "c"]), ["d"]);
    expect(shareMap(s.shares)).toEqual({ a: 250, b: 250, c: 250, d: 250 });
  });

  it("adding someone already present is a no-op", () => {
    const s = even(1000, ["a", "b", "c"]);
    expect(addToEvenSplit(s, ["a"])).toEqual(s);
  });

  it("guest-of-honor late joiner pays nothing", () => {
    const s = addToEvenSplit(even(900, ["a", "b", "c"]), ["bride"], { guestOfHonorIds: ["bride"] });
    expect(shareMap(s.shares)).toEqual({ a: 300, b: 300, c: 300 });
  });
});

describe("solo expense becomes shared (FR-T10)", () => {
  it("just-me -> even split", () => {
    const solo = splitJustMe({ totalMinor: 5001, currency: "USD", memberId: "me" });
    expect(shareMap(resplitEvenly(solo, ["me", "sam"]).shares)).toEqual({ me: 2501, sam: 2500 });
  });
  it("re-split to nobody is an error", () => {
    expect(errCode(() => resplitEvenly(splitJustMe({ totalMinor: 1, currency: "USD", memberId: "me" }), []))).toBe("NO_PARTICIPANTS");
  });
});
