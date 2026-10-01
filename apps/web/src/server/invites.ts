/**
 * Personal invites (FR-4/5, J-8, J-18). Organizers add a name + phone; the invitee gets a personal
 * text with a personal link. The phone goes only to member_contacts (service-only, NFR-3).
 */
import { and, eq, gte, sql } from "drizzle-orm";
import {
  asService,
  memberContacts,
  members,
  outboundMessages,
  trips,
  withSession,
  type Db,
} from "@wandr/db";
import { createPersonalLink } from "@/lib/auth/personal-link";
import { normalizePhone } from "@/lib/auth/phone";
import { sendMessage } from "@/lib/messaging/send";
import { texts } from "@/lib/messaging/templates";

/** J-18: caps on invite texts. */
export const INVITE_LIMITS = { perTrip: 25, perOrganizerPerDay: 50 };

export type InviteResult =
  | { ok: true; memberId: string; link: string; texted: boolean; channel: string }
  | { ok: false; error: "invalid_phone" | "not_allowed" | "limit" | "already_invited" };

export async function inviteMember(
  db: Db,
  args: { userId: string; tripId: string; name: string; phone: string },
): Promise<InviteResult> {
  const name = args.name.trim().slice(0, 40);
  const phone = normalizePhone(args.phone);
  if (!name || !phone.ok) return { ok: false, error: "invalid_phone" };

  // Insert as the organizer so RLS enforces who may invite (FR-4).
  let inviter: { memberId: string; displayName: string; tripName: string };
  try {
    inviter = await withSession(db, { sub: args.userId }, async (tx) => {
      const [me] = await tx
        .select({ id: members.id, displayName: members.displayName, role: members.role })
        .from(members)
        .where(and(eq(members.tripId, args.tripId), eq(members.userId, args.userId)));
      const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, args.tripId));
      if (!me || !trip || me.role === "member") throw new Error("not_allowed");
      return { memberId: me.id, displayName: me.displayName, tripName: trip.name };
    });
  } catch {
    return { ok: false, error: "not_allowed" };
  }

  const prep = await asService(db, async (tx) => {
    const [dup] = await tx
      .select({ id: members.id })
      .from(members)
      .innerJoin(memberContacts, eq(memberContacts.memberId, members.id))
      .where(and(eq(members.tripId, args.tripId), eq(memberContacts.phone, phone.e164)));
    if (dup) return { error: "already_invited" as const };
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(outboundMessages)
      .where(and(eq(outboundMessages.tripId, args.tripId), eq(outboundMessages.kind, "invite")));
    const [today] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(outboundMessages)
      .innerJoin(members, eq(members.id, outboundMessages.memberId))
      .where(
        and(
          eq(outboundMessages.kind, "invite"),
          gte(outboundMessages.createdAt, new Date(Date.now() - 86_400_000)),
          eq(members.tripId, args.tripId),
        ),
      );
    if ((count?.n ?? 0) >= INVITE_LIMITS.perTrip || (today?.n ?? 0) >= INVITE_LIMITS.perOrganizerPerDay) {
      return { error: "limit" as const };
    }
    return null;
  });
  if (prep) return { ok: false, error: prep.error };

  const memberId = await withSession(db, { sub: args.userId }, async (tx) => {
    const [m] = await tx
      .insert(members)
      .values({ tripId: args.tripId, displayName: name, role: "member", status: "invited" })
      .returning({ id: members.id });
    return m!.id;
  });
  const link = await asService(db, async (tx) => {
    await tx.insert(memberContacts).values({ memberId, phone: phone.e164 });
    return createPersonalLink(tx, memberId);
  });

  const sent = await sendMessage({
    kind: "invite",
    tripId: args.tripId,
    memberId,
    phone: phone.e164,
    email: null,
    body: texts.invite({ to: { name, link: link.url }, inviterName: inviter.displayName, tripName: inviter.tripName }),
  });
  return { ok: true, memberId, link: link.url, texted: sent.channel === "sms", channel: sent.channel };
}

/** A fresh personal link for an existing invitee (e.g. "Send to Sam" from my own phone). */
export async function freshLinkFor(db: Db, args: { userId: string; tripId: string; memberId: string }) {
  const allowed = await withSession(db, { sub: args.userId }, async (tx) => {
    const [me] = await tx
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.tripId, args.tripId), eq(members.userId, args.userId)));
    const [them] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, args.tripId), eq(members.id, args.memberId)));
    return !!me && me.role !== "member" && !!them;
  });
  if (!allowed) return null;
  return asService(db, (tx) => createPersonalLink(tx, args.memberId));
}
