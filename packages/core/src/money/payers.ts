import { allocateDetailed, compareIds } from "./allocate";
import { assertMinor, toSafeNumber } from "./currency";
import { MoneyError } from "./errors";
import { allocOptions, assertValidSplit, mergeShares, normalizeMemberIds } from "./split";
import type { LedgerExpense, MemberId, PayerPart, Split } from "./types";

/**
 * Who paid, and "covered by" (Q23, founder decision 2026-10-02; E-14, E-15, E-17).
 *
 * (a) One bill, several payers: each paid part of it; the parts must sum to the total exactly.
 * (b) "Covered by": one person pays another person's share. In balances (and spend) it counts
 *     as the coverer's own share.
 * (c) Personal-only expenses are never split and never touch group balances; see
 *     `LedgerExpense.personal` (balances.ts skips them).
 */

/**
 * Validates and sorts payer parts (Q23a). Rules: at least one payer; no duplicates; every part
 * is non-zero and has the same sign as the total (refunds are all negative); the parts sum to
 * `totalMinor` exactly. Throws PAYERS_DO_NOT_SUM, INVALID_AMOUNT, DUPLICATE_MEMBER.
 */
export function normalizePayers(totalMinor: number, payers: readonly PayerPart[]): PayerPart[] {
  assertMinor(totalMinor, "totalMinor");
  if (payers.length === 0) throw new MoneyError("NO_PARTICIPANTS", "Someone has to have paid");
  normalizeMemberIds(payers.map((p) => p.memberId), "payers");
  let sum = 0n;
  for (const p of payers) {
    assertMinor(p.paidMinor, "paidMinor");
    if (p.paidMinor === 0 || (totalMinor >= 0 ? p.paidMinor < 0 : p.paidMinor > 0)) {
      throw new MoneyError("INVALID_AMOUNT", "Each payer's part must be more than zero", {
        memberId: p.memberId,
        paidMinor: p.paidMinor,
      });
    }
    sum += BigInt(p.paidMinor);
  }
  if (sum !== BigInt(totalMinor)) {
    throw new MoneyError("PAYERS_DO_NOT_SUM", "What each person paid has to add up to the total", {
      totalMinor,
      paidMinor: sum.toString(),
    });
  }
  return [...payers].map((p) => ({ memberId: p.memberId, paidMinor: p.paidMinor })).sort((a, b) => compareIds(a.memberId, b.memberId));
}

/** The payer parts of a ledger expense: `payers` when set, else the single payer for the whole total. */
export function payerPartsOf(e: Pick<LedgerExpense, "payerId" | "payers" | "totalMinor">): PayerPart[] {
  if (e.payers && e.payers.length > 0) return normalizePayers(e.totalMinor, e.payers);
  return [{ memberId: e.payerId, paidMinor: e.totalMinor }];
}

/** The main payer to show and store in `paid_by` for several payers: largest part, ties by member id. */
export function mainPayer(payers: readonly PayerPart[]): MemberId {
  if (payers.length === 0) throw new MoneyError("NO_PARTICIPANTS", "Someone has to have paid");
  return [...payers].sort((a, b) => Math.abs(b.paidMinor) - Math.abs(a.paidMinor) || compareIds(a.memberId, b.memberId))[0]!
    .memberId;
}

/**
 * Re-scales payer parts to a new total in proportion to what each paid (refunds back to several
 * payers, FR-72; corrections that change the total, FR-69). Largest remainder; leftover pennies
 * go to `leftoverTo` first (Q18). Payers whose part rounds to 0 are dropped (a total of 0 keeps
 * nobody). The result always sums to `newTotalMinor`.
 */
export function scalePayers(
  payers: readonly PayerPart[],
  newTotalMinor: number,
  options: { leftoverTo?: readonly MemberId[]; tieBreakStart?: number } = {},
): PayerPart[] {
  assertMinor(newTotalMinor, "newTotalMinor");
  const sorted = [...payers].sort((a, b) => compareIds(a.memberId, b.memberId));
  const ids = sorted.map((p) => p.memberId);
  const ws = sorted.map((p) => Math.abs(p.paidMinor));
  if (ws.every((w) => w === 0)) throw new MoneyError("ZERO_TOTAL_WEIGHT", "Nobody paid anything to scale from");
  const d = allocateDetailed(newTotalMinor, ws, allocOptions(ids, ws, options));
  return sorted.map((p, i) => ({ memberId: p.memberId, paidMinor: d.parts[i]! })).filter((p) => p.paidMinor !== 0);
}

/** A "covered by" entry (Q23b): `coveredBy` pays `memberId`'s share. */
export interface Cover {
  memberId: MemberId;
  coveredBy: MemberId;
}

export interface CoveredSplit extends Split {
  /** What moved: each covered member's share and who took it (after resolving chains). */
  moved: { memberId: MemberId; coveredBy: MemberId; shareMinor: number }[];
}

/**
 * Q23b: moves each covered member's share to whoever covers them. Chains resolve (A covered by
 * B, B covered by C → both shares land on C); a cycle or covering yourself is INVALID_COVER.
 * Covers for members with no share (or a 0 share) are ignored. The total never changes, so the
 * result still sums exactly; shares stay sorted with no duplicates.
 */
export function applyCoveredBy(split: Split, covers: readonly Cover[]): CoveredSplit {
  assertValidSplit(split);
  const by = new Map<MemberId, MemberId>();
  for (const c of covers) {
    if (!c.memberId || !c.coveredBy) throw new MoneyError("INVALID_COVER", "A cover needs two people");
    if (c.memberId === c.coveredBy) throw new MoneyError("INVALID_COVER", "Someone can't cover their own share");
    if (by.has(c.memberId)) {
      throw new MoneyError("INVALID_COVER", "One share can only be covered by one person", { memberId: c.memberId });
    }
    by.set(c.memberId, c.coveredBy);
  }
  const resolve = (m: MemberId): MemberId => {
    const seen = new Set<MemberId>([m]);
    let cur = m;
    while (by.has(cur)) {
      cur = by.get(cur)!;
      if (seen.has(cur)) throw new MoneyError("INVALID_COVER", "Covers go round in a circle", { memberId: m });
      seen.add(cur);
    }
    return cur;
  };
  const moved: CoveredSplit["moved"] = [];
  const shares = split.shares.map((s) => {
    if (!by.has(s.memberId) || s.shareMinor === 0) return s;
    const to = resolve(s.memberId);
    moved.push({ memberId: s.memberId, coveredBy: to, shareMinor: s.shareMinor });
    return { memberId: to, shareMinor: s.shareMinor };
  });
  const merged = mergeShares(shares).filter((s) => !(by.has(s.memberId) && s.shareMinor === 0));
  const out = { currency: split.currency, totalMinor: split.totalMinor, shares: merged };
  assertValidSplit(out);
  return { ...out, moved };
}

/** Sum of payer parts (exact). */
export function sumPaid(payers: readonly PayerPart[]): number {
  let s = 0n;
  for (const p of payers) s += BigInt(p.paidMinor);
  return toSafeNumber(s);
}
