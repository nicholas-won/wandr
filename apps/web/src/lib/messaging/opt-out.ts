/**
 * Per-number text opt-out state (FR-85, NFR-7, N-1; WRONG J-4).
 *
 * Mirrored to `users.sms_opted_out` when the number belongs to a user. Numbers that only exist on
 * an invite list (member_contacts) have no user row, so every change is also recorded in
 * `audit_log` keyed by a hash of the number; a number is opted out if either says so
 * (latest audit event wins).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLog, users, type Tx } from "@wandr/db";
import { phoneKey } from "@/lib/auth/crypto";

const OPT_OUT = "sms.opt_out";
const OPT_IN = "sms.opt_in";
export const WRONG_NUMBER = "sms.wrong_number";

export async function isPhoneOptedOut(tx: Tx, phone: string): Promise<boolean> {
  const [user] = await tx.select({ out: users.smsOptedOut }).from(users).where(eq(users.phone, phone)).limit(1);
  if (user?.out) return true;
  const [last] = await tx
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.action, [OPT_OUT, OPT_IN, WRONG_NUMBER]),
        sql`${auditLog.data}->>'p' = ${phoneKey(phone)}`,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  return last ? last.action !== OPT_IN : false;
}

export async function setPhoneOptOut(
  tx: Tx,
  phone: string,
  optedOut: boolean,
  reason: "stop" | "informal" | "start" | "wrong",
): Promise<void> {
  await tx.update(users).set({ smsOptedOut: optedOut }).where(eq(users.phone, phone));
  await tx.insert(auditLog).values({
    action: reason === "wrong" ? WRONG_NUMBER : optedOut ? OPT_OUT : OPT_IN,
    entity: "phone",
    data: { p: phoneKey(phone), reason },
  });
}

/** Whether WRONG was reported for this number after `since` (forces the J-4 recheck on sign-in). */
export async function wrongNumberReportedSince(tx: Tx, phone: string, since: Date | null): Promise<boolean> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, WRONG_NUMBER),
        sql`${auditLog.data}->>'p' = ${phoneKey(phone)}`,
        since ? sql`${auditLog.createdAt} > ${since.toISOString()}` : sql`true`,
      ),
    );
  return (row?.n ?? 0) > 0;
}
