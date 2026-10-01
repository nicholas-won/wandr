/**
 * Signing key for session cookies, challenges and code hashes.
 * Production requires SESSION_SECRET; dev falls back to a fixed key with a loud warning.
 */
const DEV_FALLBACK = "dev-only-insecure-session-secret-change-me-0123456789";

let warned = false;
let cachedKey: Uint8Array | undefined;

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s) {
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return s;
  }
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("SESSION_SECRET is required in production");
  }
  if (!warned) {
    warned = true;
    console.warn("[auth] SESSION_SECRET is not set; using an insecure dev fallback secret.");
  }
  return DEV_FALLBACK;
}

export function sessionKey(): Uint8Array {
  cachedKey ??= new TextEncoder().encode(sessionSecret());
  return cachedKey;
}
