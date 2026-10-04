import type {
  DayKind,
  ItemInput,
  OpeningInterval,
  Pace,
  StopInput,
  TimeOfDay,
  Weekday,
} from "./types";

const H = 60;

/** Pace settings (FR-O9). Caps are per day; `buffer` is free time between items. */
export interface PaceRules {
  activities: number;
  meals: number;
  /** Bars / nightlife. */
  night: number;
  /** Minutes of free time left between consecutive items. */
  bufferMinutes: number;
  /** Earliest start for non-meal daytime items. */
  dayStart: number;
}

export const PACE_RULES: Record<Pace, PaceRules> = {
  relaxed: { activities: 2, meals: 2, night: 1, bufferMinutes: 45, dayStart: 10 * H },
  balanced: { activities: 3, meals: 2, night: 1, bufferMinutes: 20, dayStart: 9 * H + 30 },
  packed: { activities: 5, meals: 3, night: 2, bufferMinutes: 10, dayStart: 8 * H + 30 },
};

/** Internal placement kind: which time window an item is aimed at. */
export type Kind =
  | "breakfast"
  | "brunch"
  | "lunch"
  | "dinner"
  | "drinks"
  | "night"
  | "morning"
  | "afternoon"
  | "evening"
  | "day";

export type Bucket = "activity" | "meal" | "night";
export type MealSlot = "morning_meal" | "lunch" | "dinner";

interface KindWindow {
  /** Earliest start; `null` = the pace's day start. */
  earliest: number | null;
  latestStart: number;
  latestEnd: number;
}

/** Time windows (FR-O9): meals at meal times, bars/clubs at night, brunch in the morning. */
export const KIND_WINDOWS: Record<Kind, KindWindow> = {
  breakfast: { earliest: 7 * H + 30, latestStart: 10 * H, latestEnd: 11 * H + 30 },
  brunch: { earliest: 9 * H + 30, latestStart: 12 * H, latestEnd: 14 * H },
  lunch: { earliest: 11 * H + 45, latestStart: 14 * H, latestEnd: 16 * H },
  dinner: { earliest: 18 * H + 30, latestStart: 21 * H + 30, latestEnd: 24 * H },
  drinks: { earliest: 17 * H, latestStart: 23 * H, latestEnd: 26 * H },
  night: { earliest: 21 * H, latestStart: 24 * H, latestEnd: 27 * H },
  morning: { earliest: null, latestStart: 11 * H, latestEnd: 13 * H },
  afternoon: { earliest: 12 * H, latestStart: 17 * H, latestEnd: 19 * H },
  evening: { earliest: 17 * H, latestStart: 20 * H + 30, latestEnd: 23 * H },
  day: { earliest: null, latestStart: 19 * H, latestEnd: 19 * H + 30 },
};

export const KIND_DURATION: Partial<Record<Kind, number>> = {
  breakfast: 60,
  brunch: 90,
  lunch: 75,
  dinner: 105,
  drinks: 75,
  night: 150,
};

export const CATEGORY_DURATION: Record<ItemInput["category"], number> = {
  food: 90,
  drink: 75,
  nightlife: 150,
  activity: 120,
  sight: 90,
  shopping: 75,
  stay: 60,
  other: 60,
};

/** Day boundaries when no arrival/departure applies. */
export const DEFAULT_HARD_START = 7 * H;
export const DEFAULT_HARD_END = 27 * H; // 3am, so nightlife can run late
export const DEFAULT_TRAVEL_BUFFER = 60;
/** Usable day starting at/after this on arrival → dinner only (FR-O15). */
export const LATE_ARRIVAL_START = 16 * H;
/** End of the "daytime" used to scale activity caps on short days. */
export const DAYTIME_END = 19 * H + 30;

export function bucketOf(kind: Kind): Bucket {
  switch (kind) {
    case "breakfast":
    case "brunch":
    case "lunch":
    case "dinner":
      return "meal";
    case "drinks":
    case "night":
      return "night";
    default:
      return "activity";
  }
}

export function mealSlotOf(kind: Kind): MealSlot | null {
  if (kind === "breakfast" || kind === "brunch") return "morning_meal";
  if (kind === "lunch") return "lunch";
  if (kind === "dinner") return "dinner";
  return null;
}

/**
 * Candidate kinds for an item, in preference order. An empty list means the
 * engine has no time hint for it. Items without a location that only have the
 * generic "day" kind are not placed (FR-O14).
 */
export function kindsFor(item: Pick<ItemInput, "category" | "timeOfDay">): Kind[] {
  const c = item.category;
  const t: TimeOfDay | null | undefined = item.timeOfDay;
  if (t) {
    switch (t) {
      case "breakfast":
      case "brunch":
      case "lunch":
      case "dinner":
        return [t];
      case "morning":
        return c === "food" ? ["breakfast"] : ["morning"];
      case "afternoon":
        return c === "food" ? ["lunch"] : ["afternoon"];
      case "evening":
        return c === "food" ? ["dinner"] : c === "drink" ? ["drinks"] : ["evening"];
      case "night":
        return c === "food" ? ["dinner"] : ["night"];
    }
  }
  switch (c) {
    case "food":
      return ["lunch", "dinner"];
    case "drink":
      return ["drinks"];
    case "nightlife":
      return ["night"];
    default:
      return ["day"];
  }
}

export function durationFor(item: ItemInput, kind: Kind): number {
  const d = item.durationMinutes;
  if (d != null && Number.isFinite(d) && d > 0) return Math.round(d);
  return KIND_DURATION[kind] ?? CATEGORY_DURATION[item.category];
}

// ---------------------------------------------------------------------------
// Dates and hours
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function weekdayOf(isoDate: string): Weekday {
  const m = ISO_DATE.exec(isoDate);
  if (!m) throw new RangeError(`Invalid ISO date: ${isoDate}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid ISO date: ${isoDate}`);
  return d.getUTCDay() as Weekday;
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Intervals for a weekday; `null` when hours are unknown (treated as open). */
export function intervalsOn(
  item: Pick<ItemInput, "openingHours">,
  weekday: Weekday | null,
): OpeningInterval[] | null {
  if (weekday === null || !item.openingHours) return null;
  const list = item.openingHours[weekday] ?? [];
  return list
    .filter((iv) => Number.isFinite(iv.open) && Number.isFinite(iv.close) && iv.close > iv.open)
    .slice()
    .sort((a, b) => a.open - b.open || a.close - b.close);
}

/** "6pm", "7:30pm", "12pm", "12am". */
export function formatMinute(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12}${suffix}` : `${h12}:${String(mm).padStart(2, "0")}${suffix}`;
}

// ---------------------------------------------------------------------------
// Day frames
// ---------------------------------------------------------------------------

export interface DayFrame {
  index: number;
  date: string | null;
  weekday: Weekday | null;
  kind: DayKind;
  dinnerOnly: boolean;
  hardStart: number;
  hardEnd: number;
  softStart: number;
  isDeparture: boolean;
  caps: { activity: number; meal: number; night: number };
}

export function dayCount(stop: StopInput): number {
  return typeof stop.days === "number" ? Math.max(0, Math.floor(stop.days)) : stop.days.length;
}

export function arrivalStart(stop: StopInput): number | null {
  if (!stop.arrival) return null;
  return stop.arrival.minute + (stop.arrival.bufferMinutes ?? DEFAULT_TRAVEL_BUFFER);
}

export function departureEnd(stop: StopInput): number | null {
  if (!stop.departure) return null;
  return stop.departure.minute - (stop.departure.bufferMinutes ?? DEFAULT_TRAVEL_BUFFER);
}

export function buildDayFrames(stop: StopInput, pace: Pace): DayFrame[] {
  const n = dayCount(stop);
  const rules = PACE_RULES[pace];
  const frames: DayFrame[] = [];
  const arr = arrivalStart(stop);
  const dep = departureEnd(stop);
  for (let i = 0; i < n; i++) {
    const date = typeof stop.days === "number" ? null : (stop.days[i] ?? null);
    const weekday = date ? weekdayOf(date) : null;
    const isArrival = i === 0 && arr !== null;
    const isDeparture = i === n - 1 && dep !== null;
    const hardStart = isArrival ? Math.max(DEFAULT_HARD_START, arr) : DEFAULT_HARD_START;
    const hardEnd = isDeparture ? Math.min(DEFAULT_HARD_END, dep) : DEFAULT_HARD_END;
    const kind: DayKind =
      isArrival && isDeparture
        ? "arrival_departure"
        : isArrival
          ? "arrival"
          : isDeparture
            ? "departure"
            : "full";
    const dinnerOnly = isArrival && hardStart >= LATE_ARRIVAL_START;
    // Scale the activity cap by how much of the normal daytime is usable.
    const full = DAYTIME_END - rules.dayStart;
    const usable =
      Math.min(DAYTIME_END, hardEnd) - Math.max(rules.dayStart, hardStart);
    const frac = Math.max(0, Math.min(1, usable / full));
    const activityCap = dinnerOnly ? 0 : Math.round(rules.activities * frac);
    frames.push({
      index: i,
      date,
      weekday,
      kind,
      dinnerOnly,
      hardStart,
      hardEnd,
      softStart: Math.max(rules.dayStart, hardStart),
      isDeparture,
      caps: {
        activity: activityCap,
        meal: dinnerOnly ? 1 : rules.meals,
        night: dinnerOnly ? 0 : rules.night,
      },
    });
  }
  return frames;
}

/** Start-time windows `[earliest, latest]` for an item of `kind` on a day. Empty = no slot. */
export function windowsFor(
  item: ItemInput,
  kind: Kind,
  duration: number,
  frame: DayFrame,
  intervals: OpeningInterval[] | null,
): Array<[number, number]> {
  const kw = KIND_WINDOWS[kind];
  const es = Math.max(kw.earliest ?? frame.softStart, frame.hardStart);
  const ls = Math.min(kw.latestStart, kw.latestEnd - duration, frame.hardEnd - duration);
  if (es > ls) return [];
  if (!intervals) return [[es, ls]];
  const out: Array<[number, number]> = [];
  for (const iv of intervals) {
    const a = Math.max(es, iv.open);
    const b = Math.min(ls, iv.close - duration);
    if (a <= b) out.push([a, b]);
  }
  return out;
}

export function normalizeAttendees(
  attendees: readonly string[] | null | undefined,
  memberIds: readonly string[] | undefined,
): string[] | null {
  if (!attendees) return null;
  const set = [...new Set(attendees)].sort();
  if (memberIds && memberIds.length > 0 && memberIds.every((m) => set.includes(m))) return null;
  return set;
}

/** null = everyone. Two attendee sets "intersect" if someone is in both. */
export function attendeesIntersect(a: readonly string[] | null, b: readonly string[] | null): boolean {
  if (a === null || b === null) return true;
  for (const x of a) if (b.includes(x)) return true;
  return false;
}

export function hasLocation(item: Pick<ItemInput, "lat" | "lng">): boolean {
  return (
    item.lat != null && item.lng != null && Number.isFinite(item.lat) && Number.isFinite(item.lng)
  );
}
