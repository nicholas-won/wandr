/**
 * Services behind the native app's JSON API (/api/v1, D75). Everything reads and writes as the
 * caller through the same server modules the web uses (RLS via withSession), then maps the web
 * view models to the contract shapes in @wandr/api-contract. Nothing here may return more than
 * the web would show that person (FR-41/42, FR-91, NFR-3).
 */
import { and, eq } from "drizzle-orm";
import type { IdeaCard as ApiIdeaCard, Me, SaveCard, TripDetail } from "@wandr/api-contract";
import { effectiveSort } from "@wandr/core/library";
import { asService, ideas, members, trips, users, withSession, type Db } from "@wandr/db";
import { maskPhone } from "@/lib/auth/phone";
import { PROVISIONAL_NAME } from "@/lib/auth/provisional";
import { appUrl } from "@/lib/env";
import type { CardPhoto } from "@/lib/idea-visual";
import { routes } from "@/lib/routes";
import { EVENTS } from "@/inngest/client";
import { track } from "./analytics";
import type { IdeaCard } from "./cards";
import { addIdea } from "./ideas";
import { enqueue } from "./jobs";
import { saveToLibrary, type SaveView } from "./library";
import { getTripView } from "./trips";

/** Add an idea to a trip as the caller (RLS) and queue its resolution (FR-20, FR-23). */
export async function addTripIdea(db: Db, args: { userId: string; tripId: string; memberId: string; raw: string }): Promise<string> {
  const { ideaId } = await addIdea(db, { sub: args.userId }, { tripId: args.tripId, memberId: args.memberId, raw: args.raw });
  await enqueue({ name: EVENTS.ideaAdded, data: { ideaId } });
  await track(db, { name: "idea_added", tripId: args.tripId, memberId: args.memberId, props: { ideaId, via: "app" } });
  return ideaId;
}

/** Save to the caller's library and queue its auto-sort (FR-L1, FR-L3). */
export async function addLibrarySave(db: Db, userId: string, raw: string): Promise<string> {
  const { savedIdeaId } = await saveToLibrary(db, userId, { raw });
  await enqueue({ name: EVENTS.savedIdeaAdded, data: { savedIdeaId } });
  return savedIdeaId;
}

/** Card pictures are same-origin paths on the web; the app needs absolute URLs. */
export function absoluteUrl(src: string | null): string | null {
  if (!src) return null;
  return src.startsWith("/") ? `${appUrl()}${src}` : src;
}

/** Google requires the author credit with every place photo (FR-31). Same wording as the web. */
export function photoCredit(photo: CardPhoto | null): string | null {
  if (!photo) return null;
  const names = photo.attributions.map((a) => a.displayName).filter(Boolean);
  return `Photo: ${names.length ? names.join(", ") : "Google user"} · Google Maps`;
}

function picture(v: { photo: CardPhoto | null; thumbnailUrl: string | null }) {
  return {
    imageUrl: v.photo ? absoluteUrl(v.photo.src) : absoluteUrl(v.thumbnailUrl),
    imageCredit: photoCredit(v.photo),
  };
}

export function toMe(u: { id: string; displayName: string; phone: string | null }): Me {
  return {
    id: u.id,
    name: u.displayName,
    phone: u.phone ? maskPhone(u.phone) : null,
    needsName: u.displayName.trim() === "",
  };
}

export async function loadMe(db: Db, userId: string): Promise<Me | null> {
  // Service read of the caller's own row: the client grant on users excludes phone (NFR-3), and the
  // number only leaves masked.
  const [u] = await asService(db, (tx) =>
    tx.select({ id: users.id, displayName: users.displayName, phone: users.phone }).from(users).where(eq(users.id, userId)),
  );
  return u ? toMe(u) : null;
}

/** The owner's name for a new trip (D74: verified people only; "Me" until they add a name). */
export async function ownerName(db: Db, userId: string): Promise<string> {
  const me = await loadMe(db, userId);
  return me?.name.trim() || PROVISIONAL_NAME;
}

/** The caller's active membership in a trip, read as them. Null = not a member (404). */
export async function activeMember(db: Db, userId: string, tripId: string): Promise<{ memberId: string; tripName: string } | null> {
  const [row] = await withSession(db, { sub: userId }, (tx) =>
    tx
      .select({ memberId: members.id, tripName: trips.name })
      .from(members)
      .innerJoin(trips, eq(trips.id, members.tripId))
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId), eq(members.status, "active"))),
  );
  return row ?? null;
}

/** Whether the caller can see this idea in this trip (RLS: hidden surprise items don't exist for them). */
export async function canSeeIdea(db: Db, userId: string, tripId: string, ideaId: string): Promise<boolean> {
  const rows = await withSession(db, { sub: userId }, (tx) =>
    tx.select({ id: ideas.id }).from(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.tripId, tripId))),
  );
  return rows.length > 0;
}

export function toApiIdeaCard(c: IdeaCard, nameById: Map<string, string>): ApiIdeaCard {
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    summary: c.blurb,
    status: c.status,
    stopId: c.stopId,
    locationLabel: c.locationLabel,
    ...picture(c),
    sourceUrl: c.sourceUrl,
    processing: c.processing,
    needsReview: c.needsReview,
    notAPlace: c.notAPlace,
    myVote: c.myVote,
    tallyLabel: c.tallyLabel,
    namedVotes: c.namedVotes,
    splitOpinions: c.splitOpinions,
    rank: c.rank,
    commentCount: c.commentCount,
    // Only organizers ever see a non-empty list: hidden members never receive the row (FR-91).
    hiddenFromNames: c.hiddenFrom.map((id) => nameById.get(id)).filter((n): n is string => !!n),
  };
}

export async function tripDetail(db: Db, userId: string, tripId: string): Promise<TripDetail | null> {
  const view = await getTripView(db, { sub: userId }, tripId);
  if (!view) return null;
  const nameById = new Map([...view.members, ...view.invited].map((m) => [m.id, m.displayName]));
  return {
    id: view.trip.id,
    name: view.trip.name,
    size: view.trip.size,
    me: { memberId: view.me.memberId, role: view.me.role, displayName: view.me.displayName },
    members: view.members.map((m) => ({ id: m.id, displayName: m.displayName, role: m.role })),
    // The hidden default Stop of a one-city trip has no name; the app has nothing to show for it.
    stops: view.stops.filter((s) => s.name.trim()).map((s) => ({ id: s.id, name: s.name })),
    ideas: view.ideas.map((c) => toApiIdeaCard(c, nameById)),
    webUrl: `${appUrl()}${routes.trip(view.trip.id)}`,
  };
}

export function toSaveCard(s: SaveView): SaveCard {
  const e = effectiveSort(s); // the person's own corrections win (FR-L5)
  return {
    id: s.id,
    title: s.title,
    category: e.category,
    summary: s.blurb,
    country: e.country,
    regionOrCity: e.city,
    ...picture(s),
    processing: s.extraction === "processing" || s.extraction === "queued",
    sourceUrl: s.sourceUrl,
  };
}

/** Share-sheet confirmation label (FR-21): "Lisbon trip", "Your library". */
export function tripDestinationLabel(tripName: string): string {
  const name = tripName.trim() || "Your";
  return /\btrip$/i.test(name) ? name : `${name} trip`;
}
export const LIBRARY_DESTINATION = "Your library";
