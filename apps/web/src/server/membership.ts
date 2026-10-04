/**
 * Joining and roles (REQUIREMENTS §6.1 FR-2..FR-11, FR-15, FR-17; §6.10 FR-T3..T5;
 * edge cases J-7, J-8, J-9, J-10, J-17, J-20, M-1..M-4, M-11, M-12).
 *
 * Authorization: organizer actions first read the caller's member row *as the caller*
 * (`withSession`, so RLS decides membership), then check the rule with `can()` from
 * @wandr/core. Writes run as the caller wherever RLS has a client grant for them; the rest
 * (pending requests, group link nonces, balance resolution, leaving) run as the service after
 * that explicit check. Phone numbers never leave this module except as the last 4 digits (J-20).
 */
import { createHmac } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  asService,
  auditLog,
  expenseAdjustments,
  expenses,
  expensePayers,
  expenseShares,
  ideas,
  memberContacts,
  members,
  payments,
  planItems,
  polls,
  smsOpenQuestions,
  trips,
  users,
  votes,
  withSession,
  type Claims,
  type Db,
  type Tx,
} from "@wandr/db";
import {
  can,
  canRestore,
  decideGroupJoin,
  deleteConfirmationMatches,
  isGroupLinkPaused,
  isPendingExpired,
  JOIN_LIMITS,
  lastSizeTransition,
  managedMemberActors,
  money,
  noticeBeforeGrowingFromSolo,
  openBalancesFor,
  pendingSizeNotices,
  pickSuccessor,
  planAccountDeletion,
  planBalanceResolution,
  shouldPauseAfterRequest,
  tripSize,
  type AccountTrip,
  type ActivityEvent,
  type BalanceResolution,
  type MemberRole,
  type MemberStatus,
  type SizeNoticeId,
  type TripDeletionPreview,
  type TripSize,
} from "@wandr/core";
import { randomToken, sha256Hex } from "@/lib/auth/crypto";
import { isWellFormedLinkToken } from "@/lib/auth/link-token";
import { revokeLinksForMembers } from "@/lib/auth/personal-link";
import { sessionSecret } from "@/lib/auth/secret";
import { appUrl } from "@/lib/env";

const DAY = 24 * 60 * 60 * 1000;

export class MembershipError extends Error {
  constructor(
    public readonly code:
      | "not_allowed"
      | "not_found"
      | "owner_cannot_leave"
      | "confirmation_mismatch"
      | "resolve_balance_first"
      | "bad_target"
      | "no_anchor_expense"
      | "expired"
      | "invalid",
  ) {
    super(code);
    this.name = "MembershipError";
  }
}

type MeRow = { id: string; role: MemberRole; status: MemberStatus };

/** The caller's member row, read as the caller (RLS). */
async function myMember(db: Db, userId: string, tripId: string): Promise<MeRow | null> {
  return withSession(db, { sub: userId }, async (tx) => {
    const [me] = await tx
      .select({ id: members.id, role: members.role, status: members.status })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);
    return me ?? null;
  });
}

async function requireOrganizer(db: Db, userId: string, tripId: string): Promise<MeRow> {
  const me = await myMember(db, userId, tripId);
  if (!me || !can({ memberId: me.id, role: me.role, status: me.status, scope: "full" }, "approve_join").allowed) {
    throw new MembershipError("not_allowed");
  }
  return me;
}

async function activeCount(tx: Tx, tripId: string): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.tripId, tripId), eq(members.status, "active")));
  return r?.n ?? 0;
}

const last4 = (phone: string | null | undefined) => (phone ? phone.replace(/\D/g, "").slice(-4) : null);

// ---------------------------------------------------------------------------
// Group link (FR-6, FR-7, FR-10, J-7)
// ---------------------------------------------------------------------------

/**
 * The link token is an HMAC of (trip, nonce) with the server secret, so organizers can get the
 * same link again without storing it: only its sha256 lives in `trips.group_link_hash`, and the
 * nonce is recorded on the `group_link.created` audit entry (useless without the secret).
 * Regenerating (FR-10) writes a new nonce and hash, which turns the old link off.
 */
function groupToken(tripId: string, nonce: string): string {
  return createHmac("sha256", sessionSecret()).update(`group-link:${tripId}:${nonce}`).digest("base64url");
}

export const groupLinkUrl = (token: string) => `${appUrl()}/j/${token}`;

export type GroupLinkInfo = { url: string | null; inviteListOnly: boolean; outsiderName: string | null; paused: boolean };

export async function getGroupLink(db: Db, userId: string, tripId: string): Promise<GroupLinkInfo> {
  await requireOrganizer(db, userId, tripId);
  return asService(db, async (tx) => {
    const [trip] = await tx
      .select({ hash: trips.groupLinkHash, inviteListOnly: trips.inviteListOnly, outsiderName: trips.outsiderName })
      .from(trips)
      .where(eq(trips.id, tripId));
    if (!trip) throw new MembershipError("not_found");
    const [latest] = await tx
      .select({ action: auditLog.action, data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.tripId, tripId), eq(auditLog.action, "group_link.created")))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    let url: string | null = null;
    const nonce = (latest?.data as { nonce?: string } | null)?.nonce;
    if (trip.hash && nonce) {
      const token = groupToken(tripId, nonce);
      if (sha256Hex(token) === trip.hash) url = groupLinkUrl(token);
    }
    return {
      url,
      inviteListOnly: trip.inviteListOnly,
      outsiderName: trip.outsiderName,
      paused: await linkPausedNow(tx, tripId, !!trip.hash),
    };
  });
}

/**
 * J-7 / JR5: paused while open requests are at the cap; it turns back on by itself once the
 * organizer handles requests (or they expire) below the cap. Links paused by the old rule (hash
 * cleared) stay off until the organizer makes a new one.
 */
async function linkPausedNow(tx: Tx, tripId: string, hasLink: boolean, now = new Date()): Promise<boolean> {
  if (!hasLink) {
    const [last] = await tx
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.tripId, tripId), inArray(auditLog.action, ["group_link.created", "group_link.auto_paused"])))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    return last?.action === "group_link.auto_paused";
  }
  return isGroupLinkPaused(await openPendingCount(tx, tripId, now));
}

/** Create the group link, or replace it (FR-10: the old one stops working). */
export async function regenerateGroupLink(db: Db, userId: string, tripId: string): Promise<string> {
  const me = await requireOrganizer(db, userId, tripId);
  const nonce = randomToken(16);
  const token = groupToken(tripId, nonce);
  await asService(db, async (tx) => {
    await tx.update(trips).set({ groupLinkHash: sha256Hex(token) }).where(eq(trips.id, tripId));
    await tx.insert(auditLog).values({
      tripId,
      actorMemberId: me.id,
      action: "group_link.created",
      entity: "trip",
      entityId: tripId,
      data: { nonce },
    });
  });
  return groupLinkUrl(token);
}

/** Organizer settings (FR-7 invite-list-only, J-7 name shown to outsiders). Runs as the caller. */
export async function updateJoinSettings(
  db: Db,
  userId: string,
  tripId: string,
  patch: { inviteListOnly?: boolean; outsiderName?: string | null },
): Promise<void> {
  await requireOrganizer(db, userId, tripId);
  const set: Partial<typeof trips.$inferInsert> = {};
  if (patch.inviteListOnly !== undefined) set.inviteListOnly = patch.inviteListOnly;
  if (patch.outsiderName !== undefined) set.outsiderName = patch.outsiderName?.trim().slice(0, 60) || null;
  if (Object.keys(set).length === 0) return;
  await withSession(db, { sub: userId }, (tx) => tx.update(trips).set(set).where(eq(trips.id, tripId)));
}

type LinkedTrip = { tripId: string; displayName: string; inviteListOnly: boolean };

async function tripForToken(tx: Tx, token: string): Promise<LinkedTrip | null> {
  if (!isWellFormedLinkToken(token)) return null;
  const [t] = await tx
    .select({ tripId: trips.id, name: trips.name, outsider: trips.outsiderName, inviteListOnly: trips.inviteListOnly })
    .from(trips)
    .where(and(eq(trips.groupLinkHash, sha256Hex(token)), isNull(trips.deletedAt))) // JR3
    .limit(1);
  if (!t) return null;
  return { tripId: t.tripId, displayName: t.outsider?.trim() || t.name, inviteListOnly: t.inviteListOnly };
}

/** GET /j/[token]: only the name shown to outsiders (J-7), and whether it's paused (JR5). Changes nothing. */
export async function inspectGroupLink(
  db: Db,
  token: string,
): Promise<{ tripId: string; tripName: string; paused: boolean } | null> {
  return asService(db, async (tx) => {
    const t = await tripForToken(tx, token);
    if (!t) return null;
    return {
      tripId: t.tripId,
      tripName: t.displayName,
      paused: isGroupLinkPaused(await openPendingCount(tx, t.tripId, new Date())),
    };
  });
}

export type JoinOutcome =
  | { kind: "joined"; tripId: string }
  | { kind: "confirm_name"; memberId: string; expectedName: string }
  | { kind: "pending"; tripId: string; memberId: string; paused: boolean }
  | { kind: "already_pending" }
  | { kind: "ask_organizer" }
  | { kind: "link_off" };

async function verifiedContact(tx: Tx, userId: string) {
  const [u] = await tx
    .select({ phone: users.phone, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId));
  if (!u || (!u.phone && !u.email)) throw new MembershipError("not_allowed"); // provisional users can't join
  return u;
}

/** Invite-list rows in a trip whose phone/email matches the verified contact. */
async function inviteMatches(tx: Tx, tripId: string, contact: { phone: string | null; email: string | null }) {
  const byContact = or(
    contact.phone ? eq(memberContacts.phone, contact.phone) : sql`false`,
    contact.email ? eq(memberContacts.email, contact.email) : sql`false`,
  );
  return tx
    .select({ id: members.id, displayName: members.displayName, userId: members.userId })
    .from(members)
    .innerJoin(memberContacts, eq(memberContacts.memberId, members.id))
    .where(and(eq(members.tripId, tripId), eq(members.status, "invited"), byContact));
}

/** Open (unexpired) join requests (J-7). JR6: the only limit on the group link. */
async function openPendingCount(tx: Tx, tripId: string, now: Date): Promise<number> {
  const [p] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(members)
    .where(
      and(
        eq(members.tripId, tripId),
        eq(members.status, "pending"),
        gte(members.createdAt, new Date(now.getTime() - JOIN_LIMITS.pendingTtlDays * DAY)),
      ),
    );
  return p?.n ?? 0;
}

/**
 * Insert a pending request (or refresh an expired one). At the cap the link pauses itself (J-7);
 * it isn't turned off, so it resumes once requests are handled (JR5). The pause is recorded once
 * for the organizer banner (JR12).
 */
async function createRequest(
  tx: Tx,
  args: { tripId: string; userId: string; name: string; now: Date; reuseMemberId?: string; mismatchFor?: string },
): Promise<{ memberId: string; paused: boolean }> {
  let memberId: string;
  if (args.reuseMemberId) {
    await tx
      .update(members)
      .set({ createdAt: args.now, displayName: args.name })
      .where(eq(members.id, args.reuseMemberId));
    memberId = args.reuseMemberId;
  } else {
    const [m] = await tx
      .insert(members)
      .values({ tripId: args.tripId, userId: args.userId, displayName: args.name, status: "pending", role: "member" })
      .returning({ id: members.id });
    memberId = m!.id;
  }
  await tx.insert(auditLog).values({
    tripId: args.tripId,
    actorMemberId: memberId,
    action: "member.join_requested",
    entity: "member",
    entityId: memberId,
    data: { via: "group_link", ...(args.mismatchFor ? { notInvitee: args.mismatchFor } : {}) },
  });
  const openPending = await openPendingCount(tx, args.tripId, args.now);
  if (shouldPauseAfterRequest(openPending)) {
    await tx.insert(auditLog).values({
      tripId: args.tripId,
      action: "group_link.auto_paused",
      entity: "trip",
      entityId: args.tripId,
      data: { openPending },
    });
  }
  return { memberId, paused: isGroupLinkPaused(openPending) };
}

function cleanName(input: string): string | null {
  const name = input.normalize("NFKC").replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 40 ? name : null;
}

/**
 * A verified person used the group link (FR-6). Call only after their code is verified; the
 * outcome is the first place the invite list is consulted (J-17). `ageConfirmed` is FR-17.
 */
export async function joinViaGroupLink(
  db: Db,
  args: { userId: string; token: string; name: string; ageConfirmed: boolean; now?: Date },
): Promise<JoinOutcome> {
  const now = args.now ?? new Date();
  const name = cleanName(args.name);
  if (!name || !args.ageConfirmed) throw new MembershipError("invalid");
  return asService(db, async (tx) => {
    const trip = await tripForToken(tx, args.token);
    if (!trip) return { kind: "link_off" } as const;
    const contact = await verifiedContact(tx, args.userId);
    if (!contact.displayName.trim()) {
      await tx.update(users).set({ displayName: name }).where(eq(users.id, args.userId));
    }
    const [existing] = await tx
      .select({ id: members.id, status: members.status, createdAt: members.createdAt, displayName: members.displayName })
      .from(members)
      .where(and(eq(members.tripId, trip.tripId), eq(members.userId, args.userId)))
      .limit(1);
    const matches = await inviteMatches(tx, trip.tripId, contact);
    const match = existing?.status === "invited" ? { id: existing.id, displayName: existing.displayName } : matches[0];
    const expiredPending = existing?.status === "pending" && isPendingExpired(existing.createdAt, now);
    const decision = decideGroupJoin({
      linkActive: true,
      inviteListOnly: trip.inviteListOnly,
      existing: existing && !expiredPending ? { status: existing.status } : null,
      invitedMatch: match ? { memberId: match.id, displayName: match.displayName } : null,
      openPending: await openPendingCount(tx, trip.tripId, now),
    });
    await tx.insert(auditLog).values({
      tripId: trip.tripId,
      action: "member.age_attested", // FR-17
      entity: "user",
      entityId: args.userId,
      data: { minimumAge: JOIN_LIMITS.minimumAge },
    });
    switch (decision.kind) {
      case "already_member":
        return { kind: "joined", tripId: trip.tripId } as const;
      case "confirm_name":
        return { kind: "confirm_name", memberId: decision.memberId, expectedName: decision.expectedName } as const;
      case "request": {
        const r = await createRequest(tx, {
          tripId: trip.tripId,
          userId: args.userId,
          name,
          now,
          reuseMemberId: expiredPending ? existing!.id : undefined,
        });
        return { kind: "pending", tripId: trip.tripId, memberId: r.memberId, paused: r.paused } as const;
      }
      default:
        return decision;
    }
  });
}

/**
 * J-8 name check: "Are you Jess?". Yes joins as that invitee; No turns this into a pending
 * request under the name they typed (the invite was probably a typo).
 */
export async function confirmInviteName(
  db: Db,
  args: { userId: string; token: string; memberId: string; isMe: boolean; name: string; now?: Date },
): Promise<JoinOutcome> {
  const now = args.now ?? new Date();
  return asService(db, async (tx) => {
    const trip = await tripForToken(tx, args.token);
    if (!trip) return { kind: "link_off" } as const;
    const contact = await verifiedContact(tx, args.userId);
    const matches = await inviteMatches(tx, trip.tripId, contact);
    const match = matches.find((m) => m.id === args.memberId);
    if (!match) throw new MembershipError("not_found");
    const [mine] = await tx
      .select({ id: members.id, status: members.status })
      .from(members)
      .where(and(eq(members.tripId, trip.tripId), eq(members.userId, args.userId)))
      .limit(1);
    if (mine && mine.id !== match.id) {
      return mine.status === "active" ? ({ kind: "joined", tripId: trip.tripId } as const) : ({ kind: "already_pending" } as const);
    }
    if (args.isMe) {
      // D67/C-JR8: the invitee's own spelling wins over the organizer's invite-list name.
      const typed = cleanName(args.name);
      await tx
        .update(members)
        .set({ userId: args.userId, status: "active", joinedAt: now, ...(typed ? { displayName: typed } : {}) })
        .where(and(eq(members.id, match.id), eq(members.status, "invited")));
      await tx.insert(auditLog).values({
        tripId: trip.tripId,
        actorMemberId: match.id,
        action: "member.joined_via_group_link",
        entity: "member",
        entityId: match.id,
      });
      return { kind: "joined", tripId: trip.tripId } as const;
    }
    const name = cleanName(args.name) ?? "Guest";
    if (trip.inviteListOnly) return { kind: "ask_organizer" } as const;
    const decision = decideGroupJoin({
      linkActive: true,
      inviteListOnly: false,
      existing: null,
      invitedMatch: null,
      openPending: await openPendingCount(tx, trip.tripId, now),
    });
    if (decision.kind !== "request") return decision as JoinOutcome;
    const r = await createRequest(tx, { tripId: trip.tripId, userId: args.userId, name, now, mismatchFor: match.id });
    return { kind: "pending", tripId: trip.tripId, memberId: r.memberId, paused: r.paused } as const;
  });
}

// ---------------------------------------------------------------------------
// Approvals (FR-8, J-20)
// ---------------------------------------------------------------------------

export type JoinRequest = {
  memberId: string;
  name: string;
  /** J-20: last 4 digits only. */
  last4: string | null;
  requestedAt: Date;
  /** J-8: they said they aren't this invitee. */
  notInviteeName: string | null;
};

export async function listJoinRequests(db: Db, userId: string, tripId: string, now = new Date()): Promise<JoinRequest[]> {
  await requireOrganizer(db, userId, tripId);
  return asService(db, async (tx) => {
    const rows = await tx
      .select({ id: members.id, name: members.displayName, createdAt: members.createdAt, phone: users.phone })
      .from(members)
      .leftJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.tripId, tripId), eq(members.status, "pending")))
      .orderBy(asc(members.createdAt));
    const open = rows.filter((r) => !isPendingExpired(r.createdAt, now));
    if (open.length === 0) return [];
    const notes = await tx
      .select({ entityId: auditLog.entityId, data: auditLog.data })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tripId, tripId),
          eq(auditLog.action, "member.join_requested"),
          inArray(
            auditLog.entityId,
            open.map((r) => r.id),
          ),
        ),
      );
    const notInvitee = new Map<string, string>();
    for (const n of notes) {
      const id = (n.data as { notInvitee?: string } | null)?.notInvitee;
      if (id && n.entityId) notInvitee.set(n.entityId, id);
    }
    const inviteeIds = [...new Set(notInvitee.values())];
    const invitees = inviteeIds.length
      ? await tx.select({ id: members.id, name: members.displayName }).from(members).where(inArray(members.id, inviteeIds))
      : [];
    const nameOf = new Map(invitees.map((i) => [i.id, i.name]));
    return open.map((r) => ({
      memberId: r.id,
      name: r.name,
      last4: last4(r.phone),
      requestedAt: r.createdAt,
      notInviteeName: nameOf.get(notInvitee.get(r.id) ?? "") ?? null,
    }));
  });
}

/**
 * One-tap approve / deny (FR-8). The organizer check runs as the caller; the write runs as the
 * service because `joined_at` has no client grant.
 */
export async function decideJoinRequest(
  db: Db,
  args: { userId: string; tripId: string; memberId: string; approve: boolean; now?: Date },
): Promise<{ sizeBefore: TripSize; sizeAfter: TripSize }> {
  const now = args.now ?? new Date();
  const me = await requireOrganizer(db, args.userId, args.tripId);
  const r = await asService(db, async (tx) => {
    const [target] = await tx
      .select({ id: members.id, createdAt: members.createdAt })
      .from(members)
      .where(and(eq(members.id, args.memberId), eq(members.tripId, args.tripId), eq(members.status, "pending")));
    if (!target) throw new MembershipError("not_found");
    if (args.approve && isPendingExpired(target.createdAt, now)) throw new MembershipError("expired");
    const before = tripSize(await activeCount(tx, args.tripId));
    await tx
      .update(members)
      .set(args.approve ? { status: "active", joinedAt: now } : { status: "removed", removedAt: now })
      .where(eq(members.id, target.id));
    const after = tripSize(await activeCount(tx, args.tripId));
    return { sizeBefore: before, sizeAfter: after };
  });
  await asService(db, async (tx) => {
      await tx.insert(auditLog).values({
        tripId: args.tripId,
        actorMemberId: me.id,
        action: args.approve ? "member.approved" : "member.denied",
        entity: "member",
        entityId: args.memberId,
        data: { via: "web" },
      });
      // The organizers' open Y/N question about this request is now moot.
      await tx
        .delete(smsOpenQuestions)
        .where(
          and(
            eq(smsOpenQuestions.kind, "approve_join"),
            sql`${smsOpenQuestions.payload}->>'pendingMemberId' = ${args.memberId}`,
          ),
        );
  });
  return r;
}

/**
 * After a verified code: link `members.user_id` on joined rows (active / not attending, or removed
 * so they reach the money-only view, FR-9/M-1) whose invite contact matches the verified phone or
 * email, so a guest who later signs in keeps their
 * membership and their personal-link session becomes a full one. Skips trips where the user
 * already has a member row. Invited (not yet joined) rows are left for the J-8 name check.
 */
export async function attachVerifiedIdentity(tx: Tx, userId: string): Promise<number> {
  const contact = await verifiedContact(tx, userId).catch(() => null);
  if (!contact) return 0;
  const byContact = or(
    contact.phone ? eq(memberContacts.phone, contact.phone) : sql`false`,
    contact.email ? eq(memberContacts.email, contact.email) : sql`false`,
  );
  const candidates = await tx
    .select({ id: members.id, tripId: members.tripId })
    .from(members)
    .innerJoin(memberContacts, eq(memberContacts.memberId, members.id))
    .where(and(isNull(members.userId), inArray(members.status, ["active", "not_attending", "removed"]), byContact));
  if (candidates.length === 0) return 0;
  const mine = await tx
    .select({ tripId: members.tripId })
    .from(members)
    .where(eq(members.userId, userId));
  const taken = new Set(mine.map((m) => m.tripId));
  let n = 0;
  for (const c of candidates) {
    if (taken.has(c.tripId)) continue;
    taken.add(c.tripId);
    await tx.update(members).set({ userId }).where(and(eq(members.id, c.id), isNull(members.userId)));
    await tx.insert(auditLog).values({
      tripId: c.tripId,
      actorMemberId: c.id,
      action: "member.identity_attached",
      entity: "member",
      entityId: c.id,
    });
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Roles (FR-2, FR-3, D34, §6.10 duo)
// ---------------------------------------------------------------------------

export async function setOrganizer(
  db: Db,
  args: { userId: string; tripId: string; memberId: string; organizer: boolean },
): Promise<void> {
  await withSession(db, { sub: args.userId }, async (tx) => {
    const rows = await tx
      .select({
        id: members.id,
        userId: members.userId,
        role: members.role,
        status: members.status,
        managedBy: members.managedByMemberId,
      })
      .from(members)
      .where(and(eq(members.tripId, args.tripId), or(eq(members.userId, args.userId), eq(members.id, args.memberId))));
    const me = rows.find((r) => r.userId === args.userId);
    const target = rows.find((r) => r.id === args.memberId);
    if (!me || !target) throw new MembershipError("not_found");
    const d = can({ memberId: me.id, role: me.role, status: me.status, scope: "full" }, "change_role", {
      target: { memberId: target.id, role: target.role },
    });
    if (!d.allowed) throw new MembershipError("not_allowed");
    // Managed members can't sign in, so they can't organize (FR-11).
    if (target.status !== "active" || target.managedBy) throw new MembershipError("bad_target");
    await tx
      .update(members)
      .set({ role: args.organizer ? "organizer" : "member" })
      .where(eq(members.id, target.id));
  });
}

/** FR-2: owner only; the DB function moves the role atomically. */
export async function transferOwnership(db: Db, args: { userId: string; tripId: string; toMemberId: string }) {
  await withSession(db, { sub: args.userId }, (tx) =>
    tx.execute(sql`select app.transfer_ownership(${args.tripId}::uuid, ${args.toMemberId}::uuid)`),
  ).catch((e: unknown) => {
    const msg = e instanceof Error ? `${e.message} ${(e as { cause?: Error }).cause?.message ?? ""}` : "";
    throw new MembershipError(/only the owner/.test(msg) ? "not_allowed" : "bad_target");
  });
}

/** Members the owner can hand the trip to: active, verified, not managed (FR-2). Owner only. */
export async function ownershipCandidates(db: Db, userId: string, tripId: string): Promise<{ id: string; displayName: string }[]> {
  const me = await myMember(db, userId, tripId);
  if (!me || me.role !== "owner") return [];
  return withSession(db, { sub: userId }, (tx) =>
    tx
      .select({ id: members.id, displayName: members.displayName })
      .from(members)
      .where(
        and(
          eq(members.tripId, tripId),
          eq(members.status, "active"),
          ne(members.id, me.id),
          isNull(members.managedByMemberId),
          sql`${members.userId} is not null`,
        ),
      )
      .orderBy(asc(members.createdAt)),
  );
}

type SuccessionRow = {
  memberId: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: Date;
  managedByMemberId: string | null;
  verified: boolean;
};

async function successionPool(tx: Tx, tripId: string): Promise<SuccessionRow[]> {
  const rows = await tx
    .select({
      memberId: members.id,
      role: members.role,
      status: members.status,
      joinedAt: members.joinedAt,
      createdAt: members.createdAt,
      managedByMemberId: members.managedByMemberId,
      userId: members.userId,
    })
    .from(members)
    .where(eq(members.tripId, tripId));
  return rows.map((r) => ({
    memberId: r.memberId,
    role: r.role,
    status: r.status,
    joinedAt: r.joinedAt ?? r.createdAt,
    managedByMemberId: r.managedByMemberId,
    verified: !!r.userId,
  }));
}

/** Who becomes owner if the owner leaves without choosing (FR-3). Owner only. */
export async function defaultSuccessor(db: Db, userId: string, tripId: string): Promise<{ memberId: string; name: string } | null> {
  const me = await myMember(db, userId, tripId);
  if (!me || me.role !== "owner") return null;
  return asService(db, async (tx) => {
    const pool = (await successionPool(tx, tripId)).filter((m) => m.verified);
    const id = pickSuccessor(pool, me.id);
    if (!id) return null;
    const [m] = await tx.select({ name: members.displayName }).from(members).where(eq(members.id, id));
    return { memberId: id, name: m!.name };
  });
}

/**
 * Every trip the user has a member row in (live trips only), shaped for the account-deletion
 * plan (FR-3, J-11). Service read: the caller must already be authenticated as `userId`.
 */
export async function loadAccountTrips(tx: Tx, userId: string): Promise<AccountTrip[]> {
  const mine = await tx
    .select({ id: members.id, tripId: members.tripId, role: members.role, status: members.status, tripName: trips.name })
    .from(members)
    .innerJoin(trips, eq(trips.id, members.tripId))
    .where(and(eq(members.userId, userId), isNull(trips.deletedAt)))
    .orderBy(asc(trips.createdAt));
  const out: AccountTrip[] = [];
  for (const m of mine) {
    const rows = await tx
      .select({
        memberId: members.id,
        role: members.role,
        status: members.status,
        joinedAt: members.joinedAt,
        createdAt: members.createdAt,
        managedByMemberId: members.managedByMemberId,
        userId: members.userId,
        displayName: members.displayName,
      })
      .from(members)
      .where(eq(members.tripId, m.tripId));
    out.push({
      tripId: m.tripId,
      tripName: m.tripName,
      myMemberId: m.id,
      myRole: m.role,
      myStatus: m.status,
      members: rows.map((r) => ({
        memberId: r.memberId,
        role: r.role,
        status: r.status,
        joinedAt: r.joinedAt ?? r.createdAt,
        managedByMemberId: r.managedByMemberId,
        verified: !!r.userId,
        displayName: r.displayName,
      })),
    });
  }
  return out;
}

/** FR-2/FR-3: move the owner role (demote first: one owner per trip). */
export async function handOverOwnership(tx: Tx, args: { tripId: string; fromMemberId: string; toMemberId: string; picked: boolean }) {
  await tx.update(members).set({ role: "member" }).where(eq(members.id, args.fromMemberId));
  await tx.update(members).set({ role: "owner" }).where(eq(members.id, args.toMemberId));
  await tx.insert(auditLog).values({
    tripId: args.tripId,
    actorMemberId: args.fromMemberId,
    action: "member.owner_succession",
    entity: "member",
    entityId: args.toMemberId,
    data: { from: args.fromMemberId, picked: args.picked },
  });
}

/**
 * FR-3 / J-11: when a user deletes their account, every trip they own gets a new owner: the
 * successor they picked (`picks[tripId]`), else the longest-standing organizer, else the
 * longest-tenured active member (verified people first; @wandr/core planAccountDeletion).
 * Their own membership in those trips ends ("former member"). Trips with nobody else are
 * returned with `successorMemberId: null` for the account-deletion flow to handle.
 * Service-level: the caller must already be authenticated as `userId` and have confirmed.
 */
export async function ownerSuccessionOnAccountDeletion(
  db: Db,
  userId: string,
  picks: Record<string, string> = {},
  now = new Date(),
): Promise<{ tripId: string; successorMemberId: string | null }[]> {
  return asService(db, async (tx) => {
    const owned = (await loadAccountTrips(tx, userId)).filter((t) => t.myRole === "owner" && t.myStatus === "active");
    const out: { tripId: string; successorMemberId: string | null }[] = [];
    for (const plan of planAccountDeletion(owned, picks)) {
      if (plan.kind !== "hand_over") {
        out.push({ tripId: plan.tripId, successorMemberId: null });
        continue;
      }
      await handOverOwnership(tx, { tripId: plan.tripId, fromMemberId: plan.myMemberId, toMemberId: plan.successorMemberId, picked: plan.picked });
      await tx.update(members).set({ status: "removed", removedAt: now }).where(eq(members.id, plan.myMemberId));
      out.push({ tripId: plan.tripId, successorMemberId: plan.successorMemberId });
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Balances, removal, leaving, restoring (FR-9, D24, M-1..M-4, M-11, M-12)
// ---------------------------------------------------------------------------

/** All-currency balances for a trip (service read: money must be complete, FR-70). */
export async function tripBalances(tx: Tx, tripId: string): Promise<money.Balances> {
  // Personal-only expenses (Q23c) never touch group balances.
  const exp = await tx
    .select({ id: expenses.id, currency: expenses.currency, total: expenses.totalMinor, payer: expenses.paidByMemberId })
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt), isNull(expenses.personalMemberId)));
  const ids = exp.map((e) => e.id);
  const shares = ids.length
    ? await tx.select().from(expenseShares).where(inArray(expenseShares.expenseId, ids))
    : [];
  // Q23a: several payers per bill.
  const payerRows = ids.length ? await tx.select().from(expensePayers).where(inArray(expensePayers.expenseId, ids)) : [];
  const payersBy = new Map<string, { memberId: string; paidMinor: number }[]>();
  for (const p of payerRows) payersBy.set(p.expenseId, [...(payersBy.get(p.expenseId) ?? []), { memberId: p.memberId, paidMinor: p.paidMinor }]);
  const adj = await tx
    .select({ memberId: expenseAdjustments.memberId, delta: expenseAdjustments.deltaMinor, currency: expenses.currency })
    .from(expenseAdjustments)
    .innerJoin(expenses, eq(expenses.id, expenseAdjustments.expenseId))
    .where(eq(expenseAdjustments.tripId, tripId));
  const pays = await tx.select().from(payments).where(eq(payments.tripId, tripId));
  const byExpense = new Map<string, { memberId: string; shareMinor: number }[]>();
  for (const s of shares) {
    const list = byExpense.get(s.expenseId) ?? [];
    list.push({ memberId: s.memberId, shareMinor: s.shareMinor });
    byExpense.set(s.expenseId, list);
  }
  return money.computeBalances({
    expenses: exp.map((e) => ({
      id: e.id,
      currency: e.currency,
      totalMinor: e.total,
      payerId: e.payer,
      ...(payersBy.get(e.id) ? { payers: payersBy.get(e.id)! } : {}),
      shares: byExpense.get(e.id) ?? [],
    })),
    adjustments: adj.map((a) => ({ memberId: a.memberId, currency: a.currency, deltaMinor: a.delta })),
    payments: pays.map((p) => ({
      fromMemberId: p.fromMemberId,
      toMemberId: p.toMemberId,
      currency: p.currency,
      amountMinor: p.amountMinor,
    })),
  });
}

export type OpenBalance = { currency: string; balanceMinor: number };

/**
 * The member's non-zero balances (positive = they're owed). Organizers or the member themselves.
 * JR10 (founder decision 2026-10-02: "the organizer should have a view into everything"): this
 * is a service read, so the totals an organizer sees during removal include surprise expenses
 * hidden from them (FR-91). Only totals leave here, never the hidden expenses themselves.
 */
export async function balanceFor(db: Db, userId: string, tripId: string, memberId: string): Promise<OpenBalance[]> {
  const me = await myMember(db, userId, tripId);
  if (!me || (me.id !== memberId && me.role === "member")) throw new MembershipError("not_allowed");
  return asService(db, async (tx) => openBalancesFor(await tripBalances(tx, tripId), memberId));
}

/** Write the resolution as adjustment entries, anchored to an expense in each currency (FR-69). */
async function writeResolution(
  tx: Tx,
  args: { tripId: string; leaverId: string; actorId: string; resolution: BalanceResolution },
): Promise<number> {
  const balances = await tripBalances(tx, args.tripId);
  const remaining = (
    await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, args.tripId), eq(members.status, "active"), ne(members.id, args.leaverId)))
  ).map((r) => r.id);
  let entries;
  try {
    entries = planBalanceResolution(balances, args.leaverId, args.resolution, remaining);
  } catch {
    throw new MembershipError("bad_target");
  }
  if (entries.length === 0) return 0;
  const currencies = [...new Set(entries.map((e) => e.currency))];
  for (const currency of currencies) {
    // Prefer the latest expense in this currency that involves the leaver.
    const [anchor] = await tx
      .select({ id: expenses.id })
      .from(expenses)
      .leftJoin(
        expenseShares,
        and(eq(expenseShares.expenseId, expenses.id), eq(expenseShares.memberId, args.leaverId)),
      )
      .where(and(eq(expenses.tripId, args.tripId), eq(expenses.currency, currency)))
      .orderBy(
        desc(sql`(${expenses.paidByMemberId} = ${args.leaverId} or ${expenseShares.memberId} is not null)`),
        desc(expenses.createdAt),
      )
      .limit(1);
    if (!anchor) throw new MembershipError("no_anchor_expense");
    await tx.insert(expenseAdjustments).values(
      entries
        .filter((e) => e.currency === currency)
        .map((e) => ({
          expenseId: anchor.id,
          tripId: args.tripId,
          memberId: e.memberId,
          deltaMinor: e.deltaMinor,
          reason: `member_removed:${args.resolution.kind}`,
          createdByMemberId: args.actorId,
        })),
    );
  }
  return entries.length;
}

async function endMembership(tx: Tx, args: { tripId: string; memberId: string; actorId: string; action: string; now: Date }) {
  await tx
    .update(members)
    .set({ status: "removed", removedAt: args.now })
    .where(eq(members.id, args.memberId));
  await revokeLinksForMembers(tx, [args.memberId]); // M-12
  await tx.delete(smsOpenQuestions).where(eq(smsOpenQuestions.memberId, args.memberId));
  await tx.insert(auditLog).values({
    tripId: args.tripId,
    actorMemberId: args.actorId,
    action: args.action,
    entity: "member",
    entityId: args.memberId,
  });
}

/**
 * FR-9: organizers remove anyone but the owner. With an open balance they must pass a
 * resolution (reassign / split across the group / write off), recorded as adjustments.
 * The person's history stays, shown as "former member".
 */
export async function removeMember(
  db: Db,
  args: { userId: string; tripId: string; memberId: string; resolution?: BalanceResolution; now?: Date },
): Promise<void> {
  const now = args.now ?? new Date();
  const me = await myMember(db, args.userId, args.tripId);
  if (!me) throw new MembershipError("not_allowed");
  await asService(db, async (tx) => {
    const [target] = await tx
      .select({ id: members.id, role: members.role, status: members.status })
      .from(members)
      .where(and(eq(members.id, args.memberId), eq(members.tripId, args.tripId)));
    if (!target || !["active", "not_attending", "invited"].includes(target.status)) throw new MembershipError("not_found");
    const open = openBalancesFor(await tripBalances(tx, args.tripId), target.id);
    const d = can({ memberId: me.id, role: me.role, status: me.status, scope: "full" }, "remove_member", {
      target: { memberId: target.id, role: target.role },
      targetHasOpenBalance: open.length > 0 && !args.resolution,
    });
    if (!d.allowed) {
      throw new MembershipError(d.reason === "resolve_balance_first" ? "resolve_balance_first" : "not_allowed");
    }
    if (open.length > 0 && args.resolution) {
      await writeResolution(tx, { tripId: args.tripId, leaverId: target.id, actorId: me.id, resolution: args.resolution });
    }
    await endMembership(tx, { tripId: args.tripId, memberId: target.id, actorId: me.id, action: "member.removed", now });
  });
}

// ---------------------------------------------------------------------------
// Deleting a trip (JR3, J-10, NFR-5, NFR-7)
// ---------------------------------------------------------------------------

async function requireOwner(db: Db, userId: string, tripId: string): Promise<MeRow> {
  const me = await myMember(db, userId, tripId);
  if (!me || !can({ memberId: me.id, role: me.role, status: me.status, scope: "full" }, "delete_trip").allowed) {
    throw new MembershipError("not_allowed");
  }
  return me;
}

/** JR3: what deleting the trip takes away, for the confirmation screen. Owner only. */
export async function tripDeletionPreview(db: Db, userId: string, tripId: string): Promise<TripDeletionPreview> {
  const me = await requireOwner(db, userId, tripId);
  return asService(db, async (tx) => {
    const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId));
    return {
      tripName: trip?.name ?? "",
      otherMembers: await tx.$count(
        members,
        and(eq(members.tripId, tripId), eq(members.status, "active"), ne(members.id, me.id)),
      ),
      ideas: await tx.$count(ideas, eq(ideas.tripId, tripId)),
      votes: await tx.$count(votes, eq(votes.tripId, tripId)),
      polls: await tx.$count(polls, eq(polls.tripId, tripId)),
      planItems: await tx.$count(planItems, eq(planItems.tripId, tripId)),
      expenses: await tx.$count(expenses, and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt))),
      payments: await tx.$count(payments, eq(payments.tripId, tripId)),
    };
  });
}

/**
 * JR3: the owner deletes the whole trip, after typing its name. Soft delete: `deleted_at` hides
 * the trip and everything in it from every client (RLS, app.trip_live); nothing is destroyed, so
 * money history is preserved (NFR-5/NFR-7). Personal links stop working and open text questions
 * are dropped.
 */
export async function deleteTrip(
  db: Db,
  args: { userId: string; tripId: string; confirmation: string; now?: Date },
): Promise<void> {
  const now = args.now ?? new Date();
  const me = await requireOwner(db, args.userId, args.tripId);
  await asService(db, async (tx) => {
    const [trip] = await tx
      .select({ name: trips.name, deletedAt: trips.deletedAt })
      .from(trips)
      .where(eq(trips.id, args.tripId));
    if (!trip || trip.deletedAt) throw new MembershipError("not_found");
    if (!deleteConfirmationMatches(args.confirmation, trip.name)) throw new MembershipError("confirmation_mismatch");
    await softDeleteTripTx(tx, { tripId: args.tripId, actorId: me.id, now });
  });
}

/** JR3 soft delete, after the caller's checks. Also used when an account is deleted (FR-3). */
export async function softDeleteTripTx(tx: Tx, args: { tripId: string; actorId: string; now: Date; reason?: string }) {
  await tx.update(trips).set({ deletedAt: args.now, groupLinkHash: null }).where(eq(trips.id, args.tripId));
  const ids = (await tx.select({ id: members.id }).from(members).where(eq(members.tripId, args.tripId))).map((m) => m.id);
  await revokeLinksForMembers(tx, ids);
  if (ids.length) await tx.delete(smsOpenQuestions).where(inArray(smsOpenQuestions.memberId, ids));
  await tx.insert(auditLog).values({
    tripId: args.tripId,
    actorMemberId: args.actorId,
    action: "trip.deleted",
    entity: "trip",
    entityId: args.tripId,
    ...(args.reason ? { data: { reason: args.reason } } : {}),
  });
}

/**
 * M-4: leave a trip. The owner can't leave: they transfer ownership first, or delete the trip
 * (JR3, FR-2, J-10). An open balance is not wiped: it stays on the ledger under "former member"
 * (M-1/M-2); the UI shows it first.
 */
export async function leaveTrip(db: Db, args: { userId: string; tripId: string; now?: Date }): Promise<void> {
  const now = args.now ?? new Date();
  const me = await myMember(db, args.userId, args.tripId);
  if (!me || !["active", "not_attending"].includes(me.status)) throw new MembershipError("not_found");
  if (me.role === "owner") throw new MembershipError("owner_cannot_leave");
  await asService(db, (tx) =>
    endMembership(tx, { tripId: args.tripId, memberId: me.id, actorId: me.id, action: "member.left", now }),
  );
}

/** M-11: organizers restore a removed member within 30 days. Links stay revoked; send a new one. */
export async function restoreMember(
  db: Db,
  args: { userId: string; tripId: string; memberId: string; now?: Date },
): Promise<void> {
  const now = args.now ?? new Date();
  const me = await requireOrganizer(db, args.userId, args.tripId);
  await withSession(db, { sub: args.userId }, async (tx) => {
    const [t] = await tx
      .select({ status: members.status, removedAt: members.removedAt, joinedAt: members.joinedAt })
      .from(members)
      .where(and(eq(members.id, args.memberId), eq(members.tripId, args.tripId)));
    if (!t || !canRestore(t, now)) throw new MembershipError("expired");
    await tx.update(members).set({ status: "active", removedAt: null }).where(eq(members.id, args.memberId));
  });
  await asService(db, (tx) =>
    tx.insert(auditLog).values({
      tripId: args.tripId,
      actorMemberId: me.id,
      action: "member.restored",
      entity: "member",
      entityId: args.memberId,
    }),
  );
}

// ---------------------------------------------------------------------------
// Managed members (FR-11, J-1, FR-17)
// ---------------------------------------------------------------------------

/** A verified member adds someone with no phone by name; they act and vote for them. */
export async function addManagedMember(db: Db, args: { userId: string; tripId: string; name: string }): Promise<string> {
  const name = cleanName(args.name);
  if (!name) throw new MembershipError("invalid");
  return withSession(db, { sub: args.userId }, async (tx) => {
    const [me] = await tx
      .select({ id: members.id, status: members.status, managedBy: members.managedByMemberId })
      .from(members)
      .where(and(eq(members.tripId, args.tripId), eq(members.userId, args.userId)));
    if (!me || me.status !== "active") throw new MembershipError("not_allowed");
    const [m] = await tx
      .insert(members)
      .values({
        tripId: args.tripId,
        displayName: name,
        role: "member",
        status: "active",
        managedByMemberId: me.id,
        joinedAt: new Date(),
      })
      .returning({ id: members.id });
    return m!.id;
  });
}

// ---------------------------------------------------------------------------
// People page data
// ---------------------------------------------------------------------------

export type Person = {
  id: string;
  displayName: string;
  role: MemberRole;
  status: MemberStatus;
  /** Manager's name, or "organizers" once the manager left (JR11). Null if not managed. */
  managedByName: string | null;
  isMe: boolean;
  /** The caller acts for this person: their manager, or an organizer after the manager left (FR-11, JR11). */
  managedByMe: boolean;
};

export type PeopleView = {
  me: { memberId: string; role: MemberRole; verified: boolean };
  size: TripSize;
  people: Person[];
  invited: { id: string; displayName: string }[];
  requests: JoinRequest[];
  former: { id: string; displayName: string; canRestore: boolean }[];
  linkPaused: boolean;
  /** One-time notices to show this member now (FR-T3/T4/T5). */
  notices: SizeNoticeId[];
};

/** Everything the people page shows, as the caller (RLS hides pending/invited from members). */
export async function getPeople(db: Db, claims: Claims, tripId: string, now = new Date()): Promise<PeopleView | null> {
  const base = await withSession(db, claims, async (tx) => {
    const rows = await tx
      .select({
        id: members.id,
        userId: members.userId,
        displayName: members.displayName,
        role: members.role,
        status: members.status,
        managedBy: members.managedByMemberId,
        removedAt: members.removedAt,
        joinedAt: members.joinedAt,
        noticesSeen: members.noticesSeen,
      })
      .from(members)
      .where(eq(members.tripId, tripId))
      .orderBy(asc(members.createdAt));
    const me = rows.find((m) => (claims.sub ? m.userId === claims.sub : m.id === claims.link_member));
    if (!me || me.status !== "active") return null;
    return { rows, me };
  });
  if (!base) return null;
  const { rows, me } = base;
  const nameOf = new Map(rows.map((r) => [r.id, r.displayName]));
  const isOrganizer = me.role !== "member" && !!claims.sub;
  const active = rows.filter((r) => r.status === "active" || r.status === "not_attending");
  const size = tripSize(rows.filter((r) => r.status === "active").length);

  const requests = isOrganizer ? await listJoinRequests(db, claims.sub!, tripId, now) : [];
  const extra = await asService(db, async (tx) => {
    const [trip] = await tx.select({ hash: trips.groupLinkHash }).from(trips).where(eq(trips.id, tripId));
    return {
      linkPaused: isOrganizer ? await linkPausedNow(tx, tripId, !!trip?.hash, now) : false,
      notices: await sizeNotices(tx, tripId, me.id, me.noticesSeen),
    };
  });
  const notices = [...extra.notices];
  if (me.role === "owner" && noticeBeforeGrowingFromSolo(size, me.noticesSeen)) notices.unshift("solo_to_duo");
  const statusOf = new Map(rows.map((r) => [r.id, r.status]));

  return {
    me: { memberId: me.id, role: me.role, verified: !!claims.sub },
    size,
    people: active.map((r) => {
      // JR11: once the manager leaves or is removed, organizers act for the managed member.
      const actors = managedMemberActors({
        managedByMemberId: r.managedBy,
        managerActive: !!r.managedBy && statusOf.get(r.managedBy) === "active",
      });
      return {
        id: r.id,
        displayName: r.displayName,
        role: r.role,
        status: r.status,
        managedByName: actors === "manager" ? (nameOf.get(r.managedBy!) ?? null) : actors === "organizers" ? "organizers" : null,
        isMe: r.id === me.id,
        managedByMe: actors === "manager" ? r.managedBy === me.id : actors === "organizers" && isOrganizer,
      };
    }),
    invited: rows.filter((r) => r.status === "invited").map((r) => ({ id: r.id, displayName: r.displayName })),
    requests,
    former: rows
      .filter((r) => r.status === "removed" && r.joinedAt)
      .map((r) => ({ id: r.id, displayName: r.displayName, canRestore: isOrganizer && canRestore(r, now) })),
    linkPaused: isOrganizer && extra.linkPaused,
    notices,
  };
}

/**
 * JR13: the same one-time size notices for the Ideas feed. Active members only; read as the
 * caller first so RLS decides membership.
 */
export async function getSizeNotices(db: Db, claims: Claims, tripId: string): Promise<{ memberId: string; notices: SizeNoticeId[] } | null> {
  const me = await withSession(db, claims, async (tx) => {
    const [row] = await tx
      .select({ id: members.id, userId: members.userId, status: members.status, noticesSeen: members.noticesSeen })
      .from(members)
      .where(
        and(
          eq(members.tripId, tripId),
          claims.sub ? eq(members.userId, claims.sub) : eq(members.id, claims.link_member ?? "00000000-0000-0000-0000-000000000000"),
        ),
      )
      .limit(1);
    return row && row.status === "active" ? row : null;
  });
  if (!me) return null;
  const notices = await asService(db, (tx) => sizeNotices(tx, tripId, me.id, me.noticesSeen));
  return { memberId: me.id, notices };
}

/**
 * FR-T4/T5 notices for one member, from the membership history: the member rows plus the
 * status changes the members_audit trigger records for every update.
 */
async function sizeNotices(tx: Tx, tripId: string, memberId: string, seen: string[]): Promise<SizeNoticeId[]> {
  const rows = await tx
    .select({ id: members.id, status: members.status, createdAt: members.createdAt })
    .from(members)
    .where(eq(members.tripId, tripId));
  const audits = await tx
    .select({ entityId: auditLog.entityId, data: auditLog.data, at: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.tripId, tripId), eq(auditLog.entity, "member"), eq(auditLog.action, "update")))
    .orderBy(asc(auditLog.createdAt), asc(auditLog.id));
  const byMember = new Map<string, { from: string; to: string; at: Date }[]>();
  for (const a of audits) {
    const st = (a.data as { status?: [string, string] } | null)?.status;
    if (!a.entityId || !st || st[0] === st[1]) continue;
    const list = byMember.get(a.entityId) ?? [];
    list.push({ from: st[0], to: st[1], at: a.at });
    byMember.set(a.entityId, list);
  }
  const events: ActivityEvent[] = [];
  for (const r of rows) {
    const changes = byMember.get(r.id) ?? [];
    const initiallyActive = changes.length ? changes[0]!.from === "active" : r.status === "active";
    if (initiallyActive) events.push({ memberId: r.id, at: r.createdAt, active: true });
    for (const c of changes) {
      if ((c.from === "active") !== (c.to === "active")) events.push({ memberId: r.id, at: c.at, active: c.to === "active" });
    }
  }
  const current = tripSize(rows.filter((r) => r.status === "active").length);
  return pendingSizeNotices(lastSizeTransition(events), current, memberId, seen);
}
