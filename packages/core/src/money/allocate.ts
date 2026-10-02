import { assertMinor, toSafeNumber } from "./currency";
import { MoneyError } from "./errors";

/**
 * Largest-remainder allocation (NFR-4, E-21).
 *
 * Splits an integer `total` into integer parts proportional to `weights` such that
 * the parts sum to `total` exactly.
 *
 * Algorithm (all BigInt, no floats):
 *   1. W = sum(weights). Each part gets floor(|total| * w_i / W).
 *   2. The leftover L = |total| - sum(floors) is always < number of non-zero weights.
 *   3. The L parts with the largest remainders (|total| * w_i mod W) get +1 each.
 *   4. Ties in remainder are broken by position: index order starting at
 *      `tieBreakStart` and wrapping around. Callers pass weights in a stable order
 *      (we always use member ids sorted with {@link compareIds}), so the result is
 *      fully deterministic.
 *
 * Negative totals (refunds, FR-72) are allocated symmetrically:
 *   allocate(-T, w) === allocate(T, w).map(x => -x).
 *
 * Guarantees: sum(result) === total; a part with weight 0 is always 0; for
 * total >= 0 every part is >= 0; each part differs from its exact proportional
 * value by less than 1 minor unit (with `remainderTo`, the chosen part may take
 * up to n-1 extra minor units: every leftover penny goes to one person, Q18).
 */
export interface AllocateOptions {
  /**
   * Index at which tie-breaking starts (wraps around). Default 0, i.e. ties go to
   * the earliest positions first. See {@link rotationFromSeed} for a way to rotate
   * which member absorbs leftover pennies per expense.
   */
  tieBreakStart?: number;
  /**
   * Q18 (founder decision): send EVERY leftover minor unit to this one position instead of
   * spreading them by largest remainder. Ignored when that position's weight is 0 (a member
   * with no part never receives pennies); the default largest-remainder rule applies then.
   */
  remainderTo?: number;
}

/** Allocation plus how many minor units were left over after the floor pass (0 = divided exactly). */
export interface AllocationDetail<T> {
  parts: T[];
  /** Absolute leftover minor units (always < number of non-zero weights). */
  leftoverMinor: number;
  /** Index that absorbed the whole leftover when `remainderTo` applied, else null. */
  leftoverIndex: number | null;
}

export type Weight = number | bigint;

export function allocate(total: number, weights: readonly Weight[], options: AllocateOptions = {}): number[] {
  return allocateDetailed(total, weights, options).parts;
}

/** {@link allocate} plus the leftover that rounding produced (Q18 "rounding was applied" flag). */
export function allocateDetailed(
  total: number,
  weights: readonly Weight[],
  options: AllocateOptions = {},
): AllocationDetail<number> {
  assertMinor(total, "total");
  const d = allocateBigDetailed(BigInt(total), weights.map(toBigWeight), options);
  return { ...d, parts: d.parts.map((b) => toSafeNumber(b)) };
}

/** BigInt version of {@link allocate}; used internally where weights are exact rationals scaled up. */
export function allocateBig(total: bigint, weights: readonly bigint[], options: AllocateOptions = {}): bigint[] {
  return allocateBigDetailed(total, weights, options).parts;
}

export function allocateBigDetailed(
  total: bigint,
  weights: readonly bigint[],
  options: AllocateOptions = {},
): AllocationDetail<bigint> {
  const n = weights.length;
  if (n === 0) {
    throw new MoneyError("NO_PARTICIPANTS", "Cannot allocate across zero weights");
  }
  let sumW = 0n;
  for (const w of weights) {
    if (w < 0n) throw new MoneyError("INVALID_WEIGHT", "Weights must be non-negative", { weight: w.toString() });
    sumW += w;
  }
  if (sumW === 0n) {
    if (total === 0n) return { parts: weights.map(() => 0n), leftoverMinor: 0, leftoverIndex: null };
    throw new MoneyError("ZERO_TOTAL_WEIGHT", "Weights sum to zero; nothing to allocate against");
  }

  const start = normalizeStart(options.tieBreakStart ?? 0, n);
  const neg = total < 0n;
  const abs = neg ? -total : total;
  const parts: bigint[] = new Array<bigint>(n);
  const rems: bigint[] = new Array<bigint>(n);
  let assigned = 0n;
  for (let i = 0; i < n; i++) {
    const p = abs * weights[i]!;
    parts[i] = p / sumW;
    rems[i] = p % sumW;
    assigned += parts[i]!;
  }
  let leftover = abs - assigned;
  const leftoverMinor = toSafeNumber(leftover);
  let leftoverIndex: number | null = null;
  const to = options.remainderTo;
  if (to !== undefined && (!Number.isInteger(to) || to < 0 || to >= n)) {
    throw new MoneyError("INVALID_WEIGHT", "remainderTo must be a valid position", { remainderTo: to });
  }

  if (leftover > 0n && to !== undefined && weights[to]! > 0n) {
    parts[to] = parts[to]! + leftover;
    leftoverIndex = to;
    leftover = 0n;
  } else if (leftover > 0n) {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
      const ra = rems[a]!;
      const rb = rems[b]!;
      if (ra !== rb) return ra > rb ? -1 : 1;
      return ((a - start + n) % n) - ((b - start + n) % n);
    });
    for (const i of order) {
      if (leftover === 0n) break;
      parts[i] = parts[i]! + 1n;
      leftover -= 1n;
    }
  }
  return {
    parts: neg ? parts.map((p) => (p === 0n ? 0n : -p)) : parts,
    leftoverMinor,
    leftoverIndex,
  };
}

/**
 * Q18: which position gets every leftover penny. Walks `preferred` (e.g. [uploader, payer])
 * and returns the index of the first one present in `ids` with a positive weight; undefined
 * when none qualifies (then the default largest-remainder rule decides).
 */
export function remainderIndex(
  ids: readonly string[],
  weights: readonly Weight[],
  preferred: readonly string[] | undefined,
): number | undefined {
  if (!preferred) return undefined;
  for (const p of preferred) {
    const i = ids.indexOf(p);
    if (i < 0) continue;
    const w = weights[i]!;
    if (typeof w === "bigint" ? w > 0n : w > 0) return i;
  }
  return undefined;
}

function toBigWeight(w: Weight): bigint {
  if (typeof w === "bigint") return w;
  if (!Number.isSafeInteger(w)) {
    throw new MoneyError("INVALID_WEIGHT", "Weights must be safe integers (no fractional weights)", { weight: w });
  }
  return BigInt(w);
}

function normalizeStart(start: number, n: number): number {
  if (!Number.isInteger(start)) {
    throw new MoneyError("INVALID_WEIGHT", "tieBreakStart must be an integer", { tieBreakStart: start });
  }
  return ((start % n) + n) % n;
}

/**
 * Stable member-id ordering used everywhere in the money domain: plain UTF-16
 * code-unit comparison (locale-independent, so every server sorts the same way).
 */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Deterministic rotation offset from a seed (e.g. the expense id), using 32-bit
 * FNV-1a. Pass it as `tieBreakStart` to rotate which member gets leftover pennies
 * from one expense to the next (E-21's suggestion). Whether to rotate is a product
 * choice; the default everywhere is no rotation.
 */
export function rotationFromSeed(seed: string, n: number): number {
  if (n <= 0) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % n;
}
