/**
 * Phone numbers: E.164 normalization (libphonenumber-js). SMS is US/Canada only at launch
 * (FR-14, D35, J-5); everyone else signs in by email.
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const SMS_COUNTRIES: readonly CountryCode[] = ["US", "CA"];

export type PhoneResult =
  | { ok: true; e164: string; country: CountryCode | undefined; smsSupported: boolean }
  | { ok: false; reason: "invalid" };

/** Parse user input ("(415) 555-0100", "+44 20 7946 0958") into E.164. Defaults to US. */
export function normalizePhone(input: string, defaultCountry: CountryCode = "US"): PhoneResult {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 32) return { ok: false, reason: "invalid" };
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) return { ok: false, reason: "invalid" };
  const country = parsed.country;
  return {
    ok: true,
    e164: parsed.number,
    country,
    smsSupported: parsed.countryCallingCode === "1" && !!country && SMS_COUNTRIES.includes(country),
  };
}

/** Normalize an already-E.164 number from a provider webhook; returns null if unusable. */
export function e164OrNull(input: string | null | undefined): string | null {
  if (!input) return null;
  const r = normalizePhone(input);
  return r.ok ? r.e164 : null;
}

/** "•••• 0100": the only form of another person's number ever shown (NFR-3, J-20). */
export function maskPhone(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}
