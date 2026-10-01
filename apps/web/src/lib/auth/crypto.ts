import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./secret";

/** 32 random bytes, base64url (43 chars). Used for personal-link tokens (FR-4). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Keyed hash (HMAC-SHA256 with SESSION_SECRET). Use for anything guessable, e.g. codes, phones. */
export function keyedHash(input: string): string {
  return createHmac("sha256", sessionSecret()).update(input, "utf8").digest("hex");
}

/** Keyed hash of an E.164 number, for audit rows that must not hold the raw number (NFR-3). */
export function phoneKey(e164: string): string {
  return keyedHash(`phone:${e164}`);
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Uniform 6-digit numeric code. */
export function randomCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
