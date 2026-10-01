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
 * value by less than 1 minor unit.
 */
export interface AllocateOptions {
  /**
   * Index at which tie-breaking starts (wraps around). Default 0, i.e. ties go to
   * the earliest positions first. See {@link rotationFromSeed} for a way to rotate
   * which member absorbs leftover pennies per expense.
   */
  tieBreakStart?: number;
}

export type Weight = number | bigint;

export function allocate(total: number, weights: readonly Weight[], options: AllocateOptions = {}): number[] {
  assertMinor(total, "total");
  return allocateBig(BigInt(total), weights.map(toBigWeight), options).map((b) => toSafeNumber(b));
}

/** BigInt version of {@link allocate}; used internally where weights are exact rationals scaled up. */
export function allocateBig(
  total: bigint,
  weights: readonly bigint[],
  options: AllocateOptions = {},
): bigint[] {
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
    if (total === 0n) return weights.map(() => 0n);
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

  if (leftover > 0n) {
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
  return neg ? parts.map((p) => (p === 0n ? 0n : -p)) : parts;
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
