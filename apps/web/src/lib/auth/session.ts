/**
 * Request sessions (server only).
 *
 * Two kinds, held in separate signed cookies:
 * - Full session {userId} after a verified SMS/email code. 60-day rolling (J-6).
 * - Personal-link grants {memberId, tripId} (FR-5): view + vote only for that trip.
 *
 * Use `claimsFor(session, tripId)` to get the Claims for `withSession(db, claims, fn)` so RLS
 * applies. Money, approvals and settings must call `requireFull()` first (FR-5).
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { asService, getDb, memberLinks, members, users, type Claims } from "@wandr/db";
import { routes } from "@/lib/routes";
import { bearerUser } from "./bearer";
import { COOKIE, cookieOptions } from "./cookies";
import {
  mergeGrant,
  SESSION_TTL_SECONDS,
  signPayload,
  verifyPayload,
  type LinkGrant,
} from "./tokens";

export type FullUser = { userId: string; needsRecheck: boolean; provisional?: boolean };
export type Session = {
  /** Verified person, or null. */
  user: FullUser | null;
  /** Live personal-link grants (revoked links and removed members already filtered out). */
  links: LinkGrant[];
};

export class AuthError extends Error {
  constructor(
    public readonly code: "signin_required" | "recheck_required",
    message = code,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Read the session for this request. Memoized per request. */
export const getSession = cache(async (): Promise<Session> => {
  const jar = await cookies();
  // Native app requests (D75) carry a bearer token instead of cookies; same claims either way.
  const bearer = await bearerUser(await headers());
  if (bearer) {
    // Same database check as cookies: deleted accounts are signed out, rechecks apply (FR-16, NFR-7).
    const acct = await accountState(bearer.userId);
    return { user: acct ? { userId: bearer.userId, needsRecheck: acct.recheckPending } : null, links: [] };
  }
  const full = await verifyPayload(jar.get(COOKIE.session)?.value, "full");
  const linkCookie = await verifyPayload(jar.get(COOKIE.links)?.value, "links");
  const links = linkCookie ? await liveGrants(linkCookie.grants) : [];
  const account = full ? await accountState(full.userId) : null;
  return {
    user:
      full && account
        ? { userId: full.userId, needsRecheck: account.recheckPending, provisional: !!full.provisional }
        : null,
    links,
  };
});

/**
 * The database decides, not the cookie: a deleted account (NFR-7) signs out every device, and a
 * pending recycled-number check (FR-16, J-4) applies until an email code or an organizer clears
 * it, on every device. Null = no usable account.
 */
async function accountState(userId: string): Promise<{ recheckPending: boolean } | null> {
  const db = await getDb();
  const [u] = await asService(db, (tx) =>
    tx
      .select({ deletedAt: users.deletedAt, recheckPendingAt: users.recheckPendingAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  );
  if (!u || u.deletedAt) return null;
  return { recheckPending: !!u.recheckPendingAt };
}

/** Drop grants whose link was revoked (WRONG, J-4) or whose member was removed (M-12). */
async function liveGrants(grants: LinkGrant[]): Promise<LinkGrant[]> {
  if (grants.length === 0) return [];
  const db = await getDb();
  const rows = await asService(db, (tx) =>
    tx
      .select({ linkId: memberLinks.id, memberId: memberLinks.memberId, tripId: members.tripId })
      .from(memberLinks)
      .innerJoin(members, eq(members.id, memberLinks.memberId))
      .where(
        and(
          inArray(
            memberLinks.id,
            grants.map((g) => g.linkId),
          ),
          isNull(memberLinks.revokedAt),
          ne(members.status, "removed"),
        ),
      ),
  );
  const ok = new Set(rows.map((r) => `${r.linkId}|${r.memberId}|${r.tripId}`));
  return grants.filter((g) => ok.has(`${g.linkId}|${g.memberId}|${g.tripId}`));
}

/**
 * Claims for `withSession`. A verified user acts as themselves (`sub`); otherwise a personal-link
 * grant for this trip acts as that member (`link_member`, view + vote only); otherwise anonymous.
 */
export function claimsFor(session: Session, tripId: string): Claims {
  if (session.user) return { sub: session.user.userId };
  const grant = session.links.find((g) => g.tripId === tripId);
  if (grant) return { link_member: grant.memberId };
  return {};
}

/** The personal-link grant for a trip, if any. */
export function linkGrantFor(session: Session, tripId: string): LinkGrant | undefined {
  return session.links.find((g) => g.tripId === tripId);
}

/**
 * Require a verified code on this device (money, approvals, settings; FR-5).
 * Throws AuthError; pages should prefer `requireFullOrRedirect`.
 * A pending recycled-number check (FR-16, J-4) blocks unless `allowRecheck` is set.
 */
export async function requireFull(
  opts: { allowRecheck?: boolean; allowProvisional?: boolean } = {},
): Promise<FullUser> {
  const { user } = await getSession();
  if (!user || (user.provisional && !opts.allowProvisional)) throw new AuthError("signin_required");
  if (user.needsRecheck && !opts.allowRecheck) throw new AuthError("recheck_required");
  return user;
}

/** Page helper: redirect to /signin (then back to `next`) when there is no full session. */
export async function requireFullOrRedirect(
  next: string,
  opts: { allowRecheck?: boolean; allowProvisional?: boolean } = {},
) {
  try {
    return await requireFull(opts);
  } catch (e) {
    if (e instanceof AuthError) {
      redirect(e.code === "recheck_required" ? routes.recheck(next) : routes.signin(next));
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Writers: call only from Server Actions or Route Handlers.
// ---------------------------------------------------------------------------

export async function setFullSession(user: FullUser): Promise<void> {
  const token = await signPayload(
    {
      k: "full",
      userId: user.userId,
      ...(user.needsRecheck ? { needsRecheck: true } : {}),
      ...(user.provisional ? { provisional: true } : {}),
    },
    SESSION_TTL_SECONDS,
  );
  (await cookies()).set(COOKIE.session, token, cookieOptions(SESSION_TTL_SECONDS));
}

export async function addLinkGrant(grant: LinkGrant): Promise<void> {
  const jar = await cookies();
  const current = await verifyPayload(jar.get(COOKIE.links)?.value, "links");
  const grants = mergeGrant(current?.grants ?? [], grant);
  const token = await signPayload({ k: "links", grants }, SESSION_TTL_SECONDS);
  jar.set(COOKIE.links, token, cookieOptions(SESSION_TTL_SECONDS));
}

/** Sign out of the full session; optionally forget personal-link grants too ("Not you?"). */
export async function signOut(opts: { links?: boolean } = {}): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE.session);
  if (opts.links) jar.delete(COOKIE.links);
}
