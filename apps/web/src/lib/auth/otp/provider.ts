/**
 * Sign-in code providers (FR-14, FR-15, FR-85).
 *
 * - SMS: Twilio Verify, whose sender is separate from the trip-texts number so STOP on trip
 *   texts never blocks sign-in (FR-85, DN-22). Twilio enforces its own attempt limits and
 *   Fraud Guard (J-16) on top of ours.
 * - Email: we generate the code and send it with Resend (console in dev).
 * - Dev: when Twilio isn't configured, the code is logged to the server console.
 *
 * Locally generated codes are never stored in the DB: an HMAC of (destination, code) rides in the
 * signed challenge cookie and is compared on check.
 */
import { APP_NAME } from "@wandr/core/config";
import { env } from "@/lib/env";
import { keyedHash, randomCode, safeEqual } from "@/lib/auth/crypto";
import { getEmailProvider } from "@/lib/messaging/email-provider";
import { twilioPost, type TwilioCreds } from "@/lib/messaging/twilio-rest";

export type OtpChannel = "sms" | "email";

export type OtpStart = { channel: OtpChannel; destination: string };
export type OtpStarted = { codeHash?: string };
export type OtpCheck = OtpStart & { codeHash?: string; code: string };

export interface OtpProvider {
  readonly name: "twilio-verify" | "email" | "dev-console";
  start(req: OtpStart): Promise<OtpStarted>;
  check(req: OtpCheck): Promise<boolean>;
}

export const DEV_BYPASS_CODE = "000000";

export function hashCode(destination: string, code: string): string {
  return keyedHash(`otp:${destination}:${code}`);
}

function checkLocal(req: OtpCheck): boolean {
  if (!req.codeHash) return false;
  return safeEqual(req.codeHash, hashCode(req.destination, req.code));
}

export function twilioVerifyProvider(creds: TwilioCreds, serviceSid: string): OtpProvider {
  const base = `https://verify.twilio.com/v2/Services/${serviceSid}`;
  return {
    name: "twilio-verify",
    async start({ destination }) {
      const r = await twilioPost<{ status?: string; message?: string }>(creds, `${base}/Verifications`, {
        To: destination,
        Channel: "sms",
      });
      if (!r.ok) throw new Error(`Twilio Verify start failed (${r.status}): ${r.data.message ?? ""}`);
      return {};
    },
    async check({ destination, code }) {
      const r = await twilioPost<{ status?: string }>(creds, `${base}/VerificationCheck`, {
        To: destination,
        Code: code,
      });
      // 404 = expired, already approved, or max attempts reached.
      return r.ok && r.data.status === "approved";
    },
  };
}

export const devConsoleProvider: OtpProvider = {
  name: "dev-console",
  async start({ channel, destination }) {
    const code = randomCode();
    console.info(`[otp:dev] ${channel} code for ${destination}: ${code}`);
    return { codeHash: hashCode(destination, code) };
  },
  async check(req) {
    return checkLocal(req);
  },
};

export const emailCodeProvider: OtpProvider = {
  name: "email",
  async start({ destination }) {
    const code = randomCode();
    await getEmailProvider().send({
      to: destination,
      subject: `${code} is your ${APP_NAME} code`,
      text: `Your ${APP_NAME} sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
    });
    return { codeHash: hashCode(destination, code) };
  },
  async check(req) {
    return checkLocal(req);
  },
};

/** Wraps a provider to accept 000000 outside production (local dev and tests only). */
export function withDevBypass(p: OtpProvider): OtpProvider {
  if (process.env.NODE_ENV === "production") return p;
  return {
    name: p.name,
    start: (req) => p.start(req),
    check: async (req) => req.code === DEV_BYPASS_CODE || p.check(req),
  };
}

export function getOtpProvider(channel: OtpChannel): OtpProvider {
  if (channel === "email") return withDevBypass(emailCodeProvider);
  const e = env();
  if (e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_VERIFY_SERVICE_SID) {
    return withDevBypass(
      twilioVerifyProvider(
        { accountSid: e.TWILIO_ACCOUNT_SID, authToken: e.TWILIO_AUTH_TOKEN },
        e.TWILIO_VERIFY_SERVICE_SID,
      ),
    );
  }
  if (e.NODE_ENV === "production") throw new Error("Twilio Verify is not configured");
  return withDevBypass(devConsoleProvider);
}

/**
 * D74 test mode: outside production, when codes aren't really delivered (no Twilio Verify for
 * texts, no Resend for email), the code goes to the server console and 000000 works. The sign-in
 * screens say so.
 */
export function codeTestMode(channel: OtpChannel): boolean {
  const e = env();
  if (e.NODE_ENV === "production") return false;
  if (channel === "sms") return !(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_VERIFY_SERVICE_SID);
  return !e.RESEND_API_KEY;
}
