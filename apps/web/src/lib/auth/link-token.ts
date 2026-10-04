/** Personal-link token primitives (FR-4/5). Pure; tested in link-token.test.ts. */
import { keyedHash, randomToken, sha256Hex } from "./crypto";

/** 32 random bytes → 43 base64url chars. Shown once (in the text); only the hash is stored. */
export function generateLinkToken(): string {
  return randomToken(32);
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedLinkToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** sha256 hex of the token: what `member_links.token_hash` stores. */
export function hashLinkToken(token: string): string {
  return sha256Hex(token);
}

/** Keyed hash of the random per-device cookie; stored as `member_links.bound_device_hash`. */
export function hashDeviceId(deviceId: string): string {
  return keyedHash(`device:${deviceId}`);
}
