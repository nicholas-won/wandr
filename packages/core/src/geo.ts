/**
 * Stop geography and local time (§6.0 FR-S6, FR-S9; §6.11 FR-O8, FR-O15, FR-O16).
 * Pure helpers: parsing geocoder responses, choosing a match, deciding when a Stop needs
 * (re)geocoding, re-filing Unsorted ideas once a Stop is located, and time-zone labels.
 * The network calls live in apps/web/src/server/geocode.ts.
 */
import { distanceKm, fileIdea, type LatLng, type StopLike } from "./stops";
import { buildDayFrames, formatMinute } from "./optimizer/rules";
import type { Pace, StopInput } from "./optimizer/types";

export type GeocodeSource = "google" | "open_meteo";

export interface GeoCandidate {
  name: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode: string | null;
  /** IANA time zone when the provider returns one (Open-Meteo does; Google Text Search doesn't). */
  timeZone: string | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const validLatLng = (lat: unknown, lng: unknown) =>
  isNum(lat) && isNum(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const country = (v: unknown) => (typeof v === "string" && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null);

/** True for a time zone this runtime knows ("Europe/Lisbon"). Rejects junk from providers. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Open-Meteo geocoding (`/v1/search`) → candidates, in the provider's relevance order. */
export function parseOpenMeteoGeocoding(json: unknown): GeoCandidate[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((r: Record<string, unknown>) =>
    r && validLatLng(r.latitude, r.longitude)
      ? [
          {
            name: typeof r.name === "string" ? r.name : "",
            lat: r.latitude as number,
            lng: r.longitude as number,
            countryCode: country(r.country_code),
            timeZone: isValidTimeZone(r.timezone) ? r.timezone : null,
          },
        ]
      : [],
  );
}

/** Google Places (New) Text Search (`places.location,places.addressComponents,places.displayName`). */
export function parseGooglePlacesGeocoding(json: unknown): GeoCandidate[] {
  const places = (json as { places?: unknown } | null)?.places;
  if (!Array.isArray(places)) return [];
  return places.flatMap((p: Record<string, unknown>) => {
    const loc = p?.location as { latitude?: unknown; longitude?: unknown } | undefined;
    if (!loc || !validLatLng(loc.latitude, loc.longitude)) return [];
    const comps = Array.isArray(p.addressComponents) ? (p.addressComponents as Record<string, unknown>[]) : [];
    const c = comps.find((x) => Array.isArray(x?.types) && (x.types as unknown[]).includes("country"));
    const name = (p.displayName as { text?: unknown } | undefined)?.text;
    return [
      {
        name: typeof name === "string" ? name : "",
        lat: loc.latitude as number,
        lng: loc.longitude as number,
        countryCode: country(c?.shortText),
        timeZone: null,
      },
    ];
  });
}

/** Open-Meteo forecast with `timezone=auto` → the IANA zone at a point (free time-zone lookup). */
export function parseOpenMeteoTimeZone(json: unknown): string | null {
  const tz = (json as { timezone?: unknown } | null)?.timezone;
  return isValidTimeZone(tz) && tz !== "GMT" ? tz : null;
}

/** A candidate within this distance of the hint is "the same place" (disambiguates Portland). */
export const GEOCODE_HINT_RADIUS_KM = 150;

/**
 * Pick the geocoding match. With a hint (the Stop's current coordinates, or the middle of its
 * ideas) the nearest candidate within GEOCODE_HINT_RADIUS_KM wins, so "Portland" next to ideas in
 * Maine resolves to Maine. Otherwise the provider's top result.
 */
export function pickGeocodeCandidate(
  candidates: readonly GeoCandidate[],
  hint: LatLng | null = null,
): GeoCandidate | null {
  if (candidates.length === 0) return null;
  if (hint) {
    const near = candidates
      .map((c, i) => ({ c, i, d: distanceKm(hint, c) }))
      .filter((x) => x.d <= GEOCODE_HINT_RADIUS_KM)
      .sort((a, b) => a.d - b.d || a.i - b.i)[0];
    if (near) return near.c;
  }
  return candidates[0]!;
}

/** Google's Places terms allow caching coordinates for 30 days; refresh after that. */
export const GOOGLE_COORDS_TTL_DAYS = 30;

export interface GeocodableStop {
  name: string;
  geocodedName: string | null;
  geocodeSource: string | null;
  geocodedAt: Date | null;
}

/**
 * Should this Stop be geocoded now? Named Stops that were never tried, were renamed since, or
 * hold Google coordinates older than GOOGLE_COORDS_TTL_DAYS. The hidden unnamed Stop never is.
 */
export function stopNeedsGeocode(stop: GeocodableStop, now: Date = new Date()): boolean {
  const name = stop.name.trim();
  if (!name) return false;
  if (stop.geocodedName !== name) return true;
  if (stop.geocodeSource === "google" && stop.geocodedAt) {
    return now.getTime() - stop.geocodedAt.getTime() > GOOGLE_COORDS_TTL_DAYS * 86_400_000;
  }
  return false;
}

export interface RefileIdea {
  id: string;
  stopId: string | null;
  category: string;
  lat: number | null;
  lng: number | null;
}

/**
 * FR-S6 / FR-S3: once Stops have coordinates, Unsorted ideas with a location that now falls
 * within a Stop's radius move there. Ideas already filed stay put, ideas without a location
 * stay Unsorted, and city ideas (the Where stage's own cards) are never filed.
 */
export function refileUnsorted(
  ideas: readonly RefileIdea[],
  stops: readonly StopLike[],
  opts: { radiusKm?: number } = {},
): { ideaId: string; stopId: string }[] {
  if (!stops.some((s) => s.lat != null && s.lng != null)) return [];
  return ideas.flatMap((i) => {
    if (i.stopId != null || i.category === "city" || i.lat == null || i.lng == null) return [];
    const r = fileIdea({ lat: i.lat, lng: i.lng }, stops, opts);
    return r.kind === "stop" && r.distanceKm != null ? [{ ideaId: i.id, stopId: r.stopId }] : [];
  });
}

// ---------------------------------------------------------------------------
// Clock times (FR-O8, FR-O15) and time zones (FR-O16)
// ---------------------------------------------------------------------------

/** "18:30" / "6:30" / "1830" → minutes after midnight; null for blank or invalid. */
export function parseClock(text: string | null | undefined): number | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const m = /^(\d{1,2}):?(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes after midnight → "18:30" (the value of an `<input type="time">`). */
export function clockValue(minute: number | null | undefined): string {
  if (minute == null || !Number.isInteger(minute) || minute < 0 || minute >= 1440) return "";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Offset of `timeZone` from UTC at `at`, in minutes (Lisbon in summer: +60). */
export function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** Do two zones show a different wall-clock time at `at`? (New York vs. Toronto: no.) */
export function clocksDiffer(a: string, b: string, at: Date): boolean {
  if (a === b) return false;
  return timeZoneOffsetMinutes(a, at) !== timeZoneOffsetMinutes(b, at);
}

/** Short zone label for a header: "WEST", "EDT", or "GMT+9" when there's no abbreviation. */
export function timeZoneLabel(timeZone: string, at: Date, locale = "en-US"): string {
  const part = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/**
 * The clock a trip's deadlines and plans are read against (FR-O16): the given Stop's zone,
 * else the first Stop (route order) that has one. `name` is "" for a hidden single-city Stop.
 */
export function tripClock(
  stops: readonly { id: string; name: string; position: number; timezone: string | null }[],
  stopId: string | null = null,
): { name: string; timeZone: string } | null {
  const own = stopId ? stops.find((s) => s.id === stopId && s.timezone) : undefined;
  const pick = own ?? [...stops].sort((a, b) => a.position - b.position).find((s) => s.timezone);
  return pick?.timezone ? { name: pick.name, timeZone: pick.timezone } : null;
}

/**
 * FR-O15: the note shown on shortened travel days ("Arrive 6:30pm · plans from 7:30pm · dinner
 * only"), by day index. Uses the optimizer's own day frames so the note matches what it plans.
 */
export function travelDayNotes(stop: StopInput, pace: Pace = "balanced"): Map<number, string> {
  const out = new Map<number, string>();
  if (!stop.arrival && !stop.departure) return out;
  for (const f of buildDayFrames(stop, pace)) {
    const parts: string[] = [];
    if (f.kind === "arrival" || f.kind === "arrival_departure") {
      parts.push(`✈️ Arrive ${formatMinute(stop.arrival!.minute)}`, `plans from ${formatMinute(f.hardStart)}`);
      if (f.dinnerOnly) parts.push("dinner only");
    }
    if (f.kind === "departure" || f.kind === "arrival_departure") {
      parts.push(`🧳 Leave ${formatMinute(stop.departure!.minute)}`, `plans end by ${formatMinute(f.hardEnd)}`);
    }
    if (parts.length) out.set(f.index, parts.join(" · "));
  }
  return out;
}
