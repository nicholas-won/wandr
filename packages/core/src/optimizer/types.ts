/**
 * Types for the "Arrange my days" engine (REQUIREMENTS.md §6.11, FR-O1–FR-O18).
 *
 * All times are integer minutes after local midnight in the Stop's timezone
 * (FR-O16). Values >= 1440 mean "after midnight" on the same plan day
 * (e.g. 1500 = 1:00am, used for nightlife).
 */

export type ItemCategory =
  | "food"
  | "drink"
  | "nightlife"
  | "activity"
  | "sight"
  | "shopping"
  | "stay"
  | "other";

/** Optional meal / time-of-day hint (FR-O9, FR-O14). */
export type TimeOfDay =
  | "breakfast"
  | "brunch"
  | "lunch"
  | "dinner"
  | "morning"
  | "afternoon"
  | "evening"
  | "night";

export type Pace = "relaxed" | "balanced" | "packed";

export type TravelMode = "walk" | "transit" | "drive";

/** 0 = Sunday … 6 = Saturday (same as `Date#getUTCDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface LatLng {
  lat: number;
  lng: number;
}

/** A point handed to the travel-time function. `id` is the item id, or "lodging". */
export interface TravelPoint extends LatLng {
  id: string;
}

export interface TravelLeg {
  minutes: number;
  mode: TravelMode;
}

/**
 * Injected travel-time source. Real routing data (e.g. a precomputed matrix
 * keyed by `from.id`/`to.id`) is supplied by the caller; the engine never
 * invents travel times beyond the documented haversine fallback.
 */
export type TravelTimeFn = (from: TravelPoint, to: TravelPoint) => TravelLeg;

/** One opening interval in local minutes. `close` may exceed 1440 (past midnight). */
export interface OpeningInterval {
  open: number;
  close: number;
}

/**
 * Weekly opening hours. A missing or empty weekday means closed that day.
 * Leave `openingHours` itself undefined/null when hours are unknown (treated as open).
 */
export type OpeningHours = Partial<Record<Weekday, readonly OpeningInterval[]>>;

export interface StopInput {
  /** IANA timezone; passed through. All minutes are already local (FR-O16). */
  timezone: string;
  /** Number of days (undated "Day 1, Day 2…", FR-O13) or ISO dates (YYYY-MM-DD). */
  days: number | readonly string[];
  /** Decided lodging; days start and end near it (FR-O7). */
  lodging?: LatLng | null;
  /** Arrival on day 0 at `minute` (FR-O8, FR-O15). `bufferMinutes` (default 60) to reach lodging. */
  arrival?: { minute: number; bufferMinutes?: number } | null;
  /** Departure on the last day at `minute`. Plans end `bufferMinutes` (default 60) before. */
  departure?: { minute: number; bufferMinutes?: number } | null;
}

export interface ItemInput {
  id: string;
  title: string;
  category: ItemCategory;
  lat?: number | null;
  lng?: number | null;
  durationMinutes?: number | null;
  openingHours?: OpeningHours | null;
  timeOfDay?: TimeOfDay | null;
  /** Reservation / ticket time (FR-O8). Never moved. */
  fixedStart?: { dayIndex: number; minute: number } | null;
  /** User lock (FR-O4). `startMinute: null` locks the day only. Never moved. */
  locked?: { dayIndex: number; startMinute: number | null } | null;
  /** `rank`: lower is better (1 = top of the FR-44 ranking). */
  priority: { must: boolean; rank: number };
  /** `planned` items are arranged; `suggested` Must-dos only if there's room (FR-O1). */
  status: "planned" | "suggested";
  /** Subset of members going (FR-O10). Absent/null = everyone. */
  attendees?: readonly string[] | null;
  /** Surprise mode: members who must not see this item. Passed through untouched. */
  hiddenFrom?: readonly string[] | null;
}

export interface ArrangeInput {
  stop: StopInput;
  items: readonly ItemInput[];
  pace?: Pace;
  travelTime?: TravelTimeFn;
  /** All member ids attending the Stop. Items whose attendees cover all of them count as "everyone". */
  memberIds?: readonly string[];
}

export type MealName = "breakfast" | "brunch" | "lunch" | "dinner";

/** Structured reason facts (FR-O2). Claude may rewrite the English; the facts come from here. */
export type ReasonCode =
  | { code: "locked" }
  | { code: "reservation"; minute: number }
  | { code: "time_unassigned" }
  | { code: "suggested" }
  | { code: "parallel"; attendeeCount: number }
  | { code: "arrival_day"; dinnerOnly: boolean }
  | { code: "departure_day" }
  | { code: "closes_at"; minute: number }
  | { code: "meal_window"; meal: MealName; nearLodging: boolean }
  | { code: "clustered"; nearbyCount: number }
  | { code: "time_of_day"; timeOfDay: "morning" | "afternoon" | "evening" | "night" }
  | { code: "near_lodging" }
  | { code: "must_do" }
  | { code: "no_location" };

export interface PlannedItem {
  itemId: string;
  /** null only for a day-locked item the engine couldn't time; it stays on its day. */
  startMinute: number | null;
  durationMinutes: number;
  /** From the previous located item (or lodging). null when either end has no location. */
  travelFromPrev: TravelLeg | null;
  /** Default English reason, e.g. "Grouped with 2 other spots nearby". */
  reason: string;
  reasonCodes: ReasonCode[];
  /** 0 = main plan; >0 = a parallel side plan for a subset of people (FR-O10). */
  track: number;
  /** Locked or reservation: re-running never moves it (FR-O4). */
  pinned: boolean;
  /** A shortlisted Must-do added because there was room (FR-O1). */
  suggested: boolean;
  attendees: string[] | null;
  /** Pass-through for surprise mode; the UI renders "Surprise 🎁" to these members. */
  hiddenFrom: string[];
}

export type DayKind = "full" | "arrival" | "departure" | "arrival_departure";

export interface PlanDay {
  dayIndex: number;
  date: string | null;
  weekday: Weekday | null;
  kind: DayKind;
  /** Late arrival: only dinner is planned (FR-O15). */
  dinnerOnly: boolean;
  /** Usable local window for this day after arrival/departure buffers. */
  window: { start: number; end: number };
  items: PlannedItem[];
  /** Travel from the last main-plan item back to lodging, when lodging is known. */
  returnToLodging: TravelLeg | null;
}

export type DidntFitReason = "closed" | "too_far" | "day_full" | "no_slot";
export type DidntFitSuggestion = "swap" | "add_day" | "drop" | "place_manually";

export interface DidntFitItem {
  itemId: string;
  reason: DidntFitReason;
  suggestion: DidntFitSuggestion;
  detail: string;
  /** When suggestion is "swap": the lower-priority item to swap with. */
  swapWithItemId?: string;
}

export type WarningCode =
  | "closed_that_day"
  | "outside_hours"
  | "far_apart"
  | "packed_day"
  | "overlaps_arrival"
  | "overlaps_departure"
  | "overlap"
  | "stay_skipped"
  | "duplicate_item";

export interface PlanWarning {
  code: WarningCode;
  detail: string;
  dayIndex?: number;
  itemId?: string;
  otherItemId?: string;
}

export interface PlanBasis {
  version: 1;
  /** Per planned item: hash of scheduling facts (`d`) and of its attendees (`a`). */
  items: Record<string, { d: string; a: string }>;
  membersHash: string;
  stopHash: string;
}

export interface Plan {
  pace: Pace;
  days: PlanDay[];
  didntFit: DidntFitItem[];
  warnings: PlanWarning[];
  /** Snapshot for the "Plan may be out of date" detector (FR-O17). */
  basis: PlanBasis;
}

/** Minimal plan shape accepted by `checkPlan` (e.g. rebuilt from plan_items rows). */
export interface PlanLike {
  pace?: Pace;
  days: ReadonlyArray<{
    dayIndex: number;
    items: ReadonlyArray<{
      itemId: string;
      startMinute: number | null;
      durationMinutes: number;
      track?: number;
    }>;
  }>;
}
