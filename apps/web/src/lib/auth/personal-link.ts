/**
 * Personal links (FR-4, FR-5, N-4, N-8, M-12, Q1, Q37, Q38). Server only.
 *
 * - `createPersonalLink` mints a token; only its sha256 is stored. Put the URL in the invite text.
 * - GET /l/[token] only *looks up* the link (`inspectPersonalLink`): no state change, so
 *   link-preview bots and scanners can't consume or bind it (N-4).
 * - The page then POSTs (Server Action) to `redeemPersonalLink`, which binds the link to this
 *   device on first interactive use (Q38: a second device needs a code).
 * - Q37: opening never joins. An invited person sees a trip preview and taps "Accept invitation"
 *   (a second POST, `acceptPersonalLink`) or "Not me" (`declinePersonalLink`). Q1: on first open
 *   everyone confirms their name ("You're Sam?", editable). Only then is the view + vote session
 *   granted; later opens go straight in.
 * - Revoked links, removed members and deleted trips (JR3) are refused.
 */
import { cookies } from "next/headers";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { asService, auditLog, getDb, ideas, memberLinks, members, stops, trips, type Tx } from "@wandr/db";
import { linkOpenStep } from "@wandr/core";
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
  nameConfirmedAt: Date | null;
  memberStatus: string;
  displayName: string;
  tripDeletedAt: Date | null;
};

async function findLink(tx: Tx, token: string): Promise<LinkRow | undefined> {
  const [row] = await tx
    .select({
      linkId: memberLinks.id,
      memberId: memberLinks.memberId,
      tripId: members.tripId,
      revokedAt: memberLinks.revokedAt,
      boundDeviceHash: memberLinks.boundDeviceHash,
      nameConfirmedAt: memberLinks.nameConfirmedAt,
      memberStatus: members.status,
      displayName: members.displayName,
      tripDeletedAt: trips.deletedAt,
    })
    .from(memberLinks)
    .innerJoin(members, eq(members.id, memberLinks.memberId))
    .innerJoin(trips, eq(trips.id, members.tripId))
    .where(eq(memberLinks.tokenHash, hashLinkToken(token)))
    .limit(1);
  return row;
}

function statusOf(row: LinkRow | undefined): LinkStatus {
  if (!row) return "invalid";
  if (row.tripDeletedAt) return "revoked";
  // Removal revokes links (M-12), but the person still needs to know where to settle up (M-1).
  if (row.memberStatus === "removed") return "removed";
  if (row.revokedAt) return "revoked";
  return "ok";
}

/** Read-only check for the GET page. Reveals nothing about the trip. */
export async function inspectPersonalLink(token: string): Promise<LinkStatus> {
  if (!isWellFormedLinkToken(token)) return "invalid";
  const db = await getDb();
  return statusOf(await asService(db, (tx) => findLink(tx, token)));
}

/** What the invitee sees before accepting (Q37). Shown only after the interactive POST, never on GET. */
export type LinkPreview = {
  tripName: string;
  /** Their name on the invite list ("You're Sam?"). */
  yourName: string;
  /** Active members already in. */
  people: string[];
  /** Named cities (Stops). */
  cities: string[];
  /** Ideas visible to this person (surprise items hidden from them never count, FR-91). */
  ideaCount: number;
};

export type LinkStep = "accept_invite" | "confirm_name";

export type OpenLinkResult =
  | { ok: true; kind: "open"; tripId: string; memberId: string; linkId: string }
  | { ok: true; kind: "confirm"; step: LinkStep; preview: LinkPreview }
  | { ok: false; error: Exclude<LinkStatus, "ok"> | "other_device" };

async function previewFor(tx: Tx, row: LinkRow): Promise<LinkPreview> {
  const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, row.tripId));
  const people = await tx
    .select({ id: members.id, name: members.displayName })
    .from(members)
    .where(and(eq(members.tripId, row.tripId), eq(members.status, "active")))
    .orderBy(members.createdAt);
  const cityRows = await tx
    .select({ name: stops.name })
    .from(stops)
    .where(and(eq(stops.tripId, row.tripId), eq(stops.isDefault, false)));
  const ideaCount = await tx.$count(
    ideas,
    and(eq(ideas.tripId, row.tripId), sql`not (${row.memberId}::uuid = any(${ideas.hiddenFrom}))`),
  );
  return {
    tripName: trip?.name ?? "",
    yourName: row.displayName,
    people: people.filter((p) => p.id !== row.memberId).map((p) => p.name),
    cities: cityRows.map((c) => c.name).filter(Boolean),
    ideaCount,
  };
}

/**
 * Bind on first interactive open and decide what comes next (Q1, Q37, Q38). Service transaction;
 * call only from a POST. Never changes membership.
 */
export async function openLinkTx(tx: Tx, token: string, deviceHash: string): Promise<OpenLinkResult> {
  const row = await findLink(tx, token);
  const status = statusOf(row);
  if (status !== "ok" || !row) return { ok: false, error: status === "ok" ? "invalid" : status };
  if (row.boundDeviceHash && row.boundDeviceHash !== deviceHash) {
    // A forwarded link opens on a second device: it must sign in with a code (FR-5, N-8, Q38).
    return { ok: false, error: "other_device" };
  }
  if (!row.boundDeviceHash) {
    // Bind atomically so two devices racing on first open can't both win.
    const bound = await tx
      .update(memberLinks)
      .set({ boundDeviceHash: deviceHash })
      .where(and(eq(memberLinks.id, row.linkId), isNull(memberLinks.boundDeviceHash)))
      .returning({ id: memberLinks.id });
    if (bound.length === 0) return { ok: false, error: "other_device" };
    await tx.insert(auditLog).values({
      tripId: row.tripId,
      actorMemberId: row.memberId,
      action: "link.bound",
      entity: "member_link",
      entityId: row.linkId,
    });
  }
  // Q1 asks once per person: texts mint fresh links, so a confirmation on any of their links counts.
  const confirmedBefore =
    row.nameConfirmedAt ??
    (
      await tx
        .select({ at: memberLinks.nameConfirmedAt })
        .from(memberLinks)
        .where(and(eq(memberLinks.memberId, row.memberId), isNotNull(memberLinks.nameConfirmedAt)))
        .limit(1)
    )[0]?.at ??
    null;
  const step = linkOpenStep({
    memberStatus: row.memberStatus as Parameters<typeof linkOpenStep>[0]["memberStatus"],
    nameConfirmedAt: confirmedBefore,
  });
  if (step === "open") return { ok: true, kind: "open", tripId: row.tripId, memberId: row.memberId, linkId: row.linkId };
  if (step === "not_available") return { ok: false, error: "removed" };
  return { ok: true, kind: "confirm", step, preview: await previewFor(tx, row) };
}

function cleanName(input: string): string | null {
  const name = input.normalize("NFKC").replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 40 ? name : null;
}

export type AcceptResult =
  | { ok: true; tripId: string; memberId: string; linkId: string }
  | { ok: false; error: Exclude<LinkStatus, "ok"> | "other_device" | "bad_name" };

/**
 * Q37 "Accept invitation" / Q1 "That's me": an explicit second POST from the device the link is
 * bound to. Invited → active (being on the invite list is the organizer's approval). The name may
 * be edited. Records the confirmation so later opens go straight in.
 */
export async function acceptLinkTx(
  tx: Tx,
  args: { token: string; deviceHash: string; name?: string | null; now?: Date },
): Promise<AcceptResult> {
  const now = args.now ?? new Date();
  const row = await findLink(tx, args.token);
  const status = statusOf(row);
  if (status !== "ok" || !row) return { ok: false, error: status === "ok" ? "invalid" : status };
  if (row.boundDeviceHash !== args.deviceHash) return { ok: false, error: "other_device" };
  if (row.memberStatus !== "invited" && row.memberStatus !== "active" && row.memberStatus !== "not_attending") {
    return { ok: false, error: "removed" };
  }
  let name: string | null = null;
  if (args.name != null && args.name.trim() !== row.displayName) {
    name = cleanName(args.name);
    if (!name) return { ok: false, error: "bad_name" };
  }
  if (row.memberStatus === "invited") {
    const joined = await tx
      .update(members)
      .set({ status: "active", joinedAt: now, ...(name ? { displayName: name } : {}) })
      .where(and(eq(members.id, row.memberId), eq(members.status, "invited")))
      .returning({ id: members.id });
    if (joined.length > 0) {
      await tx.insert(auditLog).values({
        tripId: row.tripId,
        actorMemberId: row.memberId,
        action: "member.accepted_invite",
        entity: "member",
        entityId: row.memberId,
        data: { via: "personal_link", renamed: !!name },
      });
    }
  } else if (name) {
    await tx.update(members).set({ displayName: name }).where(eq(members.id, row.memberId));
  }
  await tx
    .update(memberLinks)
    .set({ nameConfirmedAt: now })
    .where(and(eq(memberLinks.id, row.linkId), isNull(memberLinks.nameConfirmedAt)));
  return { ok: true, tripId: row.tripId, memberId: row.memberId, linkId: row.linkId };
}

/**
 * Q37 "Not me": this person isn't the invitee. Nothing joins; the link is released from this
 * device so the real invitee can still open it on theirs. Only before anyone has accepted on it.
 */
export async function declineLinkTx(tx: Tx, args: { token: string; deviceHash: string }): Promise<boolean> {
  const row = await findLink(tx, args.token);
  if (!row || statusOf(row) !== "ok" || row.boundDeviceHash !== args.deviceHash || row.nameConfirmedAt) return false;
  await tx
    .update(memberLinks)
    .set({ boundDeviceHash: null })
    .where(and(eq(memberLinks.id, row.linkId), eq(memberLinks.boundDeviceHash, args.deviceHash)));
  await tx.insert(auditLog).values({
    tripId: row.tripId,
    actorMemberId: row.memberId,
    action: "link.not_me",
    entity: "member_link",
    entityId: row.linkId,
  });
  return true;
}

/** The device id cookie (created on first POST). */
async function deviceHash(): Promise<string> {
  const jar = await cookies();
  let deviceId = jar.get(COOKIE.device)?.value;
  if (!deviceId || !/^[A-Za-z0-9_-]{32,64}$/.test(deviceId)) {
    deviceId = randomToken(24);
    jar.set(COOKIE.device, deviceId, cookieOptions(DEVICE_COOKIE_TTL));
  }
  return hashDeviceId(deviceId);
}

export type RedeemResult =
  | { ok: true; tripId: string; redirectTo: string }
  | { ok: true; confirm: LinkStep; preview: LinkPreview }
  | { ok: false; error: Exclude<LinkStatus, "ok"> | "other_device" };

/**
 * Open a personal link on this device (FR-5). Call only from a Server Action / POST handler.
 * Grants the view + vote session only when no confirmation is needed (Q1, Q37).
 */
export async function redeemPersonalLink(token: string): Promise<RedeemResult> {
  if (!isWellFormedLinkToken(token)) return { ok: false, error: "invalid" };
  const hash = await deviceHash();
  const db = await getDb();
  const r = await asService(db, (tx) => openLinkTx(tx, token, hash));
  if (!r.ok) return r;
  if (r.kind === "confirm") return { ok: true, confirm: r.step, preview: r.preview };
  await addLinkGrant({ memberId: r.memberId, tripId: r.tripId, linkId: r.linkId });
  return { ok: true, tripId: r.tripId, redirectTo: routes.trip(r.tripId) };
}

/** Q37/Q1: "Accept invitation" or "That's me". POST only. */
export async function acceptPersonalLink(
  token: string,
  name: string | null,
): Promise<{ ok: true; tripId: string; redirectTo: string } | { ok: false; error: Exclude<AcceptResult, { ok: true }>["error"] }> {
  if (!isWellFormedLinkToken(token)) return { ok: false, error: "invalid" };
  const hash = await deviceHash();
  const db = await getDb();
  const r = await asService(db, (tx) => acceptLinkTx(tx, { token, deviceHash: hash, name }));
  if (!r.ok) return r;
  await addLinkGrant({ memberId: r.memberId, tripId: r.tripId, linkId: r.linkId });
  return { ok: true, tripId: r.tripId, redirectTo: routes.trip(r.tripId) };
}

/** Q37: "Not me". POST only. */
export async function declinePersonalLink(token: string): Promise<boolean> {
  if (!isWellFormedLinkToken(token)) return false;
  const hash = await deviceHash();
  const db = await getDb();
  return asService(db, (tx) => declineLinkTx(tx, { token, deviceHash: hash }));
}
