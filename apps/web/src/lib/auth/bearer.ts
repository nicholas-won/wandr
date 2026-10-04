/**
 * Bearer tokens for the native app (D75, /api/v1). A token is the same signed "full" payload the
 * web keeps in its session cookie (60 days, FR-5 full scope after a code), so RLS sees the same
 * claims (`{ sub }`) whichever way the person signed in. Stateless: signing out means the app
 * drops the token.
 *
 * No Next.js imports, so route handlers and tests can call it with a plain Request.
 */
import { SESSION_TTL_SECONDS, signPayload, verifyPayload } from "./tokens";

export type BearerUser = { userId: string; needsRecheck: boolean };

/** The token in `Authorization: Bearer <token>`, or null. */
export function bearerToken(h: Headers): string | null {
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,4096})\s*$/i.exec(h.get("authorization") ?? "");
  return m ? m[1]! : null;
}

/**
 * The verified person behind a bearer token. Provisional (device-only) sessions never count:
 * the API has no provisional users (D74).
 */
export async function bearerUser(h: Headers, now: number = Date.now()): Promise<BearerUser | null> {
  const token = bearerToken(h);
  if (!token) return null;
  const p = await verifyPayload(token, "full", now);
  if (!p || p.provisional || typeof p.userId !== "string") return null;
  return { userId: p.userId, needsRecheck: !!p.needsRecheck };
}

/** `getApiUser(request)`: the caller of an /api/v1 route, from its bearer token only. */
export function getApiUser(request: Request): Promise<BearerUser | null> {
  return bearerUser(request.headers);
}

/** A long-lived app token after a verified code (60 days, J-6). */
export function issueApiToken(user: BearerUser): Promise<string> {
  return signPayload(
    { k: "full", userId: user.userId, ...(user.needsRecheck ? { needsRecheck: true } : {}) },
    SESSION_TTL_SECONDS,
  );
}
