/** Today's estimated SMS spend (texts + Verify codes), for the daily cap (FR-15, NFR-6). */
import { and, gte, like, sql } from "drizzle-orm";
import { otpRequests, outboundMessages, type Tx } from "@wandr/db";
import { env } from "@/lib/env";
import { centsToMicros, VERIFY_COST_MICROS } from "./cost";

export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function smsSpendTodayMicros(tx: Tx, now: Date = new Date()): Promise<number> {
  const since = startOfUtcDay(now);
  const [texts] = await tx
    .select({ micros: sql<string>`coalesce(sum(${outboundMessages.costMicros}), 0)` })
    .from(outboundMessages)
    .where(and(gte(outboundMessages.createdAt, since), sql`${outboundMessages.channel} = 'sms'`));
  const [codes] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(otpRequests)
    .where(and(gte(otpRequests.createdAt, since), like(otpRequests.destination, "+%")));
  return Number(texts?.micros ?? 0) + (codes?.n ?? 0) * VERIFY_COST_MICROS;
}

export function dailySpendCapMicros(): number {
  return centsToMicros(env().SMS_DAILY_SPEND_CAP_CENTS);
}
