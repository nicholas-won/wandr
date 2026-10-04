/**
 * Server environment, validated with zod. Every value is optional so the app builds and runs
 * locally with no setup (PGlite, console texts/emails, dev OTP codes). Production-only
 * requirements are enforced where they are used (e.g. the Twilio signature check).
 *
 * Read lazily through `env()` so `next build` never fails on missing variables.
 */
import { z } from "zod";

const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);
const optionalInt = (fallback: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().nonnegative().default(fallback),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: optionalString,
  /** Signs session + personal-link cookies. 32+ random bytes. */
  SESSION_SECRET: optionalString,
  APP_URL: optionalString,

  // Twilio: Messaging Service for trip texts; Verify service (separate sender) for codes, FR-85.
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_MESSAGING_SERVICE_SID: optionalString,
  TWILIO_VERIFY_SERVICE_SID: optionalString,
  /** Public URL Twilio posts inbound texts to, if it differs from APP_URL + /api/sms/inbound. */
  TWILIO_INBOUND_URL: optionalString,
  /** Daily cap on estimated SMS spend across all texts and codes (FR-15, NFR-6). */
  SMS_DAILY_SPEND_CAP_CENTS: optionalInt(2000),

  // Email (Resend)
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  SUPPORT_EMAIL: optionalString,

  // CAPTCHA (Cloudflare Turnstile) before repeated code requests (FR-15, J-16)
  TURNSTILE_SECRET_KEY: optionalString,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalString,

  // Background jobs (Inngest). Unset → jobs run in-process via after() (local dev).
  INNGEST_EVENT_KEY: optionalString,
  INNGEST_SIGNING_KEY: optionalString,
  // Supabase Storage for texted receipt photos. Unset → saved under .data/media (dev only).
  SUPABASE_URL: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.message}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";

/** Absolute base URL for links in texts and emails, without a trailing slash. */
export function appUrl(): string {
  const fromEnv = env().APP_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Test hook. */
export function resetEnvForTests() {
  cached = undefined;
}
