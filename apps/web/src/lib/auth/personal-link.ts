/**
 * Personal links (FR-4, FR-5, N-4, N-8, M-12). Server only.
 *
 * - `createPersonalLink` mints a token; only its sha256 is stored. Put the URL in the invite text.
 * - GET /l/[token] only *looks up* the link (`inspectPersonalLink`): no state change, so
 *   link-preview bots and scanners can't consume or bind it (N-4).
 * - The page then POSTs (Server Action) to `redeemPersonalLink`, which binds the link to this
 *   device on first interactive use and grants a view + vote session for that trip.
 * - Revoked links and removed members are refused.
 */
import { cookies } from "next/headers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { asService, auditLog, getDb, memberLinks, members, type Tx } from "@wandr/db";
import { appUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { COOKIE, cookieOptions } from "./cookies";
import { randomToken } from "./crypto";
import { generateLinkToken, hashDeviceId, hashLinkToken, isWellFormedLinkToken } from "./link-token";
import { addLinkGrant } from "./session";

const DEVICE_COOKIE_TTL = 400 * 24 * 60 * 60; // browsers cap cookies at ~400 days

/** Mint a personal link for a member. Returns the full URL; the token is never retrievable again. */
export async function createPersonalLink(tx: Tx, memberId: string): Promise<{ token: string; url: string }> {
  const token = generateLinkToken();
  await tx.insert(memberLinks).values({ memberId, tokenHash: hashLinkToken(token) });
  return { token, url: `${appUrl()}${routes.personalLink(token)}` };
}

/** Revoke every link for these members (WRONG reply J-4, removal M-12). */
export async function revokeLinksForMembers(tx: Tx, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  await tx
    .update(memberLinks)
    .set({ revokedAt: new Date() })
    .where(and(inArray(memberLinks.memberId, memberIds), isNull(memberLinks.revokedAt)));
}

export type LinkStatus = "ok" | "invalid" | "revoked" | "removed";

type LinkRow = {
  linkId: string;
  memberId: string;
  tripId: string;
  revokedAt: Date | null;
  boundDeviceHash: string | null;
  memberStatus: string;
};

async function findLink(tx: Tx, token: string): Promise<LinkRow | undefined> {
  const [row] = await tx
    .select({
      linkId: memberLinks.id,
      memberId: memberLinks.memberId,
      tripId: members.tripId,
      revokedAt: memberLinks.revokedAt,
      boundDeviceHash: memberLinks.boundDeviceHash,
      memberStatus: members.status,
    })
    .from(memberLinks)
    .innerJoin(members, eq(members.id, memberLinks.memberId))
    .where(eq(memberLinks.tokenHash, hashLinkToken(token)))
    .limit(1);
  return row;
}

function statusOf(row: LinkRow | undefined): LinkStatus {
  if (!row) return "invalid";
  if (row.revokedAt) return "revoked";
  if (row.memberStatus === "removed") return "removed";
  return "ok";
}

/** Read-only check for the GET page. Reveals nothing about the trip. */
export async function inspectPersonalLink(token: string): Promise<LinkStatus> {
  if (!isWellFormedLinkToken(token)) return "invalid";
  const db = await getDb();
  return statusOf(await asService(db, (tx) => findLink(tx, token)));
}

export type RedeemResult =
  | { ok: true; tripId: string; redirectTo: string }
  | { ok: false; error: Exclude<LinkStatus, "ok"> | "other_device" };

/**
 * Exchange a personal-link token for a view + vote session on this device (FR-5).
 * Call only from a Server Action / POST handler.
 */
export async function redeemPersonalLink(token: string): Promise<RedeemResult> {
  if (!isWellFormedLinkToken(token)) return { ok: false, error: "invalid" };
  const jar = await cookies();
  let deviceId = jar.get(COOKIE.device)?.value;
  if (!deviceId || !/^[A-Za-z0-9_-]{32,64}$/.test(deviceId)) {
    deviceId = randomToken(24);
    jar.set(COOKIE.device, deviceId, cookieOptions(DEVICE_COOKIE_TTL));
  }
  const deviceHash = hashDeviceId(deviceId);

  const db = await getDb();
  const outcome = await asService(db, async (tx) => {
    const row = await findLink(tx, token);
    const status = statusOf(row);
    if (status !== "ok") return { ok: false as const, error: status };
    if (!row) return { ok: false as const, error: "invalid" as const };
    if (row.boundDeviceHash && row.boundDeviceHash !== deviceHash) {
      // A forwarded link opens on a second device: it must sign in with a code (FR-5, N-8).
      return { ok: false as const, error: "other_device" as const };
    }
    if (!row.boundDeviceHash) {
      // Bind atomically so two devices racing on first open can't both win.
      const bound = await tx
        .update(memberLinks)
        .set({ boundDeviceHash: deviceHash })
        .where(and(eq(memberLinks.id, row.linkId), isNull(memberLinks.boundDeviceHash)))
        .returning({ id: memberLinks.id });
      if (bound.length === 0) return { ok: false as const, error: "other_device" as const };
      await tx.insert(auditLog).values({
        tripId: row.tripId,
        actorMemberId: row.memberId,
        action: "link.bound",
        entity: "member_link",
        entityId: row.linkId,
      });
    }
    if (row.memberStatus === "invited") {
      // Being on the invite list is the organizer's approval; opening the personal link joins
      // (FR-4/5: view and vote instantly). RLS only grants link access to active members.
      const joined = await tx
        .update(members)
        .set({ status: "active", joinedAt: new Date() })
        .where(and(eq(members.id, row.memberId), eq(members.status, "invited")))
        .returning({ id: members.id });
      if (joined.length > 0) {
        await tx.insert(auditLog).values({
          tripId: row.tripId,
          actorMemberId: row.memberId,
          action: "member.joined_via_link",
          entity: "member",
          entityId: row.memberId,
        });
      }
    }
    return { ok: true as const, row };
  });

  if (!outcome.ok) return outcome;
  const { row } = outcome;
  await addLinkGrant({ memberId: row.memberId, tripId: row.tripId, linkId: row.linkId });
  return { ok: true, tripId: row.tripId, redirectTo: routes.trip(row.tripId) };
}
