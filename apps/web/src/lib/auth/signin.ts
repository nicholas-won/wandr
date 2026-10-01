/**
 * Sign-in with a code (FR-5, FR-14, FR-15, FR-16; J-4, J-16, J-17). Server only; call from
 * Server Actions or Route Handlers (it sets cookies).
 *
 * - SMS codes for US/CA numbers via Twilio Verify (separate sender, FR-85); email elsewhere.
 * - Limits per destination, IP and trip, CAPTCHA after repeats, daily SMS spend cap.
 * - The response never reveals whether a number/email is known (J-17).
 * - Max 5 wrong codes per challenge; codes expire after 10 minutes.
 * - A known number inactive 60+ days gets `needsRecheck` on its session (FR-16, J-4).
 */
import { cookies } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { asService, auditLog, getDb, otpRequests, users, type Tx } from "@wandr/db";
import { getCaptcha } from "./captcha";
import { COOKIE, cookieOptions } from "./cookies";
import { keyedHash } from "./crypto";
import { getOtpProvider, type OtpChannel } from "./otp/provider";
import { maskPhone, normalizeEmail, normalizePhone } from "./phone";
import {
  attemptsExhausted,
  decideOtpRequest,
  needsRecycledNumberCheck,
  OTP_LIMITS,
  type OtpCounts,
} from "./rate-limit";
import { requireFull, setFullSession } from "./session";
import { OTP_TTL_SECONDS, signPayload, verifyPayload } from "./tokens";
import { VERIFY_COST_MICROS } from "@/lib/messaging/cost";
import { wrongNumberReportedSince } from "@/lib/messaging/opt-out";
import { dailySpendCapMicros, smsSpendTodayMicros } from "@/lib/messaging/spend";

export type RequestCodeInput = {
  channel: OtpChannel;
  /** Raw phone or email as typed. */
  input: string;
  ip: string | null;
  /** Set when the code is for joining a specific trip via the group link (per-trip limit). */
  tripId?: string;
  captchaToken?: string | null;
};

export type RequestCodeResult =
  | { ok: true; channel: OtpChannel; display: string }
  | {
      ok: false;
      error: "invalid" | "use_email" | "limited" | "captcha" | "unavailable";
      /** True when the UI should show a CAPTCHA widget and resubmit. */
      captchaRequired?: boolean;
    };

const MIN = 60_000;

async function countRequests(tx: Tx, destination: string, ip: string | null, tripId?: string): Promise<OtpCounts> {
  const now = Date.now();
  const tenMin = new Date(now - 10 * MIN);
  const day = new Date(now - 24 * 60 * MIN);
  const n = sql<number>`count(*)::int`;
  const c10 = sql<number>`count(*) filter (where ${otpRequests.createdAt} >= ${tenMin.toISOString()})::int`;
  const [dest] = await tx
    .select({ day: n, m10: c10 })
    .from(otpRequests)
    .where(and(eq(otpRequests.destination, destination), gte(otpRequests.createdAt, day)));
  const [byIp] = ip
    ? await tx
        .select({ day: n, m10: c10 })
        .from(otpRequests)
        .where(and(eq(otpRequests.ip, ip), gte(otpRequests.createdAt, day)))
    : [{ day: 0, m10: 0 }];
  const [byTrip] = tripId
    ? await tx
        .select({ day: n })
        .from(otpRequests)
        .where(and(eq(otpRequests.tripId, tripId), gte(otpRequests.createdAt, day)))
    : [{ day: 0 }];
  return {
    destination10m: dest?.m10 ?? 0,
    destinationDay: dest?.day ?? 0,
    ip10m: byIp?.m10 ?? 0,
    ipDay: byIp?.day ?? 0,
    tripDay: byTrip?.day ?? 0,
  };
}

export async function requestCode(req: RequestCodeInput): Promise<RequestCodeResult> {
  let destination: string;
  let display: string;
  if (req.channel === "sms") {
    const p = normalizePhone(req.input);
    if (!p.ok) return { ok: false, error: "invalid" };
    if (!p.smsSupported) return { ok: false, error: "use_email" }; // FR-14
    destination = p.e164;
    display = maskPhone(p.e164);
  } else {
    const e = normalizeEmail(req.input);
    if (!e) return { ok: false, error: "invalid" };
    destination = e;
    display = e;
  }

  const db = await getDb();
  const gate = await asService(db, async (tx) => {
    const counts = await countRequests(tx, destination, req.ip, req.tripId);
    const decision = decideOtpRequest(counts);
    if (decision.kind === "limited") return { error: "limited" as const };
    if (decision.captcha) {
      const captcha = getCaptcha();
      if (captcha.enabled && !(await captcha.verify(req.captchaToken, req.ip))) {
        return { error: "captcha" as const };
      }
    }
    if (req.channel === "sms") {
      const spent = await smsSpendTodayMicros(tx);
      if (spent + VERIFY_COST_MICROS > dailySpendCapMicros()) {
        console.error("[auth] daily SMS spend cap reached; refusing code send");
        return { error: "unavailable" as const };
      }
    }
    await tx.insert(otpRequests).values({ destination, ip: req.ip, tripId: req.tripId ?? null });
    return null;
  });
  if (gate) {
    return gate.error === "captcha"
      ? { ok: false, error: "captcha", captchaRequired: true }
      : { ok: false, error: gate.error };
  }

  let started;
  try {
    started = await getOtpProvider(req.channel).start({ channel: req.channel, destination });
  } catch (err) {
    console.error("[auth] code send failed", err);
    return { ok: false, error: "unavailable" };
  }

  const challenge = await signPayload(
    {
      k: "otp",
      channel: req.channel,
      destination,
      issuedAt: Date.now(),
      ...(started.codeHash ? { codeHash: started.codeHash } : {}),
    },
    OTP_TTL_SECONDS,
  );
  (await cookies()).set(COOKIE.otp, challenge, cookieOptions(OTP_TTL_SECONDS));
  return { ok: true, channel: req.channel, display };
}

export type VerifyCodeResult =
  | { ok: true; isNewUser: boolean; needsName: boolean; needsRecheck: boolean }
  | { ok: false; error: "expired" | "wrong" | "locked"; attemptsLeft?: number };

const FAILED_ACTION = "auth.otp_failed";

export async function verifyCode(rawCode: string): Promise<VerifyCodeResult> {
  const jar = await cookies();
  const ch = await verifyPayload(jar.get(COOKIE.otp)?.value, "otp");
  if (!ch) return { ok: false, error: "expired" };

  const code = rawCode.replace(/\D/g, "");
  const destKey = keyedHash(`dest:${ch.destination}`); // never store the raw number in audit rows
  const db = await getDb();

  const failed = await asService(db, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, FAILED_ACTION),
          sql`${auditLog.data}->>'d' = ${destKey}`,
          gte(auditLog.createdAt, new Date(ch.issuedAt)),
        ),
      );
    return row?.n ?? 0;
  });
  if (attemptsExhausted(failed)) {
    jar.delete(COOKIE.otp);
    return { ok: false, error: "locked" };
  }

  const ok =
    code.length === 6 &&
    (await getOtpProvider(ch.channel).check({
      channel: ch.channel,
      destination: ch.destination,
      codeHash: ch.codeHash,
      code,
    }));

  if (!ok) {
    await asService(db, (tx) =>
      tx.insert(auditLog).values({ action: FAILED_ACTION, entity: "otp", data: { d: destKey } }),
    );
    const attemptsLeft = OTP_LIMITS.maxAttempts - failed - 1;
    if (attemptsLeft <= 0) {
      jar.delete(COOKIE.otp);
      return { ok: false, error: "locked" };
    }
    return { ok: false, error: "wrong", attemptsLeft };
  }

  const now = new Date();
  const result = await asService(db, async (tx) => {
    const byDest = ch.channel === "sms" ? eq(users.phone, ch.destination) : eq(users.email, ch.destination);
    const [existing] = await tx.select().from(users).where(byDest).limit(1);
    if (existing) {
      // FR-16 / J-4: long-inactive number, or someone replied WRONG to it since the last sign-in.
      const recheck =
        ch.channel === "sms" &&
        (needsRecycledNumberCheck(existing.lastSignInAt, false, now) ||
          (await wrongNumberReportedSince(tx, ch.destination, existing.lastSignInAt)));
      await tx.update(users).set({ lastSignInAt: now }).where(eq(users.id, existing.id));
      return { user: existing, isNewUser: false, recheck };
    }
    const [created] = await tx
      .insert(users)
      .values({
        displayName: "",
        lastSignInAt: now,
        ...(ch.channel === "sms" ? { phone: ch.destination } : { email: ch.destination }),
      })
      .returning();
    return { user: created!, isNewUser: true, recheck: false };
  });

  await setFullSession({ userId: result.user.id, needsRecheck: result.recheck });
  jar.delete(COOKIE.otp);
  return {
    ok: true,
    isNewUser: result.isNewUser,
    needsName: result.user.displayName.trim() === "",
    needsRecheck: result.recheck,
  };
}

/** The pending challenge, for the code screen ("We texted •••• 0100"). */
export async function pendingChallenge(): Promise<{ channel: OtpChannel; display: string } | null> {
  const ch = await verifyPayload((await cookies()).get(COOKIE.otp)?.value, "otp");
  if (!ch) return null;
  return {
    channel: ch.channel,
    display: ch.channel === "sms" ? maskPhone(ch.destination) : ch.destination,
  };
}

export function cleanDisplayName(input: string): string | null {
  const name = input.normalize("NFKC").replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

export async function setDisplayName(input: string): Promise<{ ok: boolean }> {
  const user = await requireFull({ allowRecheck: true });
  const name = cleanDisplayName(input);
  if (!name) return { ok: false };
  const db = await getDb();
  await asService(db, (tx) => tx.update(users).set({ displayName: name }).where(eq(users.id, user.userId)));
  return { ok: true };
}
