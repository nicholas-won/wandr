import type { CurrencyCode } from "./currency";

export type MemberId = string;

/** One member's portion of an expense, in the expense's currency. */
export interface Share {
  memberId: MemberId;
  shareMinor: number;
}

/**
 * The result of any split. Invariants (checked by {@link assertValidSplit}):
 * - `shares` is sorted by memberId (see `compareIds`) with no duplicates;
 * - `sum(shares.shareMinor) === totalMinor` exactly.
 */
export interface Split {
  currency: CurrencyCode;
  totalMinor: number;
  shares: Share[];
}

/** Minimal expense shape the ledger needs (FR-70). */
export interface LedgerExpense {
  id?: string;
  currency: CurrencyCode;
  totalMinor: number;
  payerId: MemberId;
  shares: readonly Share[];
}

/** A recorded settle-up between two members in one currency (FR-71). */
export interface Payment {
  id?: string;
  fromMemberId: MemberId;
  toMemberId: MemberId;
  currency: CurrencyCode;
  amountMinor: number;
}

/**
 * A correction entry for a locked expense (FR-69). `deltaMinor` is a signed
 * change to the member's NET balance in `currency` (positive = they are owed
 * more / owe less). One correction is a set of entries that sums to zero.
 */
export interface AdjustmentEntry {
  memberId: MemberId;
  currency: CurrencyCode;
  deltaMinor: number;
}
