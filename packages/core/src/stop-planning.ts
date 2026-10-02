/**
 * Multi-city planning helpers on top of stops.ts (§6.0 FR-S3, FR-S5, FR-S6, FR-S9, FR-S10, P2,
 * S-1, S-2, S-3, S-4, S-9, S-15, S-17). Pure functions; the server applies the results.
 */
import { distanceKm, DEFAULT_STOP_RADIUS_KM, type LatLng } from "./stops";
import type { StageKind, StageStatus } from "./domain";

/** Case/diacritic-insensitive city key ("São Paulo" → "sao paulo"). */
export function foldCity(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Same city? Exact folded match, or one contains the other ("Porto" ~ "Porto, Portugal"). */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = foldCity(a);
  const y = foldCity(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && (` ${long} `.includes(` ${short} `));
}

// ---------------------------------------------------------------------------
// "New city: Porto, add as a Stop?" (FR-S6, S-2, S-9, S-15)
// ---------------------------------------------------------------------------

export interface CityIdea {
  id: string;
  stopId: string | null;
  cityHint: string | null;
  category: string;
  status: string;
  lat: number | null;
  lng: number | null;
}

export interface CityStop {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface NewCitySuggestion {
  /** Display name (the most common spelling among the ideas). */
  city: string;
  ideaIds: string[];
  /** Centroid of the ideas that have coordinates; becomes the new Stop's pin. */
  center: LatLng | null;
  /** Where these ideas currently sit (null = Unsorted). Empty Stop ids are omitted. */
  fromStopIds: (string | null)[];
}

/**
 * FR-S6 / S-15: cities that should be offered as a new Stop.
 * An idea counts toward a city when it has a city hint that matches no existing Stop, isn't a
 * `city` idea itself (those are proposals in the Where stage, FR-S5) or dropped, and either:
 * - it is Unsorted (FR-S3), or
 * - it sits in a named Stop whose name differs from the hint and it is provably far from that
 *   Stop (> radius, using the Stop's pin or else the centroid of the Stop's same-city ideas).
 *   Without any coordinates a name mismatch alone suggests (the organizer can say "keep").
 *   S-2: places within the radius (day trips like Sintra from Lisbon) are never suggested.
 * Sorted by idea count (desc), then name.
 */
export function newCitySuggestions(
  ideas: readonly CityIdea[],
  stops: readonly CityStop[],
  opts: { radiusKm?: number } = {},
): NewCitySuggestion[] {
  const radius = opts.radiusKm ?? DEFAULT_STOP_RADIUS_KM;
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const knownCity = (hint: string) => stops.some((s) => sameCity(s.name, hint));

  const anchorCache = new Map<string, LatLng | null>();
  const anchorOf = (s: CityStop): LatLng | null => {
    if (s.lat != null && s.lng != null) return { lat: s.lat, lng: s.lng };
    if (anchorCache.has(s.id)) return anchorCache.get(s.id)!;
    const own = ideas.filter((i) => i.stopId === s.id && sameCity(i.cityHint, s.name));
    const c = centroid(own);
    anchorCache.set(s.id, c);
    return c;
  };

  const groups = new Map<string, { names: Map<string, number>; ideas: CityIdea[] }>();
  for (const i of ideas) {
    if (!i.cityHint || i.category === "city" || i.status === "dropped") continue;
    if (knownCity(i.cityHint)) continue;
    if (i.stopId != null) {
      const s = stopById.get(i.stopId);
      if (!s || !foldCity(s.name)) continue; // hidden unnamed Stop: nothing to compare against
      const anchor = anchorOf(s);
      if (anchor && i.lat != null && i.lng != null) {
        if (distanceKm(anchor, { lat: i.lat, lng: i.lng }) <= radius) continue;
      }
    }
    const key = foldCity(i.cityHint);
    const g = groups.get(key) ?? { names: new Map<string, number>(), ideas: [] as CityIdea[] };
    g.names.set(i.cityHint.trim(), (g.names.get(i.cityHint.trim()) ?? 0) + 1);
    g.ideas.push(i);
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => {
      const city = [...g.names].sort((a, b) => b[1] - a[1])[0]![0]; // ties: first seen
      return {
        city,
        ideaIds: g.ideas.map((i) => i.id),
        center: centroid(g.ideas),
        fromStopIds: [...new Set(g.ideas.map((i) => i.stopId))],
      };
    })
    .sort((a, b) => b.ideaIds.length - a.ideaIds.length || a.city.localeCompare(b.city));
}

/** Mean of the points that have coordinates (fine at city scale). */
export function centroid(points: readonly { lat: number | null; lng: number | null }[]): LatLng | null {
  const located = points.filter((p): p is LatLng => p.lat != null && p.lng != null);
  if (located.length === 0) return null;
  return {
    lat: located.reduce((s, p) => s + p.lat, 0) / located.length,
    lng: located.reduce((s, p) => s + p.lng, 0) / located.length,
  };
}

/** Ideas that belong to `city` (for moving them into the new Stop). Uses the same rules. */
export function ideasForCity(ideas: readonly CityIdea[], stops: readonly CityStop[], city: string): string[] {
  const hit = newCitySuggestions(ideas, stops).find((s) => sameCity(s.city, city));
  return hit?.ideaIds ?? [];
}

// ---------------------------------------------------------------------------
// Dates (FR-S10, S-3, S-4, S-17)
// ---------------------------------------------------------------------------

/** Calendar date "YYYY-MM-DD" → UTC epoch days (no time zones involved). */
export function epochDay(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new RangeError(`Invalid date: ${isoDate}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  if (d.getUTCMonth() !== Number(m[2]) - 1) throw new RangeError(`Invalid date: ${isoDate}`);
  return Math.round(ms / 86_400_000);
}

export function addDays(isoDate: string, days: number): string {
  return new Date((epochDay(isoDate) + days) * 86_400_000).toISOString().slice(0, 10);
}

export interface StopDates {
  startDate: string | null;
  endDate: string | null;
  /** Rough length when there are no dates ("3 nights"). */
  nights: number | null;
}

/** Nights in a Stop: from the dates when both exist, else the rough length. */
export function stopNights(d: StopDates): number | null {
  if (d.startDate && d.endDate) return epochDay(d.endDate) - epochDay(d.startDate);
  return d.nights;
}

/** Plan days (Day 1 = index 0) in a Stop: nights + 1 (arrival through departure day). */
export function stopDayCount(d: StopDates): number | null {
  const n = stopNights(d);
  return n == null ? null : n + 1;
}

export type StopDatesError = "invalid_date" | "end_before_start" | "nights_out_of_range";

/** Validate an edit. Nights are 0..60 (a day trip to two months). */
export function validateStopDates(d: StopDates): StopDatesError | null {
  for (const x of [d.startDate, d.endDate]) {
    if (x == null) continue;
    try {
      epochDay(x);
    } catch {
      return "invalid_date";
    }
  }
  if (d.startDate && d.endDate && epochDay(d.endDate) < epochDay(d.startDate)) return "end_before_start";
  const n = stopNights(d);
  if (n != null && (!Number.isInteger(n) || n < 0 || n > 60)) return "nights_out_of_range";
  return null;
}

/**
 * A plan item's placement. "Unschedule" removes the placement only: the idea stays `planned`
 * and shows as "needs a day" until it's placed again (S-4: nothing planned is ever deleted).
 */
export interface DatedPlanItem {
  id: string;
  dayIndex: number;
}

export interface DatedPoll {
  id: string;
  closesAt: Date | null;
  open: boolean;
}

export type DateChangeChoice = "shift" | "unschedule";

export interface DateChangeImpact {
  /** Days the Stop's start moved (0 if only the end moved or there were no dates). */
  deltaDays: number;
  newDayCount: number | null;
  planItems: {
    id: string;
    dayIndex: number;
    /** Shifting keeps the item on the same day of the Stop (Day N), i.e. moves it by deltaDays. */
    canShift: boolean;
  }[];
  polls: { id: string }[];
}

/**
 * FR-S10 / S-4: what a Stop date change touches, for the "ask each time" screen.
 * Plan items are stored by day of the Stop (Day 1 = 0), so:
 * - if the start date moves, every scheduled item moves with it unless the organizer
 *   unschedules it ("needs a day"); items past the new last day can only be unscheduled;
 * - if only the length changes, items past the new last day are affected.
 * Open polls of the Stop are listed whenever the dates change (S-4). Returns null if nothing
 * about the dates changed.
 */
export function stopDateChangeImpact(
  before: StopDates,
  after: StopDates,
  items: readonly DatedPlanItem[],
  polls: readonly DatedPoll[],
): DateChangeImpact | null {
  const same =
    before.startDate === after.startDate &&
    before.endDate === after.endDate &&
    stopNights(before) === stopNights(after);
  if (same) return null;
  const deltaDays =
    before.startDate && after.startDate ? epochDay(after.startDate) - epochDay(before.startDate) : 0;
  const newDayCount = stopDayCount(after);
  const fits = (i: DatedPlanItem) => newDayCount == null || i.dayIndex < newDayCount;
  const affected = items.filter((i) => deltaDays !== 0 || !fits(i));
  return {
    deltaDays,
    newDayCount,
    planItems: affected.map((i) => ({ id: i.id, dayIndex: i.dayIndex, canShift: fits(i) })),
    polls: polls.filter((p) => p.open).map((p) => ({ id: p.id })),
  };
}

/**
 * Apply the organizer's choices. Missing choices are an error (we always ask, FR-S10), as is
 * "shift" for an item that no longer fits. Poll "shift" moves its deadline by deltaDays;
 * "unschedule" pauses it (S-4).
 */
export function resolveDateChange(
  impact: DateChangeImpact,
  choices: Readonly<Record<string, DateChangeChoice>>,
):
  | {
      ok: true;
      unscheduleItemIds: string[];
      shiftPollIds: string[];
      pausePollIds: string[];
    }
  | { ok: false; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];
  const unscheduleItemIds: string[] = [];
  const shiftPollIds: string[] = [];
  const pausePollIds: string[] = [];
  for (const i of impact.planItems) {
    const c = choices[i.id];
    if (!c) missing.push(i.id);
    else if (c === "shift" && !i.canShift) invalid.push(i.id);
    else if (c === "unschedule") unscheduleItemIds.push(i.id);
  }
  for (const p of impact.polls) {
    const c = choices[p.id];
    if (!c) missing.push(p.id);
    else if (c === "shift") shiftPollIds.push(p.id);
    else pausePollIds.push(p.id);
  }
  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return { ok: true, unscheduleItemIds, shiftPollIds, pausePollIds };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** S-3: "Lisbon (Apr 3–5)", "Porto (Apr 30–May 2)", "Porto (3 nights)", or just the name. */
export function stopLabel(s: { name: string } & StopDates): string {
  const name = s.name || "First stop";
  if (s.startDate && s.endDate) {
    const [, am, ad] = s.startDate.split("-").map(Number) as [number, number, number];
    const [, bm, bd] = s.endDate.split("-").map(Number) as [number, number, number];
    const range = am === bm ? `${MONTHS[am - 1]} ${ad}–${bd}` : `${MONTHS[am - 1]} ${ad}–${MONTHS[bm - 1]} ${bd}`;
    return `${name} (${range})`;
  }
  if (s.startDate) {
    const [, am, ad] = s.startDate.split("-").map(Number) as [number, number, number];
    return `${name} (from ${MONTHS[am - 1]} ${ad})`;
  }
  if (s.nights != null) return `${name} (${s.nights} ${s.nights === 1 ? "night" : "nights"})`;
  return name;
}

/** S-17: overlapping or gapped consecutive Stops (warning only; overnight transit is fine). */
export function stopDateWarnings(
  stops: readonly ({ id: string; name: string; position: number } & StopDates)[],
): { stopId: string; kind: "overlap" | "gap"; days: number }[] {
  const dated = [...stops]
    .filter((s) => s.startDate && s.endDate)
    .sort((a, b) => a.position - b.position);
  const out: { stopId: string; kind: "overlap" | "gap"; days: number }[] = [];
  for (let k = 1; k < dated.length; k++) {
    const prevEnd = epochDay(dated[k - 1]!.endDate!);
    const start = epochDay(dated[k]!.startDate!);
    if (start < prevEnd) out.push({ stopId: dated[k]!.id, kind: "overlap", days: prevEnd - start });
    else if (start > prevEnd + 1) out.push({ stopId: dated[k]!.id, kind: "gap", days: start - prevEnd - 1 });
  }
  return out;
}

/** Move a Stop one place up or down in the route; returns the new id order. */
export function moveInOrder(ids: readonly string[], id: string, dir: -1 | 1): string[] {
  const out = [...ids];
  const i = out.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

// ---------------------------------------------------------------------------
// Feed / map default Stop (FR-S9)
// ---------------------------------------------------------------------------

/**
 * FR-S9: lists open on the current or next Stop. "Current" = today within its dates; "next" =
 * the earliest Stop starting after today. Undated trips, single-Stop trips and trips that are
 * over open on the whole trip (null).
 */
export function currentOrNextStopId(
  stops: readonly ({ id: string; position: number } & StopDates)[],
  today: string,
): string | null {
  if (stops.length < 2) return null;
  const t = epochDay(today);
  const dated = stops.filter((s) => s.startDate);
  const current = dated.find(
    (s) => epochDay(s.startDate!) <= t && t <= epochDay(s.endDate ?? s.startDate!),
  );
  if (current) return current.id;
  const next = dated
    .filter((s) => epochDay(s.startDate!) > t)
    .sort((a, b) => epochDay(a.startDate!) - epochDay(b.startDate!) || a.position - b.position)[0];
  return next?.id ?? null;
}

// ---------------------------------------------------------------------------
// Stage chips visibility (P2 "Stages appear as progress chips, not as a wizard")
// ---------------------------------------------------------------------------

/**
 * P2: chips appear only once the trip has more than the default: an organizer has moved a stage
 * since the trip was created, the trip has 2+ Stops, or a stage has an open poll. A brand-new
 * trip (including "Where" auto-set for a one-city trip) shows nothing.
 */
export function shouldShowStageChips(args: {
  stages: readonly { kind: StageKind; status: StageStatus; updatedAt: Date }[];
  tripCreatedAt: Date;
  stopCount: number;
  openStagePolls: number;
}): boolean {
  if (args.stopCount >= 2 || args.openStagePolls > 0) return true;
  // createTrip writes the stage rows in the trip's transaction (same now()); any later write is a change.
  return args.stages.some((s) => s.updatedAt.getTime() > args.tripCreatedAt.getTime());
}
