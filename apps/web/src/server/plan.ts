/**
 * "Arrange my days" (§6.11). The deterministic engine in @wandr/core places items; this module
 * loads its input from the trip (as the caller, so RLS hides surprise items from hidden members),
 * previews, and applies. Nothing re-arranges silently (FR-O3, FR-O17).
 */
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { asService, auditLog, ideas, members, planItems, stops, trips, votes, withSession, type Claims, type Db, type Tx } from "@wandr/db";
import { optimizer, tripSize } from "@wandr/core";
import { ideaReveals } from "@wandr/db/reveals";

type ItemInput = optimizer.ItemInput;
type Plan = optimizer.Plan;

const CATEGORY_MAP: Record<string, optimizer.ItemCategory> = {
  food: "food",
  drink: "drink",
  nightlife: "nightlife",
  activity: "activity",
  sight: "sight",
  shopping: "shopping",
  stay: "stay",
};

/** Default plan length when a Stop has no dates or nights yet (FR-O13). */
export const DEFAULT_DAYS = 3;

export interface PlanContext {
  stop: { id: string; name: string; timezone: string | null; startDate: string | null; nights: number | null };
  input: optimizer.ArrangeInput;
  titles: Map<string, string>;
  current: optimizer.PlanLike & { items: PlanItemRow[] };
  canApply: boolean;
  myMemberId: string;
}

export type PlanItemRow = typeof planItems.$inferSelect;

function dayList(startDate: string | null, nights: number | null, endDate: string | null): number | string[] {
  if (startDate && (endDate || nights)) {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = endDate ? new Date(`${endDate}T00:00:00Z`) : new Date(start.getTime() + (nights ?? 0) * 86_400_000);
    const days: string[] = [];
    for (let d = start; d <= end && days.length < 30; d = new Date(d.getTime() + 86_400_000)) {
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }
  return nights && nights > 0 ? nights + 1 : DEFAULT_DAYS;
}

async function load(tx: Tx, claims: Claims, tripId: string, stopId: string | null) {
  const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) return null;
  const memberRows = await tx
    .select({ id: members.id, userId: members.userId, role: members.role, status: members.status })
    .from(members)
    .where(eq(members.tripId, tripId));
  const me = memberRows.find((m) => (claims.sub ? m.userId === claims.sub : m.id === claims.link_member));
  if (!me || me.status !== "active") return null;
  const active = memberRows.filter((m) => m.status === "active");
  const stopRows = await tx.select().from(stops).where(eq(stops.tripId, tripId)).orderBy(asc(stops.position));
  const stop = stopRows.find((s) => s.id === stopId) ?? stopRows[0];
  if (!stop) return null;
  return { trip, me, active, stop, stopRows };
}

/** FR-O1: planned items, plus shortlisted Must-dos as "suggested". */
export async function getPlanContext(
  db: Db,
  claims: Claims,
  tripId: string,
  stopId: string | null = null,
): Promise<PlanContext | null> {
  return withSession(db, claims, async (tx) => {
    const base = await load(tx, claims, tripId, stopId);
    if (!base) return null;
    const { trip, me, active, stop, stopRows } = base;
    const singleStop = stopRows.length === 1;
    const ideaRows = await tx
      .select()
      .from(ideas)
      .where(
        and(
          eq(ideas.tripId, tripId),
          inArray(ideas.status, ["planned", "shortlisted"]),
          singleStop ? or(eq(ideas.stopId, stop.id), isNull(ideas.stopId)) : eq(ideas.stopId, stop.id),
        ),
      )
      .orderBy(asc(ideas.createdAt));
    const reveals = new Map((await ideaReveals(tx, tripId)).map((r) => [r.ideaId, r]));
    const myVotes = new Map(
      (
        await tx
          .select({ ideaId: votes.ideaId, value: votes.value })
          .from(votes)
          .where(and(eq(votes.tripId, tripId), eq(votes.memberId, me.id)))
      ).map((v) => [v.ideaId, v.value]),
    );
    // Rank by approval where visible (FR-O10 "then by ranking"); Must-do if anyone said so.
    const scored = ideaRows
      .map((i) => {
        const r = reveals.get(i.id);
        const voters = r?.voterCount ?? 0;
        const inCount = (r?.mustCount ?? 0) + (r?.downCount ?? 0);
        const must = (r?.mustCount ?? 0) > 0 || myVotes.get(i.id) === "must";
        return { i, approval: voters ? inCount / voters : 0, must };
      })
      .sort((a, b) => Number(b.must) - Number(a.must) || b.approval - a.approval);
    const existing = await tx.select().from(planItems).where(eq(planItems.stopId, stop.id));
    const byIdea = new Map(existing.filter((p) => p.ideaId).map((p) => [p.ideaId!, p]));

    const items: ItemInput[] = [];
    scored.forEach(({ i, must }, idx) => {
      if (i.category === "city" || i.category === "transit" || i.permanentlyClosed) return;
      const p = byIdea.get(i.id);
      const planned = i.status === "planned";
      if (!planned && !must) return;
      items.push({
        id: i.id,
        title: i.title,
        category: CATEGORY_MAP[i.category] ?? "other",
        lat: i.lat,
        lng: i.lng,
        durationMinutes: p?.durationMinutes ?? null,
        locked: p?.locked ? { dayIndex: p.dayIndex, startMinute: p.startMinute } : null,
        priority: { must, rank: idx + 1 },
        status: planned ? "planned" : "suggested",
        attendees: p?.attendeeMemberIds ?? null,
        hiddenFrom: i.hiddenFrom,
      });
    });

    const lodging = stop.lodgingIdeaId
      ? (await tx.select({ lat: ideas.lat, lng: ideas.lng }).from(ideas).where(eq(ideas.id, stop.lodgingIdeaId)))[0]
      : undefined;
    const input: optimizer.ArrangeInput = {
      stop: {
        timezone: stop.timezone ?? "UTC",
        days: dayList(stop.startDate, stop.nights, stop.endDate),
        lodging: lodging?.lat != null && lodging.lng != null ? { lat: lodging.lat, lng: lodging.lng } : null,
      },
      items,
      pace: (trip.pace as optimizer.Pace) ?? "balanced",
      memberIds: active.map((m) => m.id),
    };
    const size = tripSize(active.length);
    // FR-O3: organizers apply; in a duo, the owner (D57).
    const canApply = !!claims.sub && (size === "duo" ? me.role === "owner" : me.role !== "member");
    return {
      stop: { id: stop.id, name: stop.name, timezone: stop.timezone, startDate: stop.startDate, nights: stop.nights },
      input,
      titles: new Map(ideaRows.map((i) => [i.id, i.title])),
      current: {
        items: existing,
        days: groupDays(existing),
      } as PlanContext["current"],
      canApply,
      myMemberId: me.id,
    };
  });
}

function groupDays(rows: PlanItemRow[]): optimizer.PlanLike["days"] {
  const days = new Map<number, PlanItemRow[]>();
  for (const r of rows) days.set(r.dayIndex, [...(days.get(r.dayIndex) ?? []), r]);
  return [...days.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, rs]) => ({
      dayIndex,
      items: rs
        .sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999))
        .map((r) => ({
          itemId: r.ideaId ?? r.id,
          startMinute: r.startMinute,
          durationMinutes: r.durationMinutes,
          attendees: r.attendeeMemberIds,
        })),
    })) as optimizer.PlanLike["days"];
}

/** FR-O1/O3: a proposal; nothing is saved. */
export function previewPlan(ctx: PlanContext): Plan {
  return optimizer.arrangeDays(ctx.input);
}

/** FR-O6: live hints for the saved plan. */
export function planHints(ctx: PlanContext) {
  if (ctx.current.items.length === 0) return [];
  return optimizer.checkPlan(ctx.current, ctx.input.items, ctx.input.stop, {
    pace: ctx.input.pace,
    memberIds: ctx.input.memberIds,
  });
}

/** FR-O17: has the input changed since the plan was last applied? */
export async function isPlanOutOfDate(db: Db, claims: Claims, tripId: string, ctx: PlanContext): Promise<boolean> {
  if (ctx.current.items.length === 0) return false;
  const [row] = await withSession(db, claims, (tx) =>
    tx
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.tripId, tripId), eq(auditLog.action, "plan_applied"), eq(auditLog.entityId, ctx.stop.id)))
      .orderBy(asc(auditLog.createdAt)),
  ).then((rows) => rows.slice(-1));
  const basis = (row?.data as { basis?: optimizer.PlanBasis } | undefined)?.basis;
  if (!basis) return false;
  return optimizer.checkPlanFreshness(basis, ctx.input).outOfDate;
}

/**
 * FR-O3: apply a freshly computed plan. Locked rows stay exactly as they are (FR-O4); every
 * other row for the Stop is replaced. The basis is logged for the out-of-date check (FR-O17).
 */
export async function applyPlan(db: Db, claims: Claims, tripId: string, stopId: string | null) {
  const ctx = await getPlanContext(db, claims, tripId, stopId);
  if (!ctx || !ctx.canApply) throw new Error("not_allowed");
  const plan = previewPlan(ctx);
  await withSession(db, claims, async (tx) => {
    await tx.delete(planItems).where(and(eq(planItems.stopId, ctx.stop.id), eq(planItems.locked, false)));
    const lockedIdeas = new Set(ctx.current.items.filter((p) => p.locked).map((p) => p.ideaId));
    const rows = plan.days.flatMap((d) =>
      d.items
        .filter((it) => !lockedIdeas.has(it.itemId))
        .map((it) => ({
          tripId,
          stopId: ctx.stop.id,
          ideaId: it.itemId,
          dayIndex: d.dayIndex,
          startMinute: it.startMinute,
          durationMinutes: it.durationMinutes,
          travelMode: it.travelFromPrev?.mode ?? null,
          travelMinutes: it.travelFromPrev?.minutes ?? null,
          reason: it.reason,
          track: String(it.track),
          attendeeMemberIds: it.attendees,
          hiddenFrom: it.hiddenFrom,
        })),
    );
    if (rows.length) await tx.insert(planItems).values(rows);
  });
  await recordBasis(db, tripId, ctx);
  return plan;
}

/** audit_log has no client insert grant; the caller was authorized above. */
async function recordBasis(db: Db, tripId: string, ctx: PlanContext) {
  await asService(db, (tx) =>
    tx.insert(auditLog).values({
      tripId,
      actorMemberId: ctx.myMemberId,
      action: "plan_applied",
      entity: "stop",
      entityId: ctx.stop.id,
      data: { basis: optimizer.computePlanBasis(ctx.input) },
    }),
  );
}

/** The Stop's location: its own coordinates, else the middle of its located ideas (for weather). */
export function stopLocation(ctx: PlanContext & { stopLatLng?: { lat: number; lng: number } | null }) {
  if (ctx.stopLatLng) return ctx.stopLatLng;
  const pts = ctx.input.items.filter((i) => i.lat != null && i.lng != null);
  if (pts.length === 0) return null;
  return {
    lat: pts.reduce((a, i) => a + i.lat!, 0) / pts.length,
    lng: pts.reduce((a, i) => a + i.lng!, 0) / pts.length,
  };
}

/** Decided ideas that aren't on the plan yet (D70: people can build the plan by hand). */
export function unplacedItems(ctx: PlanContext) {
  const placed = new Set(ctx.current.items.map((p) => p.ideaId));
  return ctx.input.items.filter((i) => !placed.has(i.id));
}

/**
 * D70 / C-Q27: put an idea on a day (and optionally a time) by hand. Manual placements are
 * locked, so "Arrange my days" works around them instead of moving them (FR-O4).
 */
export async function addToPlan(
  db: Db,
  claims: Claims,
  args: { tripId: string; stopId: string; ideaId: string; dayIndex: number; startMinute: number | null },
) {
  if (!Number.isInteger(args.dayIndex) || args.dayIndex < 0 || args.dayIndex > 60) throw new Error("invalid_day");
  if (args.startMinute !== null && (!Number.isInteger(args.startMinute) || args.startMinute < 0 || args.startMinute > 1800)) {
    throw new Error("invalid_time");
  }
  return withSession(db, claims, async (tx) => {
    const [idea] = await tx
      .select({ id: ideas.id, hiddenFrom: ideas.hiddenFrom })
      .from(ideas)
      .where(and(eq(ideas.id, args.ideaId), eq(ideas.tripId, args.tripId)));
    if (!idea) throw new Error("not_found");
    await tx.delete(planItems).where(and(eq(planItems.stopId, args.stopId), eq(planItems.ideaId, args.ideaId)));
    await tx.insert(planItems).values({
      tripId: args.tripId,
      stopId: args.stopId,
      ideaId: args.ideaId,
      dayIndex: args.dayIndex,
      startMinute: args.startMinute,
      locked: true,
      reason: "Added by hand",
      hiddenFrom: idea.hiddenFrom,
    });
  });
}

/** FR-O4: lock/unlock or move an item to another day. */
export async function updatePlanItem(
  db: Db,
  claims: Claims,
  args: { planItemId: string; locked?: boolean; dayIndex?: number; startMinute?: number | null },
) {
  return withSession(db, claims, (tx) =>
    tx
      .update(planItems)
      .set({
        ...(args.locked !== undefined ? { locked: args.locked } : {}),
        ...(args.dayIndex !== undefined ? { dayIndex: args.dayIndex, startMinute: args.startMinute ?? null } : {}),
      })
      .where(eq(planItems.id, args.planItemId)),
  );
}
