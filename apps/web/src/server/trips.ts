/**
 * Trip services for the hero slice. Reads run through `withSession` so RLS decides what the
 * caller sees; only creation (no client INSERT grant on trips) runs as the service.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  asService,
  expenses,
  ideas,
  ideaSources,
  members,
  stops,
  trips,
  tripStages,
  votes,
  withSession,
  type Claims,
  type Db,
} from "@wandr/db";
import { ideaReveals } from "@wandr/db/reveals";
import { tripSize, type TripSize, type VoteValue } from "@wandr/core";
import { placePhotosEnabled } from "@/lib/idea-visual";
import { buildIdeaCards, type IdeaCard } from "./cards";
import { commentCountsIn } from "./comments";

/** Placeholder until the first idea suggests a name (FR-1a "Start a trip around this?"). */
export const DEFAULT_TRIP_NAME = "New trip";

export const STAGES = ["where", "when", "stay", "getting_around", "do"] as const;

/**
 * FR-1(b)/P1: a trip needs only a name. One hidden default Stop (§5). A single known city
 * starts at Do (FR-S2), so earlier stages begin as `not_needed` only when a city is given.
 */
export async function createTrip(
  db: Db,
  args: {
    userId: string;
    ownerName: string;
    name: string;
    city?: string | null;
    /** FR-1(b) classic setup: destinations in order (each becomes a Stop, FR-S5). */
    destinations?: string[];
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<{ tripId: string; memberId: string; stopId: string }> {
  const destinations = (args.destinations ?? (args.city ? [args.city] : []))
    .map((d) => d.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 8);
  const dated = !!(args.startDate && args.endDate && args.startDate <= args.endDate);
  return asService(db, async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({ name: args.name.trim().slice(0, 80) || "Our trip", createdBy: args.userId })
      .returning({ id: trips.id });
    const tripId = trip!.id;
    const stopRows = await tx
      .insert(stops)
      .values(
        destinations.length
          ? destinations.map((name, position) => ({
              tripId,
              name,
              position,
              isDefault: destinations.length === 1,
              // One destination: the whole date range. Several: dates per Stop are decided in When.
              ...(dated && destinations.length === 1 ? { startDate: args.startDate!, endDate: args.endDate! } : {}),
            }))
          : [{ tripId, name: "", isDefault: true }],
      )
      .returning({ id: stops.id });
    // Known destinations skip Where; known dates skip When (FR-S2). Everything else starts collecting.
    await tx.insert(tripStages).values(
      STAGES.map((stage) => ({
        tripId,
        stage,
        status:
          (stage === "where" && destinations.length > 0) || (stage === "when" && dated)
            ? ("set" as const)
            : ("collecting" as const),
      })),
    );
    const [member] = await tx
      .insert(members)
      .values({
        tripId,
        userId: args.userId,
        displayName: args.ownerName,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
      })
      .returning({ id: members.id });
    return { tripId, memberId: member!.id, stopId: stopRows[0]!.id };
  });
}

export interface TripView {
  trip: { id: string; name: string; size: TripSize; bachMode: boolean };
  me: { memberId: string; role: "owner" | "organizer" | "member"; displayName: string; noticesSeen: string[] };
  members: { id: string; displayName: string; role: string; status: string; isGuestOfHonor: boolean }[];
  /** Invited/pending people. RLS returns these rows to organizers only. */
  invited: { id: string; displayName: string; status: string }[];
  stops: { id: string; name: string; isDefault: boolean; position: number }[];
  ideas: IdeaCard[];
  /** The caller can see at least one expense (full scope only, FR-5). Money nav appears after the first (P2). */
  hasExpenses: boolean;
}

/** Everything the trip page needs, as the caller. Returns null if the caller can't see the trip. */
export async function getTripView(db: Db, claims: Claims, tripId: string): Promise<TripView | null> {
  return withSession(db, claims, async (tx) => {
    const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId));
    if (!trip) return null;
    const memberRows = await tx
      .select({
        id: members.id,
        userId: members.userId,
        displayName: members.displayName,
        role: members.role,
        status: members.status,
        isGuestOfHonor: members.isGuestOfHonor,
        noticesSeen: members.noticesSeen,
        createdAt: members.createdAt,
      })
      .from(members)
      .where(eq(members.tripId, tripId))
      .orderBy(asc(members.createdAt));
    const me = memberRows.find((m) =>
      claims.sub ? m.userId === claims.sub : m.id === claims.link_member,
    );
    if (!me || me.status !== "active") return null;
    const active = memberRows.filter((m) => m.status === "active");
    const size = tripSize(active.length);

    const stopRows = await tx
      .select({ id: stops.id, name: stops.name, isDefault: stops.isDefault, position: stops.position })
      .from(stops)
      .where(eq(stops.tripId, tripId))
      .orderBy(asc(stops.position));
    const ideaRows = await tx
      .select()
      .from(ideas)
      .where(and(eq(ideas.tripId, tripId)))
      .orderBy(asc(ideas.createdAt));
    const ids = ideaRows.map((i) => i.id);
    const sourceRows = ids.length
      ? await tx.select().from(ideaSources).where(inArray(ideaSources.ideaId, ids))
      : [];
    const myVoteRows = await tx
      .select({ ideaId: votes.ideaId, value: votes.value })
      .from(votes)
      .where(and(eq(votes.tripId, tripId), eq(votes.memberId, me.id)));
    const reveals = await ideaReveals(tx, tripId);
    const anyExpense = await tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.tripId, tripId)).limit(1);
    const commentCounts = await commentCountsIn(tx, ids);

    return {
      trip: { id: trip.id, name: trip.name, size, bachMode: trip.bachMode },
      me: { memberId: me.id, role: me.role, displayName: me.displayName, noticesSeen: me.noticesSeen },
      members: memberRows
        .filter((m) => m.status === "active")
        .map(({ id, displayName, role, status, isGuestOfHonor }) => ({
          id,
          displayName,
          role,
          status,
          isGuestOfHonor,
        })),
      invited: memberRows
        .filter((m) => m.status === "invited" || m.status === "pending")
        .map(({ id, displayName, status }) => ({ id, displayName, status })),
      stops: stopRows,
      hasExpenses: anyExpense.length > 0,
      ideas: buildIdeaCards({
        size,
        viewerMemberId: me.id,
        ideas: ideaRows,
        sources: sourceRows,
        reveals,
        myVotes: new Map(myVoteRows.map((v) => [v.ideaId, v.value as VoteValue])),
        memberNames: new Map(memberRows.map((m) => [m.id, m.displayName])),
        stopNames: new Map(stopRows.map((s) => [s.id, s.name])),
        commentCounts,
        photosEnabled: placePhotosEnabled(),
      }),
    };
  });
}

/** Trips the signed-in user belongs to (home screen). */
export async function listMyTrips(db: Db, userId: string) {
  return withSession(db, { sub: userId }, async (tx) =>
    tx
      .select({ id: trips.id, name: trips.name, size: trips.size, lastActivityAt: trips.lastActivityAt })
      .from(trips)
      .innerJoin(members, and(eq(members.tripId, trips.id), eq(members.userId, userId)))
      .where(eq(members.status, "active"))
      .orderBy(asc(trips.createdAt)),
  );
}

/** FR-40/43: cast or change a vote. The DB trigger fills size/open_to/change_count. */
export async function castVote(
  db: Db,
  claims: Claims,
  args: { tripId: string; ideaId: string; memberId: string; value: VoteValue | null },
) {
  return withSession(db, claims, async (tx) => {
    if (args.value === null) {
      await tx.delete(votes).where(and(eq(votes.ideaId, args.ideaId), eq(votes.memberId, args.memberId)));
      return;
    }
    await tx
      .insert(votes)
      .values({
        ideaId: args.ideaId,
        memberId: args.memberId,
        tripId: args.tripId,
        value: args.value,
        castInSize: "solo", // overwritten by trigger
      })
      .onConflictDoUpdate({
        target: [votes.ideaId, votes.memberId],
        set: { value: args.value, updatedAt: new Date() },
      });
  });
}

/** FR-T3/T6: record a one-time notice as seen. */
export async function markNoticeSeen(db: Db, claims: Claims, memberId: string, notice: string) {
  return withSession(db, claims, async (tx) => {
    const [m] = await tx.select({ n: members.noticesSeen }).from(members).where(eq(members.id, memberId));
    if (!m || m.n.includes(notice)) return;
    await tx.update(members).set({ noticesSeen: [...m.n, notice] }).where(eq(members.id, memberId));
  });
}
