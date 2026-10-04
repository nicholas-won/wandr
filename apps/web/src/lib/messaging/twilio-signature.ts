/**
 * Twilio webhook signature (X-Twilio-Signature): base64 HMAC-SHA1, keyed with the auth token,
 * over the full URL followed by each POST param name+value sorted by name. Pure.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Iterable<[string, string]>,
): string {
  const sorted = [...params].sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
  const data = url + sorted.map(([k, v]) => k + v).join("");
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function verifyTwilioSignature(
  authToken: string,
  signature: string | null | undefined,
  url: string,
  params: Iterable<[string, string]>,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
