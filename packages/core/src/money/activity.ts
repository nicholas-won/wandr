import { compareIds } from "./allocate";
import { assertMinor, toSafeNumber, type CurrencyCode } from "./currency";
import { payerPartsOf } from "./payers";
import type { MemberId, PayerPart, Share } from "./types";

/**
 * "What changed" (MT1, founder decision 2026-10-02): the in-app list of money changes that
 * affect one person, with amounts, so money updates don't depend on texts.
 *
 * Pure: the app loads rows the person can already see (RLS) and passes them in. Each entry
 * carries `effectMinor`, the change to the person's NET balance in that currency
 * (positive = they're owed more / owe less), plus their share where that's meaningful.
 */
export type MoneyEvent =
  | {
      kind: "expense";
      expenseId: string;
      atMs: number;
      merchant: string;
      currency: CurrencyCode;
      totalMinor: number;
      payerId: MemberId;
      payers?: readonly PayerPart[];
      shares: readonly Share[];
      isRefund: boolean;
      personal?: boolean;
      actorId: MemberId;
    }
  | {
      kind: "correction";
      expenseId: string;
      atMs: number;
      merchant: string;
      currency: CurrencyCode;
      /** All adjustment entries of this one correction. */
      entries: readonly { memberId: MemberId; deltaMinor: number }[];
      reason: string;
      actorId: MemberId;
    }
  | {
      kind: "edit";
      expenseId: string;
      atMs: number;
      merchant: string;
      currency: CurrencyCode;
      /** The expense's current shares (an edit's before/after shares aren't stored). */
      shares: readonly Share[];
      actorId: MemberId;
    }
  | {
      kind: "payment";
      paymentId: string;
      atMs: number;
      fromMemberId: MemberId;
      toMemberId: MemberId;
      currency: CurrencyCode;
      amountMinor: number;
      actorId: MemberId;
    };

export interface ActivityEntry {
  key: string;
  kind: MoneyEvent["kind"];
  atMs: number;
  currency: CurrencyCode;
  expenseId: string | null;
  merchant: string | null;
  actorId: MemberId;
  /** Change to the person's net balance. Null for edits (only the current share is known). */
  effectMinor: number | null;
  /** The person's share of the expense (expense / refund / edit), else null. */
  myShareMinor: number | null;
  /** For payments: the other person. */
  otherMemberId: MemberId | null;
  reason: string | null;
}

/**
 * Entries affecting `memberId`, newest first (ties by key), at most `limit`. An expense
 * affects you when you paid part of it or have a share; a correction when one of its entries
 * is yours; a payment when you're either side; an edit when you have a share now.
 */
export function moneyActivityFor(memberId: MemberId, events: readonly MoneyEvent[], limit = 20): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const e of events) {
    if (e.kind === "expense") {
      const share = e.shares.find((s) => s.memberId === memberId)?.shareMinor ?? 0;
      assertMinor(share, "shareMinor");
      const paid: bigint = e.personal
        ? 0n
        : payerPartsOf(e)
            .filter((p) => p.memberId === memberId)
            .reduce((a, p) => a + BigInt(p.paidMinor), 0n);
      const involved = paid !== 0n || e.shares.some((s) => s.memberId === memberId);
      if (!involved) continue;
      out.push({
        key: `x:${e.expenseId}`,
        kind: "expense",
        atMs: e.atMs,
        currency: e.currency,
        expenseId: e.expenseId,
        merchant: e.merchant,
        actorId: e.actorId,
        effectMinor: e.personal ? 0 : toSafeNumber(paid - BigInt(share)),
        myShareMinor: share,
        otherMemberId: null,
        reason: null,
      });
    } else if (e.kind === "correction") {
      const mine = e.entries.filter((x) => x.memberId === memberId);
      if (mine.length === 0) continue;
      let d = 0n;
      for (const x of mine) {
        assertMinor(x.deltaMinor, "deltaMinor");
        d += BigInt(x.deltaMinor);
      }
      out.push({
        key: `c:${e.expenseId}:${e.atMs}`,
        kind: "correction",
        atMs: e.atMs,
        currency: e.currency,
        expenseId: e.expenseId,
        merchant: e.merchant,
        actorId: e.actorId,
        effectMinor: toSafeNumber(d),
        myShareMinor: null,
        otherMemberId: null,
        reason: e.reason,
      });
    } else if (e.kind === "edit") {
      const s = e.shares.find((x) => x.memberId === memberId);
      if (!s) continue;
      out.push({
        key: `e:${e.expenseId}:${e.atMs}`,
        kind: "edit",
        atMs: e.atMs,
        currency: e.currency,
        expenseId: e.expenseId,
        merchant: e.merchant,
        actorId: e.actorId,
        effectMinor: null,
        myShareMinor: s.shareMinor,
        otherMemberId: null,
        reason: null,
      });
    } else {
      if (e.fromMemberId !== memberId && e.toMemberId !== memberId) continue;
      assertMinor(e.amountMinor, "amountMinor");
      const from = e.fromMemberId === memberId;
      out.push({
        key: `p:${e.paymentId}`,
        kind: "payment",
        atMs: e.atMs,
        currency: e.currency,
        expenseId: null,
        merchant: null,
        actorId: e.actorId,
        effectMinor: from ? e.amountMinor : -e.amountMinor,
        myShareMinor: null,
        otherMemberId: from ? e.toMemberId : e.fromMemberId,
        reason: null,
      });
    }
  }
  out.sort((a, b) => b.atMs - a.atMs || compareIds(a.key, b.key));
  return out.slice(0, Math.max(0, limit));
}
