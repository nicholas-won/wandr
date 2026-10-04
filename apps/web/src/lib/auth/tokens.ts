/**
 * Signed cookie payloads (HS256 JWTs via jose). Pure apart from the clock; no Next.js imports,
 * so the proxy, route handlers and tests can all use it.
 *
 * Kinds:
 * - "full":  a verified person (after an SMS/email code). Full access to their trips.
 * - "links": personal-link grants (FR-5): view + vote only, per trip, bound to this device.
 * - "otp":   a pending code challenge (10 minutes).
 * - "boards": shared-board link grants (FR-L14): view + add only, per board.
 */
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { sessionKey } from "./secret";

const DAY = 24 * 60 * 60;
/** Long-lived device sessions (J-6): 60 days, refreshed on use. */
export const SESSION_TTL_SECONDS = 60 * DAY;
/** Re-issue the cookie when it is older than this (rolling refresh). */
export const SESSION_REFRESH_AFTER_SECONDS = DAY;
export const OTP_TTL_SECONDS = 10 * 60;
/** At most this many personal-link grants in one cookie (one per trip). */
export const MAX_LINK_GRANTS = 20;

export type FullSessionPayload = {
  k: "full";
  userId: string;
  /** Recycled-number extra check pending (FR-16, J-4): no money/approvals/settings until resolved. */
  needsRecheck?: boolean;
  /**
   * Zero-setup creator (P1, FR-1): a device-only user who hasn't verified a phone yet. Acts as
   * themselves on their own trips; anything that reaches other people (invites) needs a code.
   */
  provisional?: boolean;
};

export type LinkGrant = { memberId: string; tripId: string; linkId: string };
export type LinkSessionPayload = { k: "links"; grants: LinkGrant[] };

export type OtpChallengePayload = {
  k: "otp";
  channel: "sms" | "email";
  destination: string;
  /** HMAC of the code for locally generated codes (dev + email drivers); absent for Twilio Verify. */
  codeHash?: string;
  /** Epoch ms the challenge was issued; attempts are counted from here. */
  issuedAt: number;
  next?: string;
  /**
   * Unset = sign in. "add_email" (J-6) and "recheck" (FR-16) are codes for a person who is
   * already signed in (`userId`); they can never be used to sign in.
   */
  purpose?: "add_email" | "recheck";
  userId?: string;
};

/** Shared-board personal-link grants (FR-L14): view + add only, per board. */
export type BoardLinkGrant = { boardMemberId: string; boardId: string; linkId: string };
export type BoardLinkSessionPayload = { k: "boards"; grants: BoardLinkGrant[] };

export type CookiePayload = FullSessionPayload | LinkSessionPayload | OtpChallengePayload | BoardLinkSessionPayload;

export async function signPayload(
  payload: CookiePayload,
  ttlSeconds: number,
  now: number = Date.now(),
): Promise<string> {
  const iat = Math.floor(now / 1000);
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSeconds)
    .sign(sessionKey());
}

export type Verified<T> = T & { iat: number; exp: number };

export async function verifyPayload<K extends CookiePayload["k"]>(
  token: string | undefined,
  kind: K,
  now: number = Date.now(),
): Promise<Verified<Extract<CookiePayload, { k: K }>> | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), {
      algorithms: ["HS256"],
      currentDate: new Date(now),
    });
    if (payload.k !== kind || typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return null;
    }
    return payload as unknown as Verified<Extract<CookiePayload, { k: K }>>;
  } catch {
    return null;
  }
}

/** Whether a verified session cookie should be re-issued (rolling refresh). */
export function shouldRefresh(iatSeconds: number, now: number = Date.now()): boolean {
  return Math.floor(now / 1000) - iatSeconds >= SESSION_REFRESH_AFTER_SECONDS;
}

/** Add or replace the grant for a trip, keeping the most recent MAX_LINK_GRANTS. */
export function mergeGrant(grants: LinkGrant[], grant: LinkGrant): LinkGrant[] {
  const rest = grants.filter((g) => g.tripId !== grant.tripId);
  return [grant, ...rest].slice(0, MAX_LINK_GRANTS);
}
