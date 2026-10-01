/**
 * Outbound messages (FR-80, FR-81, FR-83, FR-84, FR-85). Server only; uses the service role.
 *
 * `sendMessage` applies opt-outs, the per-person/per-trip throttle and the daily spend cap, then
 * texts (Twilio or console) or falls back to email (Resend or console). Every message sent is
 * logged in `outbound_messages`, with personal-link tokens redacted from the stored body.
 */
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { APP_NAME } from "@wandr/core/config";
import { asService, getDb, outboundMessages, smsOpenQuestions, type Tx } from "@wandr/db";
import { normalizePhone } from "@/lib/auth/phone";
import { estimateSmsCostMicros } from "./cost";
import { getEmailProvider } from "./email-provider";
import { isPhoneOptedOut } from "./opt-out";
import { getSmsProvider } from "./sms-provider";
import { dailySpendCapMicros, smsSpendTodayMicros } from "./spend";
import { decideText, type ThrottleReason } from "./throttle";

export type MessageKind =
  | "invite"
  | "vote_question"
  | "join_request"
  | "expense"
  | "poll_closing"
  | "nudge"
  | "digest"
  | "reply";

export type SendMessageInput = {
  kind: MessageKind;
  tripId: string | null;
  memberId: string | null;
  /** E.164. */
  phone: string | null;
  email: string | null;
  /** Rendered with `texts.*` (includes personal link + WRONG footer). */
  body: string;
  emailSubject?: string;
  /** Bypasses the 1/day and per-trip caps (OTP-adjacent, join approvals, polls closing soon; N-5). */
  timeSensitive?: boolean;
};

export type SendResult = {
  channel: "sms" | "email" | "none";
  reason?: ThrottleReason | "no_destination" | "send_failed";
  providerId?: string | null;
};

/** Never persist live personal-link tokens (only hashes are stored, FR-4). */
export function redactLinks(body: string): string {
  return body.replace(/\/l\/[A-Za-z0-9_-]{43}/g, "/l/[redacted]");
}

/** Email version of a text: drop the brand prefix and the SMS-only WRONG footer. */
export function emailBodyFromText(body: string): string {
  return body
    .replace(new RegExp(`^${APP_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: `), "")
    .replace(/\n(?:Not .{1,40}\? Reply WRONG)$/, "")
    .trim();
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function textCounts(tx: Tx, phone: string, tripId: string | null, memberId: string | null) {
  const since = new Date(Date.now() - DAY_MS);
  const nonUrgent = and(
    eq(outboundMessages.channel, "sms"),
    eq(outboundMessages.timeSensitive, false),
    ne(outboundMessages.kind, "reply"),
  );
  const [person] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(outboundMessages)
    .where(and(nonUrgent, eq(outboundMessages.toAddress, phone), gte(outboundMessages.createdAt, since)));
  let trip = 0;
  if (tripId && memberId) {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(outboundMessages)
      .where(and(nonUrgent, eq(outboundMessages.tripId, tripId), eq(outboundMessages.memberId, memberId)));
    trip = row?.n ?? 0;
  }
  return { person: person?.n ?? 0, trip };
}

export async function sendMessage(input: SendMessageInput): Promise<SendResult> {
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const db = await getDb();
  const estimatedCostMicros = estimateSmsCostMicros(input.body);

  const decision = phone?.ok
    ? await asService(db, async (tx) => {
        const counts = await textCounts(tx, phone.e164, input.tripId, input.memberId);
        return decideText({
          timeSensitive: !!input.timeSensitive,
          optedOut: await isPhoneOptedOut(tx, phone.e164),
          smsSupported: phone.smsSupported,
          hasEmail: !!input.email,
          sentToPersonLast24h: counts.person,
          sentToMemberThisTrip: counts.trip,
          spendTodayMicros: await smsSpendTodayMicros(tx),
          estimatedCostMicros,
          dailyCapMicros: dailySpendCapMicros(),
        });
      })
    : input.email
      ? ({ channel: "email", reason: "sms_unsupported" } as const)
      : ({ channel: "none", reason: "sms_unsupported" } as const);

  if (decision.channel === "none") return { channel: "none", reason: decision.reason };

  const log = (channel: "sms" | "email", toAddress: string, providerId: string | null, costMicros: number | null) =>
    asService(db, (tx) =>
      tx.insert(outboundMessages).values({
        tripId: input.tripId,
        memberId: input.memberId,
        channel,
        kind: input.kind,
        toAddress,
        body: redactLinks(input.body),
        timeSensitive: !!input.timeSensitive,
        providerId,
        costMicros,
      }),
    );

  if (decision.channel === "sms" && phone?.ok) {
    try {
      const { id } = await getSmsProvider().send({ to: phone.e164, body: input.body });
      await log("sms", phone.e164, id, estimatedCostMicros);
      return { channel: "sms", providerId: id };
    } catch (err) {
      console.error("[sms] send failed", err);
      if (!input.email) return { channel: "none", reason: "send_failed" };
    }
  }

  if (!input.email) return { channel: "none", reason: "no_destination" };
  try {
    const { id } = await getEmailProvider().send({
      to: input.email,
      subject: input.emailSubject ?? `${APP_NAME}: an update about your trip`,
      text: emailBodyFromText(input.body),
    });
    await log("email", input.email, id, null);
    return { channel: "email", reason: "reason" in decision ? decision.reason : undefined, providerId: id };
  } catch (err) {
    console.error("[email] send failed", err);
    return { channel: "none", reason: "send_failed" };
  }
}

/** Log a TwiML reply (it is billed like any text). */
export async function logReply(tx: Tx, phone: string, body: string): Promise<void> {
  await tx.insert(outboundMessages).values({
    channel: "sms",
    kind: "reply",
    toAddress: phone,
    body: redactLinks(body),
    timeSensitive: true,
    costMicros: estimateSmsCostMicros(body),
  });
}

export type OpenQuestionPayload =
  | { kind: "vote"; tripId: string; ideaId: string; ideaTitle: string }
  | { kind: "approve_join"; tripId: string; pendingMemberId: string; name: string; tripName: string };

/**
 * Open the person's single SMS question (FR-83, DN-23). Returns false when another unexpired
 * question is still open: then send the text without "Reply 1/2/3" (or wait) so replies stay
 * unambiguous.
 */
export async function tryOpenSmsQuestion(
  tx: Tx,
  q: { phone: string; memberId: string; payload: OpenQuestionPayload; ttlHours?: number },
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (q.ttlHours ?? 48) * 60 * 60 * 1000);
  const rows = await tx
    .insert(smsOpenQuestions)
    .values({ phone: q.phone, memberId: q.memberId, kind: q.payload.kind, payload: q.payload, expiresAt })
    .onConflictDoUpdate({
      target: smsOpenQuestions.phone,
      set: { memberId: q.memberId, kind: q.payload.kind, payload: q.payload, expiresAt, createdAt: now },
      setWhere: lt(smsOpenQuestions.expiresAt, now),
    })
    .returning({ phone: smsOpenQuestions.phone });
  return rows.length > 0;
}
