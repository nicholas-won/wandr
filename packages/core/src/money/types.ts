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

/** One payer's part of a bill paid by several people (Q23a). */
export interface PayerPart {
  memberId: MemberId;
  paidMinor: number;
}

/** Minimal expense shape the ledger needs (FR-70). */
export interface LedgerExpense {
  id?: string;
  currency: CurrencyCode;
  totalMinor: number;
  /** The payer (or the main payer when `payers` is set). */
  payerId: MemberId;
  /**
   * Q23a: several people paid parts of one bill. When present it replaces `payerId` in the
   * ledger; the parts must sum to `totalMinor` exactly (see `normalizePayers`).
   */
  payers?: readonly PayerPart[];
  /**
   * Q23c: a personal-only expense (tracked for one person, never split). Excluded from group
   * balances entirely.
   */
  personal?: boolean;
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
