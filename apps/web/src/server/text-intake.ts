/**
 * Things texted to our number (FR-82, FR-83, FR-L2, LB-7).
 *
 * - A link goes to the sender's most recently *active* trip (core pickActiveTrip; the §14 OPEN
 *   definition uses the suggested default), filed by AI like a pasted link. With no active trip
 *   it lands in the sender's idea library (needs a verified account). The reply is a plain
 *   receipt with a link to move it (LB-7). Never marketing (FR-84).
 * - A photo is a receipt: stored privately, then handed to the expenses slice (`onReceiptDraft`).
 *
 * Inbound texts are authorized by the sender's number (Twilio-signed webhook), so writes run as
 * the service after checking membership ourselves. Links/captions stay untrusted (C-20/C-21):
 * resolution goes through @wandr/ai resolveIdea exactly like server/ideas.ts.
 */
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  asService,
  ideas,
  ideaSources,
  memberContacts,
  members,
  savedIdeas,
  savedIdeaSources,
  savedIdeaTripSends,
  stops,
  trips,
  users,
  votes,
  type Db,
  type Tx,
} from "@wandr/db";
import { classifyInput } from "@wandr/ai";
import { pickActiveTrip } from "@wandr/core/messaging";
import { createPersonalLink } from "@/lib/auth/personal-link";
import { appUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { intakeReplies } from "@/lib/messaging/notify-texts";
import { EVENTS } from "@/inngest/client";
import type { JobEvent } from "./jobs";

export const moveRoutes = {
  ideaToLibrary: (ideaId: string) => `/move/${ideaId}`,
  savedToTrip: (savedIdeaId: string) => `/move/saved/${savedIdeaId}`,
};

type Membership = { memberId: string; tripId: string; userId: string | null };

/** Active memberships tied to this number, via a user account or an invite-list contact. */
async function activeMembershipsForPhone(tx: Tx, phone: string): Promise<Membership[]> {
  const viaUser = await tx
    .select({ memberId: members.id, tripId: members.tripId, userId: members.userId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(users.phone, phone), eq(members.status, "active")));
  const viaContact = await tx
    .select({ memberId: members.id, tripId: members.tripId, userId: members.userId })
    .from(memberContacts)
    .innerJoin(members, eq(members.id, memberContacts.memberId))
    .where(and(eq(memberContacts.phone, phone), eq(members.status, "active")));
  const seen = new Map<string, Membership>();
  for (const m of [...viaUser, ...viaContact]) if (!seen.has(m.tripId)) seen.set(m.tripId, m);
  return [...seen.values()];
}

/** FR-83: the most recently active trip for this number, or null. */
export async function routeToActiveTrip(tx: Tx, phone: string, now = new Date()): Promise<Membership | null> {
  const ms = await activeMembershipsForPhone(tx, phone);
  if (ms.length === 0) return null;
  const ids = ms.map((m) => m.tripId);
  // JR3: deleted trips never receive texted-in ideas.
  const tripRows = await tx
    .select({ id: trips.id, last: trips.lastActivityAt })
    .from(trips)
    .where(and(inArray(trips.id, ids), isNull(trips.deletedAt)));
  if (tripRows.length === 0) return null;
  const stopRows = await tx
    .select({ tripId: stops.tripId, start: stops.startDate, end: stops.endDate })
    .from(stops)
    .where(inArray(stops.tripId, ids));
  const picked = pickActiveTrip(
    tripRows.map((t) => ({
      tripId: t.id,
      lastActivityAt: t.last,
      stopDates: stopRows.filter((s) => s.tripId === t.id).map((s) => ({ start: s.start, end: s.end })),
    })),
    now,
  );
  return ms.find((m) => m.tripId === picked) ?? null;
}

function provisionalTitle(kind: string): string {
  return kind === "tiktok"
    ? "TikTok idea"
    : kind === "instagram"
      ? "Instagram idea"
      : kind === "youtube"
        ? "YouTube idea"
        : kind === "google_maps"
          ? "Google Maps place"
          : "Link idea";
}

export type IntakeOutcome = { reply: string; job: JobEvent | null };

/** A link texted to our number. Returns the TwiML reply and the job to enqueue. */
export async function handleTextedIdea(db: Db, phone: string, url: string, now = new Date()): Promise<IntakeOutcome> {
  const c = classifyInput(url.slice(0, 2000));
  if (!c.url) return { reply: intakeReplies.noAccount({ url: appUrl() }), job: null };
  const base = appUrl();

  return asService(db, async (tx) => {
    const m = await routeToActiveTrip(tx, phone, now);
    if (m) {
      const [idea] = await tx
        .insert(ideas)
        .values({ tripId: m.tripId, title: provisionalTitle(c.kind), extraction: "processing", createdByMemberId: m.memberId })
        .returning({ id: ideas.id });
      await tx.insert(ideaSources).values({
        ideaId: idea!.id,
        kind: c.kind,
        url: c.url,
        caption: c.text || null,
        sharedByMemberId: m.memberId,
      });
      await tx.update(trips).set({ lastActivityAt: now }).where(eq(trips.id, m.tripId));
      const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, m.tripId));
      // Verified people can move it to their library; link-only guests get their personal link.
      const moveUrl = m.userId ? `${base}${moveRoutes.ideaToLibrary(idea!.id)}` : null;
      const tripUrl = moveUrl ? `${base}${routes.trip(m.tripId)}` : (await createPersonalLink(tx, m.memberId)).url;
      return {
        reply: intakeReplies.savedToTrip({ tripName: trip?.name ?? "", moveUrl, tripUrl }),
        job: { name: EVENTS.ideaAdded, data: { ideaId: idea!.id } },
      };
    }

    // FR-L2: no active trip → the person's library (verified accounts only).
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (!user) return { reply: intakeReplies.noAccount({ url: base }), job: null };
    const [save] = await tx
      .insert(savedIdeas)
      .values({ userId: user.id, title: provisionalTitle(c.kind), extraction: "processing" })
      .returning({ id: savedIdeas.id });
    await tx.insert(savedIdeaSources).values({
      savedIdeaId: save!.id,
      kind: c.kind,
      url: c.url,
      caption: c.text || null,
      addedByUserId: user.id,
    });
    return {
      reply: intakeReplies.savedToLibrary({ moveUrl: `${base}${moveRoutes.savedToTrip(save!.id)}` }),
      job: { name: EVENTS.savedIdeaAdded, data: { savedIdeaId: save!.id } },
    };
  });
}

/** Library saves resolve through the library slice's job (dedupe, auto-sort, import log). */
export { resolveSavedIdeaJob } from "./library";

export type MoveResult =
  | { ok: true; to: string }
  /** TX7: others voted on it; moving deletes their votes, so the sender must confirm first. */
  | { ok: false; error: "not_found" | "confirm_votes_lost" | "not_allowed" };

async function othersVoted(tx: Tx, ideaId: string, creatorMemberId: string): Promise<boolean> {
  const others = await tx
    .select({ m: votes.memberId })
    .from(votes)
    .where(and(eq(votes.ideaId, ideaId), ne(votes.memberId, creatorMemberId)))
    .limit(1);
  return others.length > 0;
}

/**
 * The idea the user texted in, if it's theirs and still in its (live) trip. `othersVoted` drives
 * the TX7 warning (a yes/no only: no counts or names, FR-42).
 */
export async function movableIdea(db: Db, userId: string, ideaId: string) {
  return asService(db, async (tx) => {
    const [row] = await tx
      .select({
        id: ideas.id,
        title: ideas.title,
        tripId: ideas.tripId,
        tripName: trips.name,
        creatorUser: members.userId,
        creatorMember: members.id,
      })
      .from(ideas)
      .innerJoin(trips, eq(trips.id, ideas.tripId))
      .innerJoin(members, eq(members.id, ideas.createdByMemberId))
      .where(and(eq(ideas.id, ideaId), isNull(trips.deletedAt)));
    if (!row || row.creatorUser !== userId) return null;
    return { ...row, othersVoted: await othersVoted(tx, row.id, row.creatorMember) };
  });
}

/**
 * Trip → library. Only the person who added it. TX7: if others already voted, it still moves,
 * but only after the sender confirms (`confirmVotesLost`): the trip idea and all its votes are
 * deleted, and the library copy never carries votes.
 */
export async function moveIdeaToLibrary(
  db: Db,
  userId: string,
  ideaId: string,
  opts: { confirmVotesLost?: boolean } = {},
): Promise<MoveResult> {
  return asService(db, async (tx) => {
    const [idea] = await tx
      .select({ idea: ideas, creatorUser: members.userId, creatorMember: members.id })
      .from(ideas)
      .innerJoin(members, eq(members.id, ideas.createdByMemberId))
      .where(eq(ideas.id, ideaId));
    if (!idea) return { ok: false, error: "not_found" };
    if (idea.creatorUser !== userId) return { ok: false, error: "not_allowed" };
    if (!opts.confirmVotesLost && (await othersVoted(tx, ideaId, idea.creatorMember))) {
      return { ok: false, error: "confirm_votes_lost" };
    }

    const i = idea.idea;
    const [existing] = i.placeId
      ? await tx
          .select({ id: savedIdeas.id })
          .from(savedIdeas)
          .where(and(eq(savedIdeas.userId, userId), eq(savedIdeas.placeId, i.placeId)))
      : [];
    const savedId =
      existing?.id ??
      (
        await tx
          .insert(savedIdeas)
          .values({
            userId,
            title: i.title,
            category: i.category,
            summary: i.summary,
            placeId: i.placeId,
            lat: i.lat,
            lng: i.lng,
            priceLevel: i.priceLevel,
            confidence: i.confidence,
            permanentlyClosed: i.permanentlyClosed,
            regionOrCity: i.cityHint,
            extraction: i.extraction === "processing" ? "failed" : i.extraction,
          })
          .returning({ id: savedIdeas.id })
      )[0]!.id;
    const sources = await tx.select().from(ideaSources).where(eq(ideaSources.ideaId, ideaId));
    if (sources.length) {
      await tx.insert(savedIdeaSources).values(
        sources.map((s) => ({
          savedIdeaId: savedId,
          kind: s.kind,
          url: s.url,
          normalizedUrl: s.normalizedUrl,
          caption: s.caption,
          thumbnailUrl: s.thumbnailUrl,
          creatorHandle: s.creatorHandle,
          addedByUserId: userId,
        })),
      );
    }
    // Votes cascade with the trip idea (TX7: they don't travel to the library copy).
    await tx.delete(ideas).where(eq(ideas.id, ideaId));
    return { ok: true, to: savedId };
  });
}

/** The user's save plus the trips they can move it to (active, verified membership). */
export async function movableSave(db: Db, userId: string, savedIdeaId: string) {
  return asService(db, async (tx) => {
    const [save] = await tx
      .select({ id: savedIdeas.id, title: savedIdeas.title, userId: savedIdeas.userId })
      .from(savedIdeas)
      .where(eq(savedIdeas.id, savedIdeaId));
    if (!save || save.userId !== userId) return null;
    const tripRows = await tx
      .select({ id: trips.id, name: trips.name })
      .from(members)
      .innerJoin(trips, eq(trips.id, members.tripId))
      .where(and(eq(members.userId, userId), eq(members.status, "active")));
    return { save, trips: tripRows };
  });
}

/**
 * Library → trip ("Meant for a trip? Move it"). Copies the save into the trip as an idea
 * (FR-L12 copy semantics, LB-4: provenance in saved_idea_trip_sends; the library copy is kept,
 * nothing is destroyed). Returns the new idea id; the caller enqueues its job so it is filed
 * under the trip's Stops and voted on like any new idea.
 */
export async function moveSaveToTrip(
  db: Db,
  userId: string,
  savedIdeaId: string,
  tripId: string,
): Promise<MoveResult & { ideaId?: string }> {
  return asService(db, async (tx) => {
    const [save] = await tx.select().from(savedIdeas).where(eq(savedIdeas.id, savedIdeaId));
    if (!save || save.userId !== userId) return { ok: false, error: "not_found" };
    const [m] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId), eq(members.status, "active")));
    if (!m) return { ok: false, error: "not_allowed" };
    const sources = await tx.select().from(savedIdeaSources).where(eq(savedIdeaSources.savedIdeaId, savedIdeaId));
    const [idea] = await tx
      .insert(ideas)
      .values({
        tripId,
        title: save.title,
        category: save.category,
        summary: save.summary,
        placeId: save.placeId,
        lat: save.lat,
        lng: save.lng,
        priceLevel: save.priceLevel,
        confidence: save.confidence,
        cityHint: save.regionOrCity,
        permanentlyClosed: save.permanentlyClosed,
        // Re-file under the trip's Stops by running the normal pipeline.
        extraction: "processing",
        createdByMemberId: m.id,
      })
      .returning({ id: ideas.id });
    for (const s of sources) {
      await tx.insert(ideaSources).values({
        ideaId: idea!.id,
        kind: s.kind,
        url: s.url,
        normalizedUrl: s.normalizedUrl,
        caption: s.caption,
        thumbnailUrl: s.thumbnailUrl,
        creatorHandle: s.creatorHandle,
        sharedByMemberId: m.id,
      });
    }
    await tx.insert(savedIdeaTripSends).values({ savedIdeaId, tripId, ideaId: idea!.id, sentByUserId: userId });
    await tx.update(trips).set({ lastActivityAt: new Date() }).where(eq(trips.id, tripId));
    return { ok: true, to: tripId, ideaId: idea!.id };
  });
}

// ---------------------------------------------------------------------------
// Receipts by text (FR-82)
// ---------------------------------------------------------------------------

export type ReceiptDraft = {
  tripId: string;
  memberId: string;
  storagePath: string;
  contentType: string;
  receivedAt: Date;
};

export type ReceiptDeps = {
  fetchMedia: (url: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
  store: (tripId: string, media: { bytes: Uint8Array; contentType: string }) => Promise<string>;
  /** Expenses slice: create the draft expense; may return a link to split it. */
  onDraft: (d: ReceiptDraft) => Promise<{ url?: string | null } | void>;
};

export async function handleTextedReceipt(
  db: Db,
  phone: string,
  mediaUrls: string[],
  deps: ReceiptDeps,
  now = new Date(),
): Promise<{ reply: string }> {
  const m = await asService(db, (tx) => routeToActiveTrip(tx, phone, now));
  if (!m) return { reply: intakeReplies.receiptNoTrip({ url: appUrl() }) };
  const first = mediaUrls[0];
  if (!first) return { reply: intakeReplies.receiptFailed() };
  let storagePath: string;
  let contentType: string;
  try {
    const media = await deps.fetchMedia(first);
    contentType = media.contentType;
    storagePath = await deps.store(m.tripId, media);
  } catch (err) {
    console.warn("[sms] receipt media failed", err instanceof Error ? err.message : err);
    return { reply: intakeReplies.receiptFailed() };
  }
  const draft = await deps.onDraft({ tripId: m.tripId, memberId: m.memberId, storagePath, contentType, receivedAt: now });
  const { tripName, link } = await asService(db, async (tx) => {
    const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, m.tripId));
    await tx.update(trips).set({ lastActivityAt: now }).where(eq(trips.id, m.tripId));
    return { tripName: trip?.name ?? "", link: (await createPersonalLink(tx, m.memberId)).url };
  });
  return { reply: intakeReplies.receiptSaved({ tripName, url: (draft && draft.url) || link }) };
}
