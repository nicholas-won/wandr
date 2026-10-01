import { describe, expect, it } from "vitest";
import { allocate, allocateBig, compareIds, rotationFromSeed } from "../../src/money";
import { errCode, sum } from "./helpers";

describe("allocate (largest remainder)", () => {
  it("$10 three ways: the extra cent goes to the first position", () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
  });

  it("$100 three ways", () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });

  it("two leftover cents go to the first two positions", () => {
    expect(allocate(1100, [1, 1, 1])).toEqual([367, 367, 366]);
  });

  it("splits exactly when divisible", () => {
    expect(allocate(900, [1, 1, 1])).toEqual([300, 300, 300]);
  });

  it("proportional weights", () => {
    expect(allocate(1000, [1, 2, 2])).toEqual([200, 400, 400]);
    expect(allocate(100, [3, 3, 1])).toEqual([43, 43, 14]); // 42.86, 42.86, 14.29 -> remainders favour the 0.86s
  });

  it("largest remainder beats position", () => {
    // exact: 0.3, 0.7 -> second gets the cent
    expect(allocate(1, [3, 7])).toEqual([0, 1]);
  });

  it("zero weights get zero, even when the leftover is large", () => {
    expect(allocate(5, [0, 1, 0, 1, 0])).toEqual([0, 3, 0, 2, 0]);
  });

  it("zero total gives all zeros (also with all-zero weights)", () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(0, [0, 0])).toEqual([0, 0]);
  });

  it("single weight takes everything", () => {
    expect(allocate(12345, [7])).toEqual([12345]);
  });

  it("negative totals are symmetric (refunds)", () => {
    expect(allocate(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
    expect(allocate(-100, [3, 3, 1])).toEqual([-43, -43, -14]);
    for (const p of allocate(-0, [1, 1])) expect(Object.is(p, -0)).toBe(false);
  });

  it("tie-break start rotates who gets leftover pennies", () => {
    expect(allocate(1000, [1, 1, 1], { tieBreakStart: 1 })).toEqual([333, 334, 333]);
    expect(allocate(1000, [1, 1, 1], { tieBreakStart: 2 })).toEqual([333, 333, 334]);
    expect(allocate(1000, [1, 1, 1], { tieBreakStart: 3 })).toEqual([334, 333, 333]);
    expect(allocate(1000, [1, 1, 1], { tieBreakStart: -1 })).toEqual([333, 333, 334]);
    expect(allocate(1100, [1, 1, 1], { tieBreakStart: 2 })).toEqual([367, 366, 367]);
  });

  it("tie-break never overrides a larger remainder", () => {
    expect(allocate(1, [3, 7], { tieBreakStart: 0 })).toEqual([0, 1]);
    expect(allocate(1, [7, 3], { tieBreakStart: 1 })).toEqual([1, 0]);
  });

  it("handles huge amounts without precision loss", () => {
    const big = Number.MAX_SAFE_INTEGER;
    const parts = allocate(big, [1, 1, 1]);
    expect(sum(parts)).toBe(big);
    expect(parts).toEqual([3002399751580331, 3002399751580330, 3002399751580330]);
    const weighted = allocate(big, [Number.MAX_SAFE_INTEGER, 1]);
    expect(BigInt(weighted[0]!) + BigInt(weighted[1]!)).toBe(BigInt(big));
  });

  it("accepts bigint weights", () => {
    expect(allocate(10, [1n, 1n, 2n])).toEqual([3, 2, 5]);
    expect(allocateBig(-10n, [1n, 1n, 2n])).toEqual([-3n, -2n, -5n]);
  });

  it("errors", () => {
    expect(errCode(() => allocate(100, []))).toBe("NO_PARTICIPANTS");
    expect(errCode(() => allocate(100, [0, 0]))).toBe("ZERO_TOTAL_WEIGHT");
    expect(errCode(() => allocate(100, [1, -1]))).toBe("INVALID_WEIGHT");
    expect(errCode(() => allocate(100, [0.5, 1]))).toBe("INVALID_WEIGHT");
    expect(errCode(() => allocate(1.5, [1]))).toBe("INVALID_AMOUNT");
    expect(errCode(() => allocate(100, [1], { tieBreakStart: 0.5 }))).toBe("INVALID_WEIGHT");
  });
});

describe("compareIds", () => {
  it("is plain code-unit order, locale independent", () => {
    expect(["b", "B", "a", "A", "é", "10", "9"].sort(compareIds)).toEqual(["10", "9", "A", "B", "a", "b", "é"]);
    expect(compareIds("x", "x")).toBe(0);
  });
});

describe("rotationFromSeed", () => {
  it("is deterministic and within range", () => {
    for (const seed of ["", "a", "expense-1", "550e8400-e29b-41d4-a716-446655440000"]) {
      const r = rotationFromSeed(seed, 7);
      expect(r).toBe(rotationFromSeed(seed, 7));
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(7);
    }
    expect(rotationFromSeed("x", 0)).toBe(0);
  });
  it("spreads across members", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(rotationFromSeed(`expense-${i}`, 4));
    expect(seen.size).toBe(4);
  });
});
