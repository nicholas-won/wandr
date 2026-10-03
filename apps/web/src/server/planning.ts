/**
 * Stages, Stops and attendance, idea status and shortlist suggestions, map data
 * (§6.0 FR-S1–S10, FR-45/49/50, FR-120/121/122/126, §6.10, S-*). Everything runs as the caller
 * (`withSession`) so RLS decides; organizer-only writes are also enforced by RLS and triggers
 * (stops_write, trip_stages_write, polls_write, ideas status trigger).
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  asService,
  auditLog,
  expenses,
  ideas,
  members,
  planItems,
  polls,
  stopAttendance,
  stops,
  trips,
  tripStages,
  votes,
  withSession,
  type Claims,
  type Db,
  type Tx,
} from "@wandr/db";
import { ideaReveals, turnout } from "@wandr/db/reveals";
import {
  availableStageActions,
  can,
  crowdedCategoryShortlists,
  reopenImpact,
  shouldShowStops,
  STAGE_ORDER,
  stageChips,
  transitionStage,
  tripClock,
  tripSize,
  type IdeaStatus,
  type MemberRole,
  type RankedIdea,
  type ShortlistableIdea,
  type StageAction,
  type StageChip,
  type StageKind,
  type StageStatus,
  type TripSize,
} from "@wandr/core";
import {
  centroid,
  currentOrNextStopId,
  ideasForCity,
  moveInOrder,
  newCitySuggestions,
  resolveDateChange,
  shouldShowStageChips,
  stopDateChangeImpact,
  stopDateWarnings,
  stopLabel,
  stopNights,
  stopRemovalImpact,
  validateStopDates,
  type DateChangeChoice,
  type NewCitySuggestion,
  type StopDatesError,
} from "@wandr/core/stop-planning";
import { googleMapsPlaceUrl, googleMapsRouteUrls } from "@wandr/core/maps";
import { pollStatus } from "@wandr/core/poll-flow";
import { closePollsForRemovedStop } from "./polls";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export interface Me {
  memberId: string;
  role: MemberRole;
  isOrganizer: boolean;
}

/** The caller's active member row in a trip (verified user or personal-link member). */
export async function meIn(tx: Tx, claims: Claims, tripId: string): Promise<Me | null> {
  if (!claims.sub && !claims.link_member) return null;
  const rows = await tx
    .select({ id: members.id, userId: members.userId, role: members.role, status: members.status })
    .from(members)
    .where(eq(members.tripId, tripId));
  const m = rows.find((r) => (claims.sub ? r.userId === claims.sub : r.id === claims.link_member));
  if (!m || m.status !== "active") return null;
  // RLS only treats verified sessions as organizers (app.is_organizer).
  return { memberId: m.id, role: m.role, isOrganizer: !!claims.sub && m.role !== "member" };
}

async function activeMembers(tx: Tx, tripId: string) {
  return tx
    .select({ id: members.id, displayName: members.displayName, role: members.role, status: members.status })
    .from(members)
    .where(and(eq(members.tripId, tripId), eq(members.status, "active")))
    .orderBy(asc(members.createdAt));
}

export class PlanningError extends Error {
  constructor(
    public readonly code:
      | "not_a_member"
      | "organizers_only"
      | "not_found"
      | "invalid"
      | "first_stop_name_required"
      | "not_allowed"
      | "last_stop"
      | "vote_first",
    message: string = code,
  ) {
    super(message);
    this.name = "PlanningError";
  }
}

async function requireOrganizer(tx: Tx, claims: Claims, tripId: string): Promise<Me> {
  const me = await meIn(tx, claims, tripId);
  if (!me) throw new PlanningError("not_a_member");
  if (!me.isOrganizer) throw new PlanningError("organizers_only");
  return me;
}

const today = (now: Date) => now.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export type AttendanceState = "yes" | "no" | "assumed";

export interface StopView {
  id: string;
  name: string;
  /** S-3 label with dates. */
  label: string;
  isDefault: boolean;
  position: number;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
  lat: number | null;
  lng: number | null;
  attendees: { memberId: string; name: string; state: AttendanceState }[];
  myAttendance: AttendanceState;
  ideaCount: number;
  /** Planned ideas in this Stop without a day (FR-S10 "needs a day"). */
  needsDay: { ideaId: string; title: string }[];
}

export interface StageView {
  kind: StageKind;
  status: StageStatus;
  /** Earliest open poll deadline for the stage (chips "closes Fri"). ISO string. */
  closesAt: string | null;
  /** Organizer menu (empty for members). */
  actions: StageAction[];
}

export interface PlanningView {
  tripId: string;
  size: TripSize;
  me: Me & { verified: boolean };
  stages: StageView[];
  chips: StageChip[];
  showChips: boolean;
  stops: StopView[];
  showStops: boolean;
  /** FR-S9: where lists open by default (null = whole trip). */
  defaultStopId: string | null;
  unsortedCount: number;
  /** FR-S6, organizers only. */
  newCities: NewCitySuggestion[];
  /** FR-S5: proposed cities (Where stage). */
  cityIdeas: { id: string; title: string; status: string; lat: number | null; lng: number | null }[];
  dateWarnings: { stopId: string; kind: "overlap" | "gap"; days: number }[];
  /** FR-O16: the current/next Stop's clock, shown next to deadlines when it differs from the viewer's. */
  tripClock: { name: string; timeZone: string } | null;
}

export async function getPlanningView(
  db: Db,
  claims: Claims,
  tripId: string,
  now: Date = new Date(),
): Promise<PlanningView | null> {
  return withSession(db, claims, async (tx) => {
    const me = await meIn(tx, claims, tripId);
    if (!me) return null;
    const [trip] = await tx.select({ createdAt: trips.createdAt }).from(trips).where(eq(trips.id, tripId));
    if (!trip) return null;
    const active = await activeMembers(tx, tripId);
    const size = tripSize(active.length);
    const stopRows = await tx.select().from(stops).where(eq(stops.tripId, tripId)).orderBy(asc(stops.position), asc(stops.createdAt));
    const stageRows = await tx.select().from(tripStages).where(eq(tripStages.tripId, tripId));
    const att = stopRows.length
      ? await tx.select().from(stopAttendance).where(inArray(stopAttendance.stopId, stopRows.map((s) => s.id)))
      : [];
    const ideaRows = await tx
      .select({
        id: ideas.id,
        title: ideas.title,
        stopId: ideas.stopId,
        cityHint: ideas.cityHint,
        category: ideas.category,
        status: ideas.status,
        lat: ideas.lat,
        lng: ideas.lng,
        extraction: ideas.extraction,
      })
      .from(ideas)
      .where(eq(ideas.tripId, tripId));
    const openPolls = await tx
      .select({ id: polls.id, stage: polls.stage, closesAt: polls.closesAt, pausedAt: polls.pausedAt })
      .from(polls)
      .where(and(eq(polls.tripId, tripId), isNull(polls.closedAt)));
    const livePolls = openPolls.filter((p) => !p.pausedAt && (!p.closesAt || p.closesAt > now));
    const placed = await tx
      .select({ ideaId: planItems.ideaId, stopId: planItems.stopId })
      .from(planItems)
      .where(eq(planItems.tripId, tripId));
    const placedIdeas = new Set(placed.map((p) => p.ideaId));

    const stages: StageView[] = STAGE_ORDER.map((kind) => {
      const row = stageRows.find((r) => r.stage === kind);
      const status = (row?.status ?? "collecting") as StageStatus;
      const deadlines = livePolls
        .filter((p) => p.stage === kind && p.closesAt)
        .map((p) => p.closesAt!.getTime())
        .sort((a, b) => a - b);
      return {
        kind,
        status,
        closesAt: deadlines.length ? new Date(deadlines[0]!).toISOString() : null,
        actions: me.isOrganizer ? availableStageActions(status, size) : [],
      };
    });

    const stopView: StopView[] = stopRows.map((s) => {
      const attendees = active.map((m) => {
        const r = att.find((a) => a.stopId === s.id && a.memberId === m.id);
        const state: AttendanceState = r ? (r.attending ? "yes" : "no") : "assumed";
        return { memberId: m.id, name: m.displayName, state };
      });
      return {
        id: s.id,
        name: s.name,
        label: stopLabel(s),
        isDefault: s.isDefault,
        position: s.position,
        startDate: s.startDate,
        endDate: s.endDate,
        nights: s.nights,
        lat: s.lat,
        lng: s.lng,
        attendees,
        myAttendance: attendees.find((a) => a.memberId === me.memberId)?.state ?? "assumed",
        ideaCount: ideaRows.filter((i) => i.stopId === s.id && i.status !== "dropped").length,
        needsDay: ideaRows
          .filter((i) => i.stopId === s.id && i.status === "planned" && i.category !== "city" && !placedIdeas.has(i.id))
          .map((i) => ({ ideaId: i.id, title: i.title })),
      };
    });

    const showStops = shouldShowStops(stopRows);
    const chipStages = stages.map((s) => ({ kind: s.kind, status: s.status, closesAt: s.closesAt }));
    return {
      tripId,
      size,
      me: { ...me, verified: !!claims.sub },
      stages,
      chips: stageChips(chipStages, { timeZone: "UTC", now, stopCount: stopRows.length }),
      showChips: shouldShowStageChips({
        stages: stageRows.map((r) => ({ kind: r.stage, status: r.status, updatedAt: r.updatedAt })),
        tripCreatedAt: trip.createdAt,
        stopCount: stopRows.length,
        openStagePolls: livePolls.filter((p) => p.stage).length,
      }),
      stops: stopView,
      showStops,
      defaultStopId: showStops ? currentOrNextStopId(stopRows, today(now)) : null,
      unsortedCount: ideaRows.filter((i) => i.stopId == null && i.status !== "dropped" && i.category !== "city").length,
      newCities: me.isOrganizer
        ? newCitySuggestions(
            ideaRows.filter((i) => i.extraction !== "processing"),
            stopRows,
          )
        : [],
      cityIdeas: ideaRows
        .filter((i) => i.category === "city" && i.status !== "dropped")
        .map((i) => ({ id: i.id, title: i.title, status: i.status, lat: i.lat, lng: i.lng })),
      dateWarnings: stopDateWarnings(stopRows),
      tripClock: tripClock(stopRows, showStops ? currentOrNextStopId(stopRows, today(now)) : null),
    };
  });
}

// ---------------------------------------------------------------------------
// Stages (FR-S1, FR-S2, FR-S4, S-6, S-7)
// ---------------------------------------------------------------------------

export interface ReopenPreview {
  downstreamSetStages: StageKind[];
  pollsToPause: { id: string; question: string }[];
  plannedItems: { id: string; title: string }[];
  ideas: { id: string; title: string }[];
}

async function loadImpact(tx: Tx, tripId: string, stage: StageKind, statuses: Partial<Record<StageKind, StageStatus>>) {
  const pollRows = await tx
    .select({ id: polls.id, question: polls.question, stage: polls.stage, stopId: polls.stopId, closedAt: polls.closedAt, pausedAt: polls.pausedAt })
    .from(polls)
    .where(eq(polls.tripId, tripId));
  const ideaRows = await tx
    .select({ id: ideas.id, title: ideas.title, stage: ideas.stage, stopId: ideas.stopId, status: ideas.status })
    .from(ideas)
    .where(eq(ideas.tripId, tripId));
  const planRows = await tx
    .select({ id: planItems.id, stopId: planItems.stopId, ideaId: planItems.ideaId })
    .from(planItems)
    .where(eq(planItems.tripId, tripId));
  const ideaById = new Map(ideaRows.map((i) => [i.id, i]));
  const impact = reopenImpact(stage, statuses, [
    ...pollRows.map((p) => ({
      id: p.id,
      kind: "poll" as const,
      stage: p.stage,
      stopId: p.stopId,
      open: p.closedAt == null && p.pausedAt == null,
    })),
    ...planRows.map((p) => ({
      id: p.id,
      kind: "planned_item" as const,
      stage: (p.ideaId ? ideaById.get(p.ideaId)?.stage : null) ?? ("do" as StageKind),
      stopId: p.stopId,
    })),
    ...ideaRows
      .filter((i) => i.status === "shortlisted" || i.status === "planned")
      .map((i) => ({ id: i.id, kind: "idea" as const, stage: i.stage, stopId: i.stopId })),
  ]);
  const pollById = new Map(pollRows.map((p) => [p.id, p]));
  const planById = new Map(planRows.map((p) => [p.id, p]));
  return {
    impact,
    preview: {
      downstreamSetStages: impact.downstreamSetStages,
      pollsToPause: impact.pollsToPause.map((id) => ({ id, question: pollById.get(id)?.question ?? "" })),
      plannedItems: impact.plannedItemsToReview.map((id) => ({
        id,
        title: ideaById.get(planById.get(id)?.ideaId ?? "")?.title ?? "Plan item",
      })),
      ideas: impact.ideasAffected.map((id) => ({ id, title: ideaById.get(id)?.title ?? "" })),
    } satisfies ReopenPreview,
  };
}

export type MoveStageResult =
  | { ok: true; from: StageStatus; to: StageStatus }
  | { ok: false; reason: "confirm_no_votes" }
  | { ok: false; reason: "confirm_reopen"; preview: ReopenPreview }
  | { ok: false; reason: "invalid_transition" | "no_voting_in_solo" };

/**
 * FR-S1/S2/S4. Setting a stage nobody voted on asks first (S-7); reopening a set stage shows
 * what's affected first and pauses later-stage open polls (S-6). Organizers only (RLS too).
 */
export async function moveStage(
  db: Db,
  claims: Claims,
  args: { tripId: string; stage: StageKind; action: StageAction; confirmed?: boolean },
): Promise<MoveStageResult> {
  return withSession(db, claims, async (tx) => {
    await requireOrganizer(tx, claims, args.tripId);
    const size = tripSize((await activeMembers(tx, args.tripId)).length);
    const rows = await tx.select().from(tripStages).where(eq(tripStages.tripId, args.tripId));
    const statuses = Object.fromEntries(rows.map((r) => [r.stage, r.status])) as Partial<Record<StageKind, StageStatus>>;
    const from = statuses[args.stage] ?? "collecting";

    let votesCast: number | undefined;
    if (args.action === "set") {
      const stageIdeas = await tx
        .select({ id: ideas.id })
        .from(ideas)
        .where(and(eq(ideas.tripId, args.tripId), eq(ideas.stage, args.stage)));
      const stagePolls = await tx
        .select({ id: polls.id })
        .from(polls)
        .where(and(eq(polls.tripId, args.tripId), eq(polls.stage, args.stage)));
      const ids = new Set([...stageIdeas, ...stagePolls].map((r) => r.id));
      // Organizer-only aggregate counts; never names (FR-42).
      votesCast = (await turnout(tx, args.tripId)).filter((t) => ids.has(t.itemId)).reduce((s, t) => s + t.voterCount, 0);
    }
    const t = transitionStage(from, args.action, size, votesCast);
    if (!t.ok) return { ok: false, reason: t.reason };
    if (t.warning === "no_votes_yet" && !args.confirmed) return { ok: false, reason: "confirm_no_votes" };
    if (t.requiresImpactPreview && !args.confirmed) {
      const { preview } = await loadImpact(tx, args.tripId, args.stage, statuses);
      return { ok: false, reason: "confirm_reopen", preview };
    }
    if (args.action === "reopen") {
      const { impact } = await loadImpact(tx, args.tripId, args.stage, statuses);
      if (impact.pollsToPause.length) {
        await tx.update(polls).set({ pausedAt: new Date() }).where(and(inArray(polls.id, impact.pollsToPause), isNull(polls.pausedAt)));
      }
    }
    await upsertStage(tx, args.tripId, args.stage, t.next);
    return { ok: true, from, to: t.next };
  });
}

async function upsertStage(tx: Tx, tripId: string, stage: StageKind, status: StageStatus) {
  await tx
    .insert(tripStages)
    .values({ tripId, stage, status, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [tripStages.tripId, tripStages.stage], set: { status, updatedAt: new Date() } });
}

/** P7 undo: put a stage back, only if nobody changed it since. */
export async function undoStageMove(
  db: Db,
  claims: Claims,
  args: { tripId: string; stage: StageKind; from: StageStatus; to: StageStatus },
): Promise<boolean> {
  return withSession(db, claims, async (tx) => {
    await requireOrganizer(tx, claims, args.tripId);
    const [row] = await tx
      .select()
      .from(tripStages)
      .where(and(eq(tripStages.tripId, args.tripId), eq(tripStages.stage, args.stage)));
    if ((row?.status ?? "collecting") !== args.to) return false;
    await upsertStage(tx, args.tripId, args.stage, args.from);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Stops (FR-S3, FR-S5, FR-S6, FR-S10, S-5, S-9)
// ---------------------------------------------------------------------------

async function tripIdeasForFiling(tx: Tx, tripId: string) {
  return tx
    .select({
      id: ideas.id,
      stopId: ideas.stopId,
      cityHint: ideas.cityHint,
      category: ideas.category,
      status: ideas.status,
      lat: ideas.lat,
      lng: ideas.lng,
    })
    .from(ideas)
    .where(eq(ideas.tripId, tripId));
}

/**
 * Add a Stop. Used by "New city: Porto, add as a Stop?" (FR-S6: moves that city's ideas in),
 * by "Add as Stop" on a city idea (FR-S5: the idea is marked planned), and by organizers directly.
 * S-9: a one-city trip's hidden Stop becomes the first named Stop; its ideas stay put.
 */
export async function addStop(
  db: Db,
  claims: Claims,
  args: { tripId: string; name: string; firstStopName?: string | null; cityIdeaId?: string | null },
): Promise<{ stopId: string; moved: number }> {
  const name = args.name.trim().slice(0, 60);
  if (!name) throw new PlanningError("invalid", "name_required");
  return withSession(db, claims, async (tx) => {
    await requireOrganizer(tx, claims, args.tripId);
    const stopRows = await tx.select().from(stops).where(eq(stops.tripId, args.tripId)).orderBy(asc(stops.position));
    if (stopRows.length === 1 && stopRows[0]!.isDefault) {
      const first = stopRows[0]!;
      const firstName = (args.firstStopName?.trim() || first.name).slice(0, 60);
      if (!firstName) throw new PlanningError("first_stop_name_required");
      await tx.update(stops).set({ isDefault: false, name: firstName }).where(eq(stops.id, first.id));
      first.name = firstName;
      first.isDefault = false;
    }
    const all = await tripIdeasForFiling(tx, args.tripId);
    let center: { lat: number; lng: number } | null = null;
    let cityIdea: (typeof all)[number] | undefined;
    if (args.cityIdeaId) {
      cityIdea = all.find((i) => i.id === args.cityIdeaId && i.category === "city");
      if (!cityIdea) throw new PlanningError("not_found");
      if (cityIdea.lat != null && cityIdea.lng != null) center = { lat: cityIdea.lat, lng: cityIdea.lng };
    }
    const toMove = ideasForCity(all, stopRows, name);
    center ??= centroid(all.filter((i) => toMove.includes(i.id)));
    const [row] = await tx
      .insert(stops)
      .values({
        tripId: args.tripId,
        name,
        position: Math.max(-1, ...stopRows.map((s) => s.position)) + 1,
        lat: center?.lat ?? null,
        lng: center?.lng ?? null,
      })
      .returning({ id: stops.id });
    const stopId = row!.id;
    if (toMove.length) await tx.update(ideas).set({ stopId }).where(inArray(ideas.id, toMove));
    if (cityIdea) await tx.update(ideas).set({ status: "planned", stage: "where" }).where(eq(ideas.id, cityIdea.id));
    return { stopId, moved: toMove.length };
  });
}

/**
 * "Keep in Lisbon" answer to a new-city prompt: file that city's ideas into `stopId` and record
 * the Stop as their city so the prompt doesn't come back (S-2 day trips).
 */
export async function keepCityInStop(
  db: Db,
  claims: Claims,
  args: { tripId: string; city: string; stopId: string },
): Promise<number> {
  return withSession(db, claims, async (tx) => {
    await requireOrganizer(tx, claims, args.tripId);
    const stopRows = await tx.select().from(stops).where(eq(stops.tripId, args.tripId));
    const target = stopRows.find((s) => s.id === args.stopId);
    if (!target) throw new PlanningError("not_found");
    const ids = ideasForCity(await tripIdeasForFiling(tx, args.tripId), stopRows, args.city);
    if (ids.length) {
      await tx
        .update(ideas)
        .set({ stopId: target.id, cityHint: target.name || null })
        .where(inArray(ideas.id, ids));
    }
    return ids.length;
  });
}

export type UpdateStopResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; error: StopDatesError | "name_required" }
  | {
      ok: false;
      reason: "needs_choices";
      deltaDays: number;
      planItems: { id: string; title: string; dayIndex: number; canShift: boolean }[];
    };

/**
 * Edit a Stop's name, dates or rough length. FR-S10: when dates change and planned items are
 * affected, nothing is saved until the organizer chooses, for each one, "shift" or "unschedule"
 * (items lose their day but stay planned). ST2: the Stop's polls are left alone.
 */
export async function updateStop(
  db: Db,
  claims: Claims,
  args: {
    stopId: string;
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
    nights?: number | null;
    choices?: Record<string, DateChangeChoice>;
  },
): Promise<UpdateStopResult> {
  return withSession(db, claims, async (tx) => {
    const [stop] = await tx.select().from(stops).where(eq(stops.id, args.stopId));
    if (!stop) throw new PlanningError("not_found");
    await requireOrganizer(tx, claims, stop.tripId);
    const name = args.name === undefined ? stop.name : args.name.trim().slice(0, 60);
    if (args.name !== undefined && !name && !stop.isDefault) return { ok: false, reason: "invalid", error: "name_required" };
    const next = {
      startDate: args.startDate === undefined ? stop.startDate : args.startDate || null,
      endDate: args.endDate === undefined ? stop.endDate : args.endDate || null,
      nights: args.nights === undefined ? stop.nights : args.nights,
    };
    // Dates win over a typed rough length.
    if (next.startDate && next.endDate) next.nights = null;
    const err = validateStopDates(next);
    if (err) return { ok: false, reason: "invalid", error: err };
    const nights = stopNights(next);

    const items = await tx
      .select({ id: planItems.id, dayIndex: planItems.dayIndex, ideaId: planItems.ideaId })
      .from(planItems)
      .where(eq(planItems.stopId, stop.id));
    const impact = stopDateChangeImpact(stop, next, items);
    let plan: ReturnType<typeof resolveDateChange> | null = null;
    if (impact && impact.planItems.length) {
      plan = resolveDateChange(impact, args.choices ?? {});
      if (!plan.ok) {
        const titles = new Map(
          (await tx.select({ id: ideas.id, title: ideas.title }).from(ideas).where(eq(ideas.tripId, stop.tripId))).map(
            (i) => [i.id, i.title],
          ),
        );
        return {
          ok: false,
          reason: "needs_choices",
          deltaDays: impact.deltaDays,
          planItems: impact.planItems.map((i) => ({
            ...i,
            title: titles.get(items.find((x) => x.id === i.id)?.ideaId ?? "") ?? "Plan item",
          })),
        };
      }
    }
    await tx
      .update(stops)
      .set({ name, startDate: next.startDate, endDate: next.endDate, nights })
      .where(eq(stops.id, stop.id));
    if (plan?.ok && plan.unscheduleItemIds.length) {
      await tx.delete(planItems).where(inArray(planItems.id, plan.unscheduleItemIds));
    }
    return { ok: true };
  });
}

/** Move a Stop earlier or later in the route (FR-S5 order). */
export async function moveStop(db: Db, claims: Claims, args: { stopId: string; dir: -1 | 1 }) {
  return withSession(db, claims, async (tx) => {
    const [stop] = await tx.select().from(stops).where(eq(stops.id, args.stopId));
    if (!stop) throw new PlanningError("not_found");
    await requireOrganizer(tx, claims, stop.tripId);
    const rows = await tx.select().from(stops).where(eq(stops.tripId, stop.tripId)).orderBy(asc(stops.position), asc(stops.createdAt));
    const order = moveInOrder(
      rows.map((r) => r.id),
      stop.id,
      args.dir,
    );
    for (const [position, id] of order.entries()) {
      await tx.update(stops).set({ position }).where(eq(stops.id, id));
    }
  });
}

/** ST5 preview, as the organizer sees it (RLS: surprise items hidden from them aren't listed, FR-91). */
export interface StopRemovalPreview {
  stopName: string;
  ideas: number;
  pollsToClose: { id: string; question: string }[];
  otherPolls: number;
  planItems: { id: string; title: string }[];
  expenses: number;
}

export type RemoveStopResult = { ok: true } | { ok: false; reason: "confirm"; preview: StopRemovalPreview };

/**
 * S-5 / ST5: remove a city. Organizers can remove one even with polls, plans or expenses: its
 * ideas go to Unsorted with votes intact, its open polls close (all its polls are unlinked from
 * it), its plan items are removed, and expenses stay but no longer point at it (NFR-5). Anything
 * beyond moving ideas is previewed first; nothing changes until `confirmed`. Never the last Stop.
 */
export async function removeStop(
  db: Db,
  claims: Claims,
  args: { stopId: string; confirmed?: boolean },
): Promise<RemoveStopResult> {
  const checked = await withSession(db, claims, async (tx) => {
    const [stop] = await tx.select().from(stops).where(eq(stops.id, args.stopId));
    if (!stop) throw new PlanningError("not_found");
    const me = await requireOrganizer(tx, claims, stop.tripId);
    const all = await tx.select({ id: stops.id }).from(stops).where(eq(stops.tripId, stop.tripId));
    // What the organizer can see (RLS), for the preview.
    const pollRows = await tx
      .select({
        id: polls.id,
        question: polls.question,
        closedAt: polls.closedAt,
        closesAt: polls.closesAt,
        pausedAt: polls.pausedAt,
        winningOptionId: polls.winningOptionId,
      })
      .from(polls)
      .where(eq(polls.stopId, stop.id));
    const ideaRows = await tx.select({ id: ideas.id, title: ideas.title }).from(ideas).where(eq(ideas.stopId, stop.id));
    const planRows = await tx
      .select({ id: planItems.id, ideaId: planItems.ideaId })
      .from(planItems)
      .where(eq(planItems.stopId, stop.id));
    const expenseRows = await tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.stopId, stop.id));
    const now = new Date();
    const impact = stopRemovalImpact({
      stopCount: all.length,
      ideaIds: ideaRows.map((i) => i.id),
      polls: pollRows.map((p) => ({ id: p.id, open: pollStatus(p, now) === "open" || pollStatus(p, now) === "paused" })),
      planItemIds: planRows.map((p) => p.id),
      expenseIds: expenseRows.map((e) => e.id),
    });
    if (!impact.ok) throw new PlanningError("last_stop");
    const titleOf = new Map(
      (await tx.select({ id: ideas.id, title: ideas.title }).from(ideas).where(eq(ideas.tripId, stop.tripId))).map((i) => [
        i.id,
        i.title,
      ]),
    );
    const preview: StopRemovalPreview = {
      stopName: stop.name,
      ideas: impact.ideasToUnsorted.length,
      pollsToClose: impact.pollsToClose.map((id) => ({ id, question: pollRows.find((p) => p.id === id)?.question ?? "" })),
      otherPolls: impact.pollsToUnlink.length - impact.pollsToClose.length,
      planItems: planRows.map((p) => ({ id: p.id, title: titleOf.get(p.ideaId ?? "") ?? "Plan item" })),
      expenses: impact.expensesUnlinked.length,
    };
    return { stop, me, preview, requiresConfirm: impact.requiresConfirm };
  });
  if (checked.requiresConfirm && !args.confirmed) return { ok: false, reason: "confirm", preview: checked.preview };

  // Applied as the service after the organizer check above: it must also reach rows RLS hides
  // from this organizer (surprise polls/expenses, FR-91) and locked expenses (FR-69 guard), and
  // only unlinks them; no money row changes amount or is deleted (NFR-5).
  const { stop, me } = checked;
  await asService(db, async (tx) => {
    const stopPolls = await tx.select().from(polls).where(eq(polls.stopId, stop.id));
    await closePollsForRemovedStop(tx, stopPolls, me.memberId);
    if (stopPolls.length) {
      await tx.update(polls).set({ stopId: null }).where(inArray(polls.id, stopPolls.map((p) => p.id)));
    }
    await tx.update(expenses).set({ stopId: null }).where(eq(expenses.stopId, stop.id));
    // Plan items and attendance cascade; ideas go to Unsorted (FK set null), votes intact.
    await tx.delete(stops).where(eq(stops.id, stop.id));
    await tx.insert(auditLog).values({
      tripId: stop.tripId,
      actorMemberId: me.memberId,
      action: "stop.removed",
      entity: "stop",
      entityId: stop.id,
      data: { name: stop.name, polls: stopPolls.length },
    });
  });
  return { ok: true };
}

/**
 * FR-S7: mark attendance. `attending: null` clears it back to "assumed" (S-12). Self, a managed
 * member (FR-11, JR11), or, for organizers, anyone (Q13). RLS enforces the same (verified only).
 */
export async function setAttendance(
  db: Db,
  claims: Claims,
  args: { stopId: string; memberId: string; attending: boolean | null },
) {
  return withSession(db, claims, async (tx) => {
    const [stop] = await tx.select({ tripId: stops.tripId }).from(stops).where(eq(stops.id, args.stopId));
    if (!stop) throw new PlanningError("not_found");
    const me = await meIn(tx, claims, stop.tripId);
    if (!me) throw new PlanningError("not_a_member");
    const rows = await tx
      .select({ id: members.id, role: members.role, managedBy: members.managedByMemberId, status: members.status })
      .from(members)
      .where(eq(members.tripId, stop.tripId));
    const target = rows.find((r) => r.id === args.memberId);
    if (!target) throw new PlanningError("not_found");
    const d = can(
      { memberId: me.memberId, role: me.role, status: "active", scope: claims.sub ? "full" : "link" },
      "set_attendance",
      {
        target: {
          memberId: target.id,
          role: target.role,
          managedByMemberId: target.managedBy,
          managerActive: !!target.managedBy && rows.find((r) => r.id === target.managedBy)?.status === "active",
        },
      },
    );
    if (!d.allowed) throw new PlanningError(d.reason === "organizers_only" ? "organizers_only" : "not_allowed");
    if (args.attending === null) {
      await tx
        .delete(stopAttendance)
        .where(and(eq(stopAttendance.stopId, args.stopId), eq(stopAttendance.memberId, args.memberId)));
      return;
    }
    await tx
      .insert(stopAttendance)
      .values({ stopId: args.stopId, memberId: args.memberId, attending: args.attending })
      .onConflictDoUpdate({
        target: [stopAttendance.stopId, stopAttendance.memberId],
        set: { attending: args.attending },
      });
  });
}

// ---------------------------------------------------------------------------
// Ideas: status (FR-49), "Not my pick, but I'm in" (FR-50), shortlist (FR-45)
// ---------------------------------------------------------------------------

export const SETTABLE_STATUSES = ["idea", "shortlisted", "planned", "dropped"] as const;

/** FR-49: organizers only (enforced by the ideas trigger). Returns the previous status for undo. */
export async function setIdeaStatus(
  db: Db,
  claims: Claims,
  args: { ideaId: string; status: (typeof SETTABLE_STATUSES)[number] },
): Promise<IdeaStatus> {
  return withSession(db, claims, async (tx) => {
    const [idea] = await tx.select({ status: ideas.status, tripId: ideas.tripId }).from(ideas).where(eq(ideas.id, args.ideaId));
    if (!idea) throw new PlanningError("not_found");
    await requireOrganizer(tx, claims, idea.tripId);
    await tx.update(ideas).set({ status: args.status }).where(eq(ideas.id, args.ideaId));
    return idea.status;
  });
}

/** FR-50 / V-15: commitment flag on your own vote; the vote itself doesn't change. */
export async function setNotMyPick(db: Db, claims: Claims, args: { tripId: string; ideaId: string; on: boolean }) {
  return withSession(db, claims, async (tx) => {
    const me = await meIn(tx, claims, args.tripId);
    if (!me) throw new PlanningError("not_a_member");
    const r = await tx
      .update(votes)
      .set({ notMyPick: args.on })
      .where(and(eq(votes.ideaId, args.ideaId), eq(votes.memberId, me.memberId)))
      .returning({ ideaId: votes.ideaId });
    if (r.length === 0) throw new PlanningError("vote_first");
  });
}

/** My FR-50 flags, for the feed. */
export async function myNotMyPicks(db: Db, claims: Claims, tripId: string): Promise<Set<string>> {
  return withSession(db, claims, async (tx) => {
    const me = await meIn(tx, claims, tripId);
    if (!me) return new Set<string>();
    const rows = await tx
      .select({ ideaId: votes.ideaId })
      .from(votes)
      .where(and(eq(votes.tripId, tripId), eq(votes.memberId, me.memberId), eq(votes.notMyPick, true)));
    return new Set(rows.map((r) => r.ideaId));
  });
}

export interface ShortlistRow {
  id: string;
  title: string;
  status: string;
  approval: number | null;
  inCount: number;
  voters: number;
  must: number;
  priceLevel: number | null;
  rating: number | null;
}

export interface ShortlistSuggestion {
  stopId: string | null;
  stopName: string;
  category: string;
  ideaCount: number;
  suggested: ShortlistRow[];
  /** Ideas in the category the organizer hasn't voted on yet (blind, so not ranked; FR-41). */
  blindCount: number;
}

type SIdea = ShortlistableIdea & { title: string; priceLevel: number | null; rating: number | null };

/**
 * FR-45: per Stop, categories with ~12+ open ideas get a suggested top 4–6 from the ranking.
 * Organizers only. Uses only the tallies this organizer may see (FR-41: blind until they vote),
 * so nothing is revealed early; no AI call (the comparison is a plain table).
 */
export async function shortlistSuggestions(db: Db, claims: Claims, tripId: string): Promise<ShortlistSuggestion[]> {
  return withSession(db, claims, async (tx) => {
    const me = await meIn(tx, claims, tripId);
    if (!me?.isOrganizer) return [];
    const size = tripSize((await activeMembers(tx, tripId)).length);
    if (size === "solo") return [];
    const stopRows = await tx.select({ id: stops.id, name: stops.name }).from(stops).where(eq(stops.tripId, tripId));
    const rows = await tx
      .select({
        id: ideas.id,
        title: ideas.title,
        stopId: ideas.stopId,
        category: ideas.category,
        status: ideas.status,
        createdAt: ideas.createdAt,
        priceLevel: ideas.priceLevel,
        placeCache: ideas.placeCache,
        extraction: ideas.extraction,
      })
      .from(ideas)
      .where(eq(ideas.tripId, tripId));
    const reveals = new Map((await ideaReveals(tx, tripId)).map((r) => [r.ideaId, r]));
    const out: ShortlistSuggestion[] = [];
    const stopKeys = [...new Set(rows.map((r) => r.stopId))];
    for (const stopId of stopKeys) {
      const inStop = rows.filter((r) => r.stopId === stopId && r.category !== "city" && r.extraction !== "processing");
      const ranked: RankedIdea<SIdea>[] = inStop
        .map((r) => {
          const rv = reveals.get(r.id);
          const voters = rv?.voterCount ?? 0;
          const must = rv?.mustCount ?? 0;
          const inCount = must + (rv?.downCount ?? 0);
          const rating = (r.placeCache as { rating?: number | null } | null)?.rating ?? null;
          return {
            idea: {
              id: r.id,
              title: r.title,
              category: r.category,
              status: r.status,
              createdAt: r.createdAt,
              votes: [],
              eligibleVoterIds: [],
              priceLevel: r.priceLevel,
              rating: typeof rating === "number" ? rating : null,
            },
            score: {
              ideaId: r.id,
              voters,
              inCount,
              must,
              down: rv?.downCount ?? 0,
              pass: rv?.passCount ?? 0,
              approval: voters ? inCount / voters : null,
            },
            rank: 0,
          };
        })
        .sort(
          (a, b) =>
            (b.score.approval ?? -1) - (a.score.approval ?? -1) ||
            b.score.must - a.score.must ||
            +a.idea.createdAt - +b.idea.createdAt,
        )
        .map((r, i) => ({ ...r, rank: i + 1 }));
      for (const c of crowdedCategoryShortlists(ranked)) {
        if (!c.crowded) continue;
        out.push({
          stopId,
          stopName: stopRows.find((s) => s.id === stopId)?.name || (stopId ? "This trip" : "Unsorted"),
          category: c.category,
          ideaCount: c.ideaCount,
          blindCount: ranked.filter(
            (r) => r.idea.category === c.category && (r.idea.status === "idea" || r.idea.status === "shortlisted") && !reveals.get(r.idea.id)?.viewerVoted,
          ).length,
          suggested: c.suggested.map((r) => ({
            id: r.idea.id,
            title: r.idea.title,
            status: r.idea.status,
            approval: r.score.approval,
            inCount: r.score.inCount,
            voters: r.score.voters,
            must: r.score.must,
            priceLevel: r.idea.priceLevel,
            rating: r.idea.rating,
          })),
        });
      }
    }
    return out;
  });
}

/** FR-45 → FR-49: organizer accepts a suggested shortlist. */
export async function shortlistIdeas(db: Db, claims: Claims, args: { tripId: string; ideaIds: string[] }) {
  return withSession(db, claims, async (tx) => {
    await requireOrganizer(tx, claims, args.tripId);
    if (!args.ideaIds.length) return;
    await tx
      .update(ideas)
      .set({ status: "shortlisted" })
      .where(and(eq(ideas.tripId, args.tripId), inArray(ideas.id, args.ideaIds), eq(ideas.status, "idea")));
  });
}

// ---------------------------------------------------------------------------
// Map (FR-122, FR-126)
// ---------------------------------------------------------------------------

export interface MapIdea {
  id: string;
  title: string;
  category: string;
  status: string;
  lat: number | null;
  lng: number | null;
  mapsUrl: string;
}

export interface MapGroup {
  stopId: string | null;
  name: string;
  ideas: MapIdea[];
  /** One Google Maps route per ≤11 pinned places (FR-126). */
  routeUrls: string[];
  /** The Stop's geocoded coordinates (FR-S9): where its map opens before any place is located. */
  center: { lat: number; lng: number } | null;
}

const STATUS_ORDER: Record<string, number> = { planned: 0, shortlisted: 1, idea: 2, done: 3 };

/** FR-122: ideas grouped by Stop (route order), planned first. Dropped ideas are left out. */
export async function getMapView(db: Db, claims: Claims, tripId: string): Promise<MapGroup[] | null> {
  return withSession(db, claims, async (tx) => {
    if (!(await meIn(tx, claims, tripId))) return null;
    const stopRows = await tx.select().from(stops).where(eq(stops.tripId, tripId)).orderBy(asc(stops.position));
    const rows = await tx
      .select({
        id: ideas.id,
        title: ideas.title,
        category: ideas.category,
        status: ideas.status,
        lat: ideas.lat,
        lng: ideas.lng,
        placeId: ideas.placeId,
        stopId: ideas.stopId,
        createdAt: ideas.createdAt,
      })
      .from(ideas)
      .where(eq(ideas.tripId, tripId))
      .orderBy(asc(ideas.createdAt));
    const visible = rows.filter((r) => r.status !== "dropped" && r.category !== "city");
    const groups: MapGroup[] = [
      ...stopRows.map((s) => ({
        id: s.id as string | null,
        name: s.name || "This trip",
        center: s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null,
      })),
      { id: null, name: "Unsorted", center: null },
    ]
      .map(({ id, name, center }) => {
        const list = visible
          .filter((r) => r.stopId === id)
          .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
        const mapped = list.map((r) => ({
          id: r.id,
          title: r.title,
          category: r.category,
          status: r.status,
          lat: r.lat,
          lng: r.lng,
          mapsUrl: googleMapsPlaceUrl(r),
        }));
        return { stopId: id, name, ideas: mapped, routeUrls: googleMapsRouteUrls(list), center };
      })
      .filter((g) => g.ideas.length > 0 || g.stopId !== null);
    return groups;
  });
}

