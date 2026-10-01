import { describe, expect, it } from "vitest";
import {
  assertValidSplit,
  mergeShares,
  normalizeMemberIds,
  splitByWeights,
  splitEven,
  splitJustMe,
} from "../../src/money";
import { errCode, shareMap } from "./helpers";

describe("splitEven (FR-62)", () => {
  it("$10 three ways, lowest member id gets the extra cent", () => {
    const s = splitEven({ totalMinor: 1000, currency: "USD", participantIds: ["carol", "alice", "bob"] });
    expect(s.shares).toEqual([
      { memberId: "alice", shareMinor: 334 },
      { memberId: "bob", shareMinor: 333 },
      { memberId: "carol", shareMinor: 333 },
    ]);
    expect(s.totalMinor).toBe(1000);
    expect(s.excludedGuestOfHonorIds).toEqual([]);
    assertValidSplit(s);
  });

  it("is independent of input order", () => {
    const a = splitEven({ totalMinor: 1001, currency: "USD", participantIds: ["a", "b", "c"] });
    const b = splitEven({ totalMinor: 1001, currency: "USD", participantIds: ["c", "a", "b"] });
    expect(a).toEqual(b);
  });

  it("one member takes it all", () => {
    expect(splitEven({ totalMinor: 4242, currency: "USD", participantIds: ["solo"] }).shares).toEqual([
      { memberId: "solo", shareMinor: 4242 },
    ]);
  });

  it("duo split", () => {
    expect(shareMap(splitEven({ totalMinor: 8421, currency: "USD", participantIds: ["me", "sam"] }).shares)).toEqual({
      me: 4211,
      sam: 4210,
    });
  });

  it("JPY (no minor unit) splits whole yen", () => {
    expect(shareMap(splitEven({ totalMinor: 10000, currency: "JPY", participantIds: ["a", "b", "c"] }).shares)).toEqual({
      a: 3334,
      b: 3333,
      c: 3333,
    });
  });

  it("KWD (3 decimals) splits to the fils", () => {
    expect(shareMap(splitEven({ totalMinor: 10000, currency: "KWD", participantIds: ["a", "b", "c"] }).shares)).toEqual({
      a: 3334,
      b: 3333,
      c: 3333,
    });
  });

  it("more people than cents: some pay 0", () => {
    expect(splitEven({ totalMinor: 2, currency: "USD", participantIds: ["a", "b", "c", "d"] }).shares.map((s) => s.shareMinor)).toEqual([
      1, 1, 0, 0,
    ]);
  });

  it("zero and negative totals", () => {
    expect(splitEven({ totalMinor: 0, currency: "USD", participantIds: ["a", "b"] }).shares.map((s) => s.shareMinor)).toEqual([0, 0]);
    expect(splitEven({ totalMinor: -1000, currency: "USD", participantIds: ["a", "b", "c"] }).shares.map((s) => s.shareMinor)).toEqual([
      -334, -333, -333,
    ]);
  });

  it("huge amounts", () => {
    const s = splitEven({ totalMinor: Number.MAX_SAFE_INTEGER, currency: "USD", participantIds: ["a", "b", "c", "d", "e", "f", "g"] });
    assertValidSplit(s);
  });

  it("rotation option", () => {
    expect(
      splitEven({ totalMinor: 1000, currency: "USD", participantIds: ["a", "b", "c"], tieBreakStart: 2 }).shares.map((s) => s.shareMinor),
    ).toEqual([333, 333, 334]);
  });

  describe("guest of honor (FR-90)", () => {
    it("excludes them and spreads their share", () => {
      const s = splitEven({
        totalMinor: 1000,
        currency: "USD",
        participantIds: ["bride", "a", "b", "c"],
        guestOfHonorIds: ["bride"],
      });
      expect(shareMap(s.shares)).toEqual({ a: 334, b: 333, c: 333 });
      expect(s.excludedGuestOfHonorIds).toEqual(["bride"]);
    });

    it("multiple guests of honor", () => {
      const s = splitEven({
        totalMinor: 900,
        currency: "USD",
        participantIds: ["g1", "g2", "a", "b", "c"],
        guestOfHonorIds: ["g2", "g1"],
      });
      expect(shareMap(s.shares)).toEqual({ a: 300, b: 300, c: 300 });
      expect(s.excludedGuestOfHonorIds).toEqual(["g1", "g2"]);
    });

    it("guest of honor not in the selection has no effect", () => {
      const s = splitEven({ totalMinor: 900, currency: "USD", participantIds: ["a", "b"], guestOfHonorIds: ["x"] });
      expect(shareMap(s.shares)).toEqual({ a: 450, b: 450 });
      expect(s.excludedGuestOfHonorIds).toEqual([]);
    });

    it("everyone a guest of honor is an error", () => {
      expect(
        errCode(() => splitEven({ totalMinor: 900, currency: "USD", participantIds: ["a", "b"], guestOfHonorIds: ["a", "b"] })),
      ).toBe("ALL_GUESTS_OF_HONOR");
    });
  });

  it("errors", () => {
    expect(errCode(() => splitEven({ totalMinor: 1000, currency: "USD", participantIds: [] }))).toBe("NO_PARTICIPANTS");
    expect(errCode(() => splitEven({ totalMinor: 1000, currency: "USD", participantIds: ["a", "a"] }))).toBe("DUPLICATE_MEMBER");
    expect(errCode(() => splitEven({ totalMinor: 1000, currency: "USD", participantIds: [""] }))).toBe("UNKNOWN_MEMBER");
    expect(errCode(() => splitEven({ totalMinor: 10.5, currency: "USD", participantIds: ["a"] }))).toBe("INVALID_AMOUNT");
    expect(errCode(() => splitEven({ totalMinor: 1000, currency: "XX", participantIds: ["a"] }))).toBe("INVALID_CURRENCY");
  });
});

describe("splitJustMe (FR-T10)", () => {
  it("whole amount on one member", () => {
    expect(splitJustMe({ totalMinor: 1234, currency: "EUR", memberId: "me" })).toEqual({
      currency: "EUR",
      totalMinor: 1234,
      shares: [{ memberId: "me", shareMinor: 1234 }],
    });
  });
  it("validates", () => {
    expect(errCode(() => splitJustMe({ totalMinor: 1, currency: "EUR", memberId: "" }))).toBe("UNKNOWN_MEMBER");
    expect(errCode(() => splitJustMe({ totalMinor: 0.1, currency: "EUR", memberId: "me" }))).toBe("INVALID_AMOUNT");
  });
});

describe("splitByWeights", () => {
  it("allocates proportionally and sorts", () => {
    const s = splitByWeights({
      totalMinor: 1000,
      currency: "USD",
      weights: [
        { memberId: "b", weight: 1 },
        { memberId: "a", weight: 3 },
      ],
    });
    expect(s.shares).toEqual([
      { memberId: "a", shareMinor: 750 },
      { memberId: "b", shareMinor: 250 },
    ]);
  });
  it("errors", () => {
    expect(errCode(() => splitByWeights({ totalMinor: 1, currency: "USD", weights: [] }))).toBe("NO_PARTICIPANTS");
    expect(
      errCode(() =>
        splitByWeights({ totalMinor: 1, currency: "USD", weights: [{ memberId: "a", weight: 1 }, { memberId: "a", weight: 2 }] }),
      ),
    ).toBe("DUPLICATE_MEMBER");
  });
});

describe("assertValidSplit / helpers", () => {
  it("detects bad sums, ordering and duplicates", () => {
    expect(errCode(() => assertValidSplit({ currency: "USD", totalMinor: 10, shares: [{ memberId: "a", shareMinor: 9 }] }))).toBe(
      "SHARES_DO_NOT_SUM",
    );
    expect(
      errCode(() =>
        assertValidSplit({
          currency: "USD",
          totalMinor: 10,
          shares: [
            { memberId: "b", shareMinor: 5 },
            { memberId: "a", shareMinor: 5 },
          ],
        }),
      ),
    ).toBe("DUPLICATE_MEMBER");
    expect(errCode(() => assertValidSplit({ currency: "USD", totalMinor: 0, shares: [] }))).toBe("no-throw");
  });
  it("mergeShares sums duplicates", () => {
    expect(
      mergeShares([
        { memberId: "b", shareMinor: 1 },
        { memberId: "a", shareMinor: 2 },
        { memberId: "b", shareMinor: 3 },
      ]),
    ).toEqual([
      { memberId: "a", shareMinor: 2 },
      { memberId: "b", shareMinor: 4 },
    ]);
  });
  it("normalizeMemberIds sorts", () => {
    expect(normalizeMemberIds(["z", "a"])).toEqual(["a", "z"]);
  });
});
