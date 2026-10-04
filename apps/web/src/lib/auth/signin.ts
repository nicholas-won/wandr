/**
 * Sign-in with a code (FR-5, FR-14, FR-15, FR-16; J-4, J-16, J-17). Server only.
 *
 * One implementation, two carriers: `startCodeChallenge` / `checkCodeChallenge` do the work;
 * `requestCode` / `verifyCode` keep the challenge and session in cookies (web), and the
 * /api/v1 auth routes return them as bearer tokens instead (native app, D75).
 *
 * - SMS codes for US/CA numbers via Twilio Verify (separate sender, FR-85); email elsewhere.
 * - Limits per destination, IP and trip, CAPTCHA after repeats, daily SMS spend cap.
 * - The response never reveals whether a number/email is known (J-17).
 * - Max 5 wrong codes per challenge; codes expire after 10 minutes.
 * - A known number inactive 60+ days gets `needsRecheck` on its session (FR-16, J-4).
 */
import { cookies } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { asService, auditLog, getDb, members, otpRequests, users, type Db, type Tx } from "@wandr/db";
import { getCaptcha } from "./captcha";
import { COOKIE, cookieOptions } from "./cookies";
import { keyedHash } from "./crypto";
import { codeTestMode, getOtpProvider, type OtpChannel } from "./otp/provider";
import { maskPhone, normalizeEmail, normalizePhone } from "./phone";
import {
  attemptsExhausted,
  decideOtpRequest,
  needsRecycledNumberCheck,
  OTP_LIMITS,
  type OtpCounts,
} from "./rate-limit";
import { getSession, requireFull, setFullSession } from "./session";
import { adoptProvisionalUser, PROVISIONAL_NAME } from "./provisional";
import { attachVerifiedIdentity } from "@/server/membership";
import { OTP_TTL_SECONDS, signPayload, verifyPayload, type OtpChallengePayload, type Verified } from "./tokens";
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

/** FR-15 limits, CAPTCHA and the SMS spend cap; records the request. Null = go ahead. */
async function gateRequest(req: {
  channel: OtpChannel;
  destination: string;
  ip: string | null;
  tripId?: string;
  captchaToken?: string | null;
  /** Signed-in flows (add email, recheck) skip the CAPTCHA but keep every limit. */
  skipCaptcha?: boolean;
}): Promise<{ error: "limited" | "captcha" | "unavailable" } | null> {
  const db = await getDb();
  return asService(db, async (tx) => {
    const counts = await countRequests(tx, req.destination, req.ip, req.tripId);
    const decision = decideOtpRequest(counts);
    if (decision.kind === "limited") return { error: "limited" as const };
    if (decision.captcha && !req.skipCaptcha) {
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
    await tx.insert(otpRequests).values({ destination: req.destination, ip: req.ip, tripId: req.tripId ?? null });
    return null;
  });
}

export type CodeChallengeResult =
  | { ok: true; channel: OtpChannel; display: string; challenge: string; testMode: boolean }
  | Extract<RequestCodeResult, { ok: false }>;

/**
 * Shared by the cookie flow (web) and the token flow (native app, /api/v1): validates the
 * destination, applies every limit (FR-15) and sends the code. Returns the signed challenge;
 * the caller decides where it lives (a cookie, or the API response).
 */
export async function startCodeChallenge(req: RequestCodeInput): Promise<CodeChallengeResult> {
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

  const gate = await gateRequest({ channel: req.channel, destination, ip: req.ip, tripId: req.tripId, captchaToken: req.captchaToken });
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
  return { ok: true, channel: req.channel, display, challenge, testMode: codeTestMode(req.channel) };
}

/** Web sign-in: the challenge rides in a short-lived cookie. */
export async function requestCode(req: RequestCodeInput): Promise<RequestCodeResult> {
  const r = await startCodeChallenge(req);
  if (!r.ok) return r;
  (await cookies()).set(COOKIE.otp, r.challenge, cookieOptions(OTP_TTL_SECONDS));
  return { ok: true, channel: r.channel, display: r.display };
}

export type VerifyCodeResult =
  | { ok: true; isNewUser: boolean; needsName: boolean; needsRecheck: boolean }
  | { ok: false; error: "expired" | "wrong" | "locked"; attemptsLeft?: number };

const FAILED_ACTION = "auth.otp_failed";

export type CheckedCode =
  | { ok: true; userId: string; isNewUser: boolean; needsName: boolean; needsRecheck: boolean }
  | { ok: false; error: "expired" | "wrong" | "locked"; attemptsLeft?: number };

const USED_ACTION = "auth.otp_used";

type VerifiedChallenge =
  | { ok: true; ch: Verified<OtpChallengePayload> }
  | { ok: false; error: "expired" | "wrong" | "locked"; attemptsLeft?: number };

/**
 * Check a code against a signed challenge: max 5 wrong codes per challenge (J-16/J-17), each
 * challenge works once, and its `purpose` must match, so an "add email" or "recheck" code can
 * never sign anyone in and a sign-in code can't confirm an email (and only for that user).
 */
async function verifyChallengeCode(
  challenge: string | undefined,
  rawCode: string,
  purpose: OtpChallengePayload["purpose"],
  userId?: string,
): Promise<VerifiedChallenge> {
  const ch = await verifyPayload(challenge, "otp");
  if (!ch || ch.purpose !== purpose || (purpose && ch.userId !== userId)) return { ok: false, error: "expired" };

  const code = rawCode.replace(/\D/g, "");
  const destKey = keyedHash(`dest:${ch.destination}`); // never store the raw number in audit rows
  const challengeKey = keyedHash(`challenge:${challenge}`);
  const db = await getDb();

  const { failed, used } = await asService(db, async (tx) => {
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
    const [usedRow] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, USED_ACTION),
          sql`${auditLog.data}->>'c' = ${challengeKey}`,
          gte(auditLog.createdAt, new Date(ch.issuedAt)),
        ),
      )
      .limit(1);
    return { failed: row?.n ?? 0, used: !!usedRow };
  });
  if (used) return { ok: false, error: "expired" };
  if (attemptsExhausted(failed)) return { ok: false, error: "locked" };

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
    if (attemptsLeft <= 0) return { ok: false, error: "locked" };
    return { ok: false, error: "wrong", attemptsLeft };
  }
  await asService(db, (tx) => tx.insert(auditLog).values({ action: USED_ACTION, entity: "otp", data: { c: challengeKey } }));
  return { ok: true, ch };
}

/**
 * Shared by the cookie and token flows: checks a sign-in code (see `verifyChallengeCode`), finds or
 * creates the verified user and applies the recycled-number check (FR-16, J-4).
 *
 * `provisionalId`: a zero-setup device user to adopt (web only; the API has no provisional users, D74).
 */
export async function checkCodeChallenge(
  challenge: string | undefined,
  rawCode: string,
  opts: { provisionalId?: string | null } = {},
): Promise<CheckedCode> {
  const verified = await verifyChallengeCode(challenge, rawCode, undefined);
  if (!verified.ok) return verified;
  const { ch } = verified;
  const db = await getDb();

  const now = new Date();
  const provisionalId = opts.provisionalId ?? null;
  const result = await asService(db, async (tx) => {
    const byDest = ch.channel === "sms" ? eq(users.phone, ch.destination) : eq(users.email, ch.destination);
    const [existing] = await tx.select().from(users).where(byDest).limit(1);
    if (!existing && provisionalId) {
      // P1/FR-1: the zero-setup creator verifies; their device user becomes the verified user.
      const [adopted] = await tx
        .update(users)
        .set({
          lastSignInAt: now,
          ...(ch.channel === "sms" ? { phone: ch.destination } : { email: ch.destination }),
        })
        .where(eq(users.id, provisionalId))
        .returning();
      if (adopted) return { user: adopted, isNewUser: false, recheck: false };
    }
    if (existing && provisionalId && provisionalId !== existing.id) {
      await adoptProvisionalUser(tx, provisionalId, existing.id);
    }
    if (existing) {
      // FR-16 / J-4: long-inactive number, or someone replied WRONG to it since the last sign-in.
      const recheck =
        ch.channel === "sms" &&
        (needsRecycledNumberCheck(existing.lastSignInAt, false, now) ||
          (await wrongNumberReportedSince(tx, ch.destination, existing.lastSignInAt)));
      // The flag lives in the DB (not just this cookie) so signing in again can't skip it (FR-16).
      // A code to the account's verified email is the second factor, so it clears it (J-4).
      const pending = ch.channel === "email" ? false : recheck || !!existing.recheckPendingAt;
      await tx
        .update(users)
        .set({
          lastSignInAt: now,
          recheckPendingAt: pending ? (existing.recheckPendingAt ?? now) : null,
        })
        .where(eq(users.id, existing.id));
      return { user: existing, isNewUser: false, recheck: pending };
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

  // FR-5: a personal-link guest who verifies keeps their memberships (not for a recycled-number recheck, J-4).
  if (!result.recheck) await asService(db, (tx) => attachVerifiedIdentity(tx, result.user.id));
  return {
    ok: true,
    userId: result.user.id,
    isNewUser: result.isNewUser,
    needsName: result.user.displayName.trim() === "",
    needsRecheck: result.recheck,
  };
}

/** Web sign-in: reads the challenge cookie, then sets the session cookie. */
export async function verifyCode(rawCode: string): Promise<VerifyCodeResult> {
  const jar = await cookies();
  const provisional = (await getSession()).user;
  const r = await checkCodeChallenge(jar.get(COOKIE.otp)?.value, rawCode, {
    provisionalId: provisional?.provisional ? provisional.userId : null,
  });
  if (!r.ok) {
    if (r.error !== "wrong") jar.delete(COOKIE.otp);
    return r;
  }
  await setFullSession({ userId: r.userId, needsRecheck: r.needsRecheck });
  jar.delete(COOKIE.otp);
  return { ok: true, isNewUser: r.isNewUser, needsName: r.needsName, needsRecheck: r.needsRecheck };
}

/** The pending challenge, for the code screen ("We texted •••• 0100"). */
export async function pendingChallenge(): Promise<{ channel: OtpChannel; display: string } | null> {
  const ch = await verifyPayload((await cookies()).get(COOKIE.otp)?.value, "otp");
  if (!ch || ch.purpose) return null; // account-page codes have their own screens
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
  return applyDisplayName(await getDb(), user.userId, input);
}

/** Set a verified person's name (web and API). */
export async function applyDisplayName(db: Db, userId: string, input: string): Promise<{ ok: boolean }> {
  const name = cleanDisplayName(input);
  if (!name) return { ok: false };
  await asService(db, async (tx) => {
    await tx.update(users).set({ displayName: name }).where(eq(users.id, userId));
    // Zero-setup creators start as "Me" on their trips (P1); give those rows the real name.
    await tx
      .update(members)
      .set({ displayName: name })
      .where(and(eq(members.userId, userId), eq(members.displayName, PROVISIONAL_NAME)));
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Signed-in email codes: add an email (J-6) and the recycled-number recheck (FR-16, J-4)
// ---------------------------------------------------------------------------

export type AccountCodePurpose = "add_email" | "recheck";

export type AccountCodeResult =
  | { ok: true; display: string }
  | { ok: false; error: "invalid" | "no_email" | "limited" | "unavailable" | "not_allowed" };

/**
 * Email a code to the signed-in person. `add_email`: to the address they typed (not allowed
 * while a recheck is pending, or a recycled number could add its own email). `recheck`: to the
 * email already on the account, never one typed now.
 */
export async function requestAccountEmailCode(
  purpose: AccountCodePurpose,
  input: string | null,
  ip: string | null,
): Promise<AccountCodeResult> {
  const user = await requireFull({ allowRecheck: purpose === "recheck" });
  if (purpose === "add_email" && user.needsRecheck) return { ok: false, error: "not_allowed" };
  let destination: string;
  if (purpose === "recheck") {
    const db = await getDb();
    const [u] = await asService(db, (tx) => tx.select({ email: users.email }).from(users).where(eq(users.id, user.userId)));
    if (!u?.email) return { ok: false, error: "no_email" };
    destination = u.email;
  } else {
    const e = normalizeEmail(input ?? "");
    if (!e) return { ok: false, error: "invalid" };
    destination = e;
  }
  const gate = await gateRequest({ channel: "email", destination, ip, skipCaptcha: true });
  if (gate) return { ok: false, error: gate.error === "captcha" ? "limited" : gate.error };
  let started;
  try {
    started = await getOtpProvider("email").start({ channel: "email", destination });
  } catch (err) {
    console.error("[auth] email code send failed", err);
    return { ok: false, error: "unavailable" };
  }
  const challenge = await signPayload(
    {
      k: "otp",
      channel: "email",
      destination,
      issuedAt: Date.now(),
      purpose,
      userId: user.userId,
      ...(started.codeHash ? { codeHash: started.codeHash } : {}),
    },
    OTP_TTL_SECONDS,
  );
  (await cookies()).set(COOKIE.otp, challenge, cookieOptions(OTP_TTL_SECONDS));
  return { ok: true, display: maskEmail(destination) };
}

/** "s•••@example.com": enough to recognize, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export type AccountVerifyResult =
  | { ok: true }
  | { ok: false; error: "expired" | "wrong" | "locked" | "taken"; attemptsLeft?: number };

/**
 * Check a signed-in email code. `add_email` saves the address (J-6); an address that already
 * belongs to another account is refused (said only after they proved they own it, J-17).
 * `recheck` clears the pending recycled-number check (FR-16) and links their memberships (FR-5).
 */
export async function verifyAccountEmailCode(purpose: AccountCodePurpose, rawCode: string): Promise<AccountVerifyResult> {
  const user = await requireFull({ allowRecheck: purpose === "recheck" });
  const jar = await cookies();
  const checked = await verifyChallengeCode(jar.get(COOKIE.otp)?.value, rawCode, purpose, user.userId);
  if (!checked.ok) {
    if (checked.error !== "wrong") jar.delete(COOKIE.otp);
    return checked;
  }
  jar.delete(COOKIE.otp);
  const db = await getDb();
  if (purpose === "recheck") {
    await asService(db, (tx) => clearRecheck(tx, user.userId, "email"));
    await setFullSession({ userId: user.userId, needsRecheck: false, provisional: user.provisional });
    return { ok: true };
  }
  const email = checked.ch.destination;
  const taken = await asService(db, async (tx) => {
    const [other] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (other && other.id !== user.userId) return true;
    await tx.update(users).set({ email }).where(eq(users.id, user.userId));
    await tx.insert(auditLog).values({ action: "user.email_verified", entity: "user", entityId: user.userId });
    await attachVerifiedIdentity(tx, user.userId);
    return false;
  });
  return taken ? { ok: false, error: "taken" } : { ok: true };
}

/** FR-16 / J-4: the person is confirmed (email code or an organizer); link their memberships (FR-5). */
export async function clearRecheck(tx: Tx, userId: string, via: "email" | "organizer", actorMemberId?: string, tripId?: string) {
  await tx.update(users).set({ recheckPendingAt: null }).where(eq(users.id, userId));
  await tx.insert(auditLog).values({
    action: "user.recheck_cleared",
    entity: "user",
    entityId: userId,
    tripId: tripId ?? null,
    actorMemberId: actorMemberId ?? null,
    data: { via },
  });
  await attachVerifiedIdentity(tx, userId);
}

/** The pending account-page code, for re-rendering its screen. */
export async function pendingAccountChallenge(purpose: AccountCodePurpose): Promise<{ display: string } | null> {
  const ch = await verifyPayload((await cookies()).get(COOKIE.otp)?.value, "otp");
  if (!ch || ch.purpose !== purpose) return null;
  return { display: maskEmail(ch.destination) };
}
