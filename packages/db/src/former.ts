/**
 * Typed wrappers for the removed-member money-only view (migrations/0012_account_recheck_rls.sql;
 * FR-9, M-1, M-2). Call inside `withSession` with the caller's verified claims: the SQL functions
 * return only the caller's own ledger and refuse everyone else.
 */
import { sql } from "drizzle-orm";
import { rowsOf } from "./reveals";
import type { Tx } from "./session";

export interface FormerExpense {
  id: string;
  merchant: string;
  spentOn: string | null;
  createdAt: string;
  currency: string;
  totalMinor: number;
  isRefund: boolean;
  payerName: string | null;
  paidByMe: boolean;
  myShareMinor: number;
  myPaidMinor: number;
}

export interface FormerAdjustment {
  id: string;
  currency: string;
  deltaMinor: number;
  reason: string;
  createdAt: string;
  /** Null when the expense it's anchored to isn't one of theirs (e.g. their removal settlement). */
  merchant: string | null;
}

export interface FormerPayment {
  id: string;
  currency: string;
  amountMinor: number;
  fromMe: boolean;
  otherMemberId: string;
  otherName: string | null;
  note: string | null;
  createdAt: string;
}

export interface FormerLedger {
  memberId: string;
  tripName: string;
  expenses: FormerExpense[];
  adjustments: FormerAdjustment[];
  payments: FormerPayment[];
  /** People they may settle with (names on their own expenses and payments). */
  people: { id: string; name: string }[];
}

const n = (v: unknown) => Number(v);

/** The caller's own ledger in a trip they were removed from, or null. */
export async function formerMemberLedger(tx: Tx, tripId: string): Promise<FormerLedger | null> {
  const [row] = await rowsOf<{ ledger: unknown }>(tx, sql`select app.former_member_ledger(${tripId}::uuid) as ledger`);
  const raw = (typeof row?.ledger === "string" ? JSON.parse(row.ledger) : row?.ledger) as FormerLedger | null | undefined;
  if (!raw) return null;
  return {
    ...raw,
    expenses: raw.expenses.map((e) => ({ ...e, totalMinor: n(e.totalMinor), myShareMinor: n(e.myShareMinor), myPaidMinor: n(e.myPaidMinor) })),
    adjustments: raw.adjustments.map((a) => ({ ...a, deltaMinor: n(a.deltaMinor) })),
    payments: raw.payments.map((p) => ({ ...p, amountMinor: n(p.amountMinor) })),
  };
}

export interface FormerTrip {
  tripId: string;
  tripName: string;
  memberId: string;
  removedAt: Date | null;
}

/** Live trips the caller was removed from. */
export async function myFormerTrips(tx: Tx): Promise<FormerTrip[]> {
  const rows = await rowsOf<Record<string, unknown>>(tx, sql`select * from app.my_former_trips()`);
  return rows.map((r) => ({
    tripId: r.trip_id as string,
    tripName: r.trip_name as string,
    memberId: r.member_id as string,
    removedAt: r.removed_at ? new Date(r.removed_at as string) : null,
  }));
}

/** A former member records a settle-up with someone on their own ledger. Returns the payment id. */
export async function recordFormerPayment(
  tx: Tx,
  args: { tripId: string; otherMemberId: string; iPaid: boolean; currency: string; amountMinor: number; note?: string | null },
): Promise<string> {
  const [row] = await rowsOf<{ id: string }>(
    tx,
    sql`select app.former_member_record_payment(${args.tripId}::uuid, ${args.otherMemberId}::uuid, ${args.iPaid},
      ${args.currency}, ${args.amountMinor}::bigint, ${args.note ?? null}) as id`,
  );
  return row!.id;
}
