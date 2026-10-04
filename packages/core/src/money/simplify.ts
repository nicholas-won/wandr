import { compareIds } from "./allocate";
import type { Balances } from "./balances";
import { assertCurrency, assertMinor, type CurrencyCode } from "./currency";
import { MoneyError } from "./errors";
import type { MemberId } from "./types";

/** A suggested settle-up transfer (not a recorded payment). */
export interface Transfer {
  fromMemberId: MemberId;
  toMemberId: MemberId;
  currency: CurrencyCode;
  amountMinor: number;
}

/**
 * Debt simplification for ONE currency (FR-70).
 *
 * Greedy: repeatedly match the member who is owed the most with the member who
 * owes the most and transfer the smaller of the two amounts. Ties are broken by
 * ascending member id, so the output is deterministic for a given input.
 *
 * Properties: produces at most (non-zero members - 1) transfers, and every
 * transfer goes from a debtor to a creditor (nobody pays more than they owe or
 * receives more than they're owed). Applying the transfers zeroes every balance.
 * It is NOT guaranteed to be the global minimum number of transfers (that
 * problem is NP-hard), but it is optimal or near-optimal for trip-sized groups.
 *
 * Suggested transfers are recomputed on view; only net balances are
 * authoritative (E-23).
 */
export function simplifyDebts(net: Readonly<Record<MemberId, number>>, currency: CurrencyCode): Transfer[] {
  assertCurrency(currency);
  let sum = 0n;
  const creditors: { id: MemberId; amt: bigint }[] = [];
  const debtors: { id: MemberId; amt: bigint }[] = [];
  for (const id of Object.keys(net).sort(compareIds)) {
    const v = net[id]!;
    assertMinor(v, "balance");
    sum += BigInt(v);
    if (v > 0) creditors.push({ id, amt: BigInt(v) });
    else if (v < 0) debtors.push({ id, amt: BigInt(-v) });
  }
  if (sum !== 0n) {
    throw new MoneyError("UNBALANCED_LEDGER", "Balances must sum to zero to be settled", {
      currency,
      sumMinor: sum.toString(),
    });
  }

  const pickMax = (xs: { id: MemberId; amt: bigint }[]) => {
    let best = -1;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      if (x.amt === 0n) continue;
      if (best === -1 || x.amt > xs[best]!.amt) best = i; // xs is id-sorted, so strict > keeps the lowest id on ties
    }
    return best;
  };

  const out: Transfer[] = [];
  for (;;) {
    const c = pickMax(creditors);
    const d = pickMax(debtors);
    if (c === -1 || d === -1) break;
    const cr = creditors[c]!;
    const db = debtors[d]!;
    const amt = cr.amt < db.amt ? cr.amt : db.amt;
    cr.amt -= amt;
    db.amt -= amt;
    out.push({ fromMemberId: db.id, toMemberId: cr.id, currency, amountMinor: Number(amt) });
  }
  return out;
}

/** {@link simplifyDebts} for every currency in a balance sheet; currencies sorted. */
export function simplifyAll(balances: Balances): Record<CurrencyCode, Transfer[]> {
  const out: Record<CurrencyCode, Transfer[]> = {};
  for (const currency of Object.keys(balances).sort()) {
    out[currency] = simplifyDebts(balances[currency]!, currency);
  }
  return out;
}

export interface SettleUpLine {
  currency: CurrencyCode;
  /** "you_owe": viewer pays `otherMemberId`; "owes_you": `otherMemberId` pays the viewer. */
  direction: "you_owe" | "owes_you";
  otherMemberId: MemberId;
  amountMinor: number;
}

/**
 * The viewer's settle-up lines, per currency (sorted by currency, then member id).
 * In a duo trip this is exactly one "You owe Sam $X" / "Sam owes you $X" line per
 * currency with a non-zero balance (FR-T8). Never converts between currencies.
 */
export function settleUpFor(balances: Balances, viewerId: MemberId): SettleUpLine[] {
  const lines: SettleUpLine[] = [];
  for (const [currency, transfers] of Object.entries(simplifyAll(balances))) {
    const mine: SettleUpLine[] = [];
    for (const t of transfers) {
      if (t.fromMemberId === viewerId) {
        mine.push({ currency, direction: "you_owe", otherMemberId: t.toMemberId, amountMinor: t.amountMinor });
      } else if (t.toMemberId === viewerId) {
        mine.push({ currency, direction: "owes_you", otherMemberId: t.fromMemberId, amountMinor: t.amountMinor });
      }
    }
    mine.sort((a, b) => compareIds(a.otherMemberId, b.otherMemberId));
    lines.push(...mine);
  }
  return lines;
}

/**
 * Duo settle-up (FR-T8): one line per currency between the two members. Uses the
 * viewer's net balance directly, so nothing is simplified. Throws
 * UNBALANCED_LEDGER if anyone else holds a balance in that currency (e.g. a
 * former member); use {@link settleUpFor} in that case.
 */
export function duoSettleUp(balances: Balances, viewerId: MemberId, otherId: MemberId): SettleUpLine[] {
  const lines: SettleUpLine[] = [];
  for (const currency of Object.keys(balances).sort()) {
    const row = balances[currency]!;
    const mine = row[viewerId] ?? 0;
    const theirs = row[otherId] ?? 0;
    for (const [id, v] of Object.entries(row)) {
      if (id !== viewerId && id !== otherId && v !== 0) {
        throw new MoneyError("UNBALANCED_LEDGER", "Someone other than the two members has a balance", {
          currency,
          memberId: id,
        });
      }
    }
    if (mine + theirs !== 0) {
      throw new MoneyError("UNBALANCED_LEDGER", "Duo balances don't mirror each other", { currency });
    }
    if (mine < 0) lines.push({ currency, direction: "you_owe", otherMemberId: otherId, amountMinor: -mine });
    else if (mine > 0) lines.push({ currency, direction: "owes_you", otherMemberId: otherId, amountMinor: mine });
  }
  return lines;
}
