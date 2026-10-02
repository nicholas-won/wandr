/**
 * Idea library (§6.12): pure sorting, grouping and "trip-ready" logic.
 *
 * - FR-L3 auto-sort with user overrides (§5 "Saved idea": country → city or region → category).
 * - FR-L6 city grid grouped by country ("Lisbon · 14"); LB-8 region/country-level saves get their
 *   own tile rather than being forced into a city.
 * - FR-L10 "trip-ready" threshold (default 8+ places incl. ≥1 food and ≥1 activity [OPEN]);
 *   permanently closed places never count (LB-9, FR-L18).
 * - FR-L11 preselection when starting a trip from saves (Must-do saves preselected).
 */
import type { VoteValue } from "./domain";

/** Mirrors the idea_category enum. */
export type LibraryCategory =
  | "city"
  | "stay"
  | "transit"
  | "food"
  | "drink"
  | "nightlife"
  | "activity"
  | "sight"
  | "shopping"
  | "other";

export const LIBRARY_CATEGORIES: readonly LibraryCategory[] = [
  "food",
  "drink",
  "activity",
  "sight",
  "nightlife",
  "stay",
  "shopping",
  "transit",
  "city",
  "other",
];

/** Display names, in the order of FR-L3 (food, drinks, stays, activities, sights, nightlife, other). */
export const CATEGORY_LABEL: Record<LibraryCategory, string> = {
  food: "Food",
  drink: "Drinks",
  stay: "Stays",
  activity: "Activities",
  sight: "Sights",
  nightlife: "Nightlife",
  shopping: "Shopping",
  transit: "Getting around",
  city: "Places to go",
  other: "Other",
};

export type ExtractionStateLike =
  | "queued"
  | "processing"
  | "resolved"
  | "needs_review"
  | "not_a_place"
  | "failed";

/** The fields of a saved idea this module needs. */
export interface SaveLike {
  id: string;
  extraction: ExtractionStateLike;
  category: LibraryCategory;
  country: string | null;
  regionOrCity: string | null;
  countryOverride?: string | null;
  regionOrCityOverride?: string | null;
  categoryOverride?: LibraryCategory | null;
  permanentlyClosed: boolean;
  placeId?: string | null;
}

export interface EffectiveSort {
  /** ISO 3166-1 alpha-2, upper case, or null when unknown. */
  country: string | null;
  /** City or region (LB-8), or null for country-level saves. */
  city: string | null;
  category: LibraryCategory;
}

function clean(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/** §5: the user's override wins over the AI's auto-sort, field by field. */
export function effectiveSort(s: SaveLike): EffectiveSort {
  const country = clean(s.countryOverride) ?? clean(s.country);
  return {
    country: country ? country.toUpperCase() : null,
    city: clean(s.regionOrCityOverride) ?? clean(s.regionOrCity),
    category: s.categoryOverride ?? s.category,
  };
}

/** Case/accent-insensitive comparison key for city names. */
export function foldName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Separator between country and city in a place key. Never appears in a folded name. */
const SEP = "~";

/**
 * Stable key for a tile: `PT~lisbon`, `JP~` (country-level, LB-8), `~lisbon` (city with unknown
 * country) or `~` (unsorted). Safe to put in a URL after encodeURIComponent.
 */
export function placeKey(country: string | null, city: string | null): string {
  return `${country ? country.toUpperCase() : ""}${SEP}${city ? foldName(city) : ""}`;
}

export function parsePlaceKey(key: string): { country: string | null; cityFolded: string | null } | null {
  const i = key.indexOf(SEP);
  if (i < 0 || key.indexOf(SEP, i + 1) >= 0) return null;
  const country = key.slice(0, i);
  const city = key.slice(i + 1);
  if (country && !/^[A-Z]{2}$/.test(country)) return null;
  return { country: country || null, cityFolded: city || null };
}

/** Is this save still being sorted? (FR-L20 queued, or AI in progress.) */
export function isPending(s: Pick<SaveLike, "extraction">): boolean {
  return s.extraction === "processing" || s.extraction === "queued";
}

/**
 * A "place" for trip-ready counting: a resolved (or "Is this right?") single place that is
 * still open. Non-places (FR-25), failures, pending saves and whole-city ideas don't count;
 * permanently closed places never count (LB-9).
 */
export function countsAsPlace(s: SaveLike): boolean {
  if (s.permanentlyClosed) return false;
  if (s.extraction !== "resolved" && s.extraction !== "needs_review") return false;
  return effectiveSort(s).category !== "city";
}

export interface TripReadyRule {
  minPlaces: number;
  /** Categories that satisfy "at least 1 food". */
  foodCategories: readonly LibraryCategory[];
  minFood: number;
  /** Categories that satisfy "at least 1 activity". */
  activityCategories: readonly LibraryCategory[];
  minActivity: number;
}

/**
 * FR-L10 default (8+ places incl. ≥1 food and ≥1 activity). [OPEN] §14: the threshold is a
 * starting number. Strict reading: only `food` is food (not drinks) and only `activity` is an
 * activity (not sights).
 */
export const DEFAULT_TRIP_READY: TripReadyRule = {
  minPlaces: 8,
  foodCategories: ["food"],
  minFood: 1,
  activityCategories: ["activity"],
  minActivity: 1,
};

export interface TripReadiness {
  ready: boolean;
  places: number;
  food: number;
  activities: number;
  /** What's missing, for an in-app hint ("2 more places"). Empty when ready. */
  missing: { places: number; food: number; activities: number };
}

/** FR-L10: is this city's (or region's) set of saves "trip-ready"? */
export function tripReadiness(saves: readonly SaveLike[], rule: TripReadyRule = DEFAULT_TRIP_READY): TripReadiness {
  const counted = saves.filter(countsAsPlace);
  const cat = (s: SaveLike) => effectiveSort(s).category;
  const food = counted.filter((s) => rule.foodCategories.includes(cat(s))).length;
  const activities = counted.filter((s) => rule.activityCategories.includes(cat(s))).length;
  const missing = {
    places: Math.max(0, rule.minPlaces - counted.length),
    food: Math.max(0, rule.minFood - food),
    activities: Math.max(0, rule.minActivity - activities),
  };
  return {
    ready: missing.places === 0 && missing.food === 0 && missing.activities === 0,
    places: counted.length,
    food,
    activities,
    missing,
  };
}

export interface PlaceTile<T extends SaveLike = SaveLike> {
  key: string;
  country: string | null;
  /** Display name of the city/region (first spelling seen), or null for a country-level tile. */
  city: string | null;
  level: "city" | "country" | "unsorted";
  saves: T[];
  /** Count shown on the tile ("Lisbon · 14"): every save, including closed and pending ones. */
  count: number;
  readiness: TripReadiness;
}

export interface CountryGroup<T extends SaveLike = SaveLike> {
  /** ISO code, or null for "Somewhere" (unknown country). */
  country: string | null;
  count: number;
  tiles: PlaceTile<T>[];
}

/**
 * FR-L6: group saves into country → city/region tiles. Tiles sort by count (desc) then name;
 * countries by total count. The unsorted tile (no country, no city) always comes last.
 * Saves keep their input order inside a tile.
 */
export function groupLibrary<T extends SaveLike>(
  saves: readonly T[],
  rule: TripReadyRule = DEFAULT_TRIP_READY,
): CountryGroup<T>[] {
  const tiles = new Map<string, PlaceTile<T>>();
  for (const s of saves) {
    const e = effectiveSort(s);
    const key = placeKey(e.country, e.city);
    let t = tiles.get(key);
    if (!t) {
      t = {
        key,
        country: e.country,
        city: e.city,
        level: e.city ? "city" : e.country ? "country" : "unsorted",
        saves: [],
        count: 0,
        readiness: tripReadiness([], rule),
      };
      tiles.set(key, t);
    }
    t.saves.push(s);
    t.count++;
  }
  for (const t of tiles.values()) t.readiness = tripReadiness(t.saves, rule);

  const byCountry = new Map<string, CountryGroup<T>>();
  for (const t of tiles.values()) {
    const ck = t.country ?? "";
    let g = byCountry.get(ck);
    if (!g) {
      g = { country: t.country, count: 0, tiles: [] };
      byCountry.set(ck, g);
    }
    g.tiles.push(t);
    g.count += t.count;
  }
  const levelRank = { city: 0, country: 1, unsorted: 2 } as const;
  const groups = [...byCountry.values()];
  for (const g of groups) {
    g.tiles.sort(
      (a, b) =>
        levelRank[a.level] - levelRank[b.level] ||
        b.count - a.count ||
        (a.city ?? "").localeCompare(b.city ?? ""),
    );
  }
  return groups.sort(
    (a, b) =>
      Number(a.country === null) - Number(b.country === null) ||
      b.count - a.count ||
      (a.country ?? "").localeCompare(b.country ?? ""),
  );
}

/** Saves that belong to a tile key (for /library/[place]). */
export function savesForPlace<T extends SaveLike>(saves: readonly T[], key: string): T[] {
  return saves.filter((s) => {
    const e = effectiveSort(s);
    return placeKey(e.country, e.city) === key;
  });
}

/** FR-L6: a tile's saves grouped by category, in LIBRARY_CATEGORIES order. */
export function groupByCategory<T extends SaveLike>(saves: readonly T[]): { category: LibraryCategory; saves: T[] }[] {
  const m = new Map<LibraryCategory, T[]>();
  for (const s of saves) {
    const c = effectiveSort(s).category;
    m.set(c, [...(m.get(c) ?? []), s]);
  }
  return LIBRARY_CATEGORIES.filter((c) => m.has(c)).map((category) => ({ category, saves: m.get(category)! }));
}

/**
 * FR-L11: which saves start out selected when making a trip from a city or board.
 * - Must-do saves are preselected; permanently closed and Skip saves never are.
 * - [OPEN] If none of the saves has a someday priority at all, every open, sorted save is
 *   preselected (otherwise "one tap" would make an empty trip).
 */
export function preselectForTrip(
  saves: readonly (SaveLike & { priority?: VoteValue | null })[],
): string[] {
  const eligible = saves.filter((s) => !s.permanentlyClosed && !isPending(s) && s.extraction !== "failed");
  const must = eligible.filter((s) => s.priority === "must");
  if (must.length) return must.map((s) => s.id);
  if (eligible.some((s) => s.priority)) return [];
  return eligible.filter((s) => s.extraction !== "not_a_place").map((s) => s.id);
}

/**
 * FR-1a / FR-L11: suggested trip name and Stop for a city, region or country. Returns null when
 * nothing is known (the caller falls back to "name your trip").
 */
export function suggestTrip(
  place: { city: string | null; countryName: string | null },
): { name: string; stopName: string | null } | null {
  if (place.city) return { name: `${place.city} trip`.slice(0, 80), stopName: place.city };
  if (place.countryName) return { name: `${place.countryName} trip`.slice(0, 80), stopName: null };
  return null;
}

/** "Lisbon · 14" (FR-L6). */
export function tileLabel(name: string, count: number): string {
  return `${name} · ${count}`;
}
