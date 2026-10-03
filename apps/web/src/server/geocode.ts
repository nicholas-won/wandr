/**
 * Stop geocoding (FR-S6, FR-S9, FR-O11, FR-O16): a Stop's name → coordinates, country and
 * IANA time zone, in the background, so trip creation stays instant.
 *
 * Providers (§7a):
 * - Google Places API (New) Text Search when GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY is set.
 *   Google's terms allow caching coordinates for 30 days, so Google results are refreshed after
 *   that (core `stopNeedsGeocode`). The time zone still comes from Open-Meteo (free) below.
 * - Otherwise Open-Meteo geocoding (GeoNames data, CC BY 4.0), which returns the time zone too.
 * - GEOCODER=off disables it (e2e); tests inject a fake. Nothing here ever throws to a caller:
 *   a network failure leaves the Stop as it was, to be retried on a later trip load.
 *
 * Inputs are the Stop's own name (organizer text) sent as a query parameter to fixed hosts; no
 * user-supplied URLs are fetched (C-20).
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { asService, ideas, stops, type Db } from "@wandr/db";
import {
  parseGooglePlacesGeocoding,
  parseOpenMeteoGeocoding,
  parseOpenMeteoTimeZone,
  pickGeocodeCandidate,
  refileUnsorted,
  stopNeedsGeocode,
  type GeoCandidate,
  type GeocodeSource,
  type LatLng,
} from "@wandr/core";

export interface Geocoder {
  source: GeocodeSource;
  /** Candidates for a city name, best first. Throws on network/HTTP errors (caller retries later). */
  search(name: string, hint: LatLng | null): Promise<GeoCandidate[]>;
  /** IANA zone at a point, or null. Throws on network/HTTP errors. */
  timeZoneAt(p: LatLng): Promise<string | null>;
}

const OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const GOOGLE_TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";
const TIMEOUT_MS = 4000;

type FetchFn = typeof fetch;

async function getJson(doFetch: FetchFn, url: string, init?: RequestInit): Promise<unknown> {
  const res = await doFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`geocode_http_${res.status}`);
  return res.json();
}

async function openMeteoTimeZone(doFetch: FetchFn, p: LatLng): Promise<string | null> {
  const url = `${OPEN_METEO_FORECAST}?latitude=${p.lat.toFixed(4)}&longitude=${p.lng.toFixed(4)}&timezone=auto&forecast_days=1`;
  return parseOpenMeteoTimeZone(await getJson(doFetch, url));
}

export function openMeteoGeocoder(doFetch: FetchFn = fetch): Geocoder {
  return {
    source: "open_meteo",
    async search(name) {
      const url = `${OPEN_METEO_GEOCODE}?name=${encodeURIComponent(name.slice(0, 80))}&count=5&language=en&format=json`;
      return parseOpenMeteoGeocoding(await getJson(doFetch, url));
    },
    timeZoneAt: (p) => openMeteoTimeZone(doFetch, p),
  };
}

export function googleGeocoder(apiKey: string, doFetch: FetchFn = fetch): Geocoder {
  return {
    source: "google",
    async search(name, hint) {
      const body: Record<string, unknown> = { textQuery: name.slice(0, 80), pageSize: 5, languageCode: "en" };
      if (hint) body.locationBias = { circle: { center: { latitude: hint.lat, longitude: hint.lng }, radius: 50_000 } };
      const json = await getJson(doFetch, GOOGLE_TEXT_SEARCH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.displayName,places.location,places.addressComponents",
        },
        body: JSON.stringify(body),
      });
      return parseGooglePlacesGeocoding(json);
    },
    // Free time-zone lookup; the Google Time Zone API would need its own billing (§7a).
    timeZoneAt: (p) => openMeteoTimeZone(doFetch, p),
  };
}

/** The configured geocoder, or null (GEOCODER=off, or under Vitest unless injected). */
export function createGeocoder(env: Record<string, string | undefined> = process.env, doFetch: FetchFn = fetch): Geocoder | null {
  const mode = (env.GEOCODER ?? "auto").toLowerCase();
  if (mode === "off" || (mode === "auto" && env.VITEST)) return null;
  const key = env.GOOGLE_PLACES_API_KEY || env.GOOGLE_MAPS_API_KEY;
  if (mode === "google" || (mode === "auto" && key)) return key ? googleGeocoder(key, doFetch) : null;
  return openMeteoGeocoder(doFetch);
}

export interface GeocodeResult {
  /** Stops whose geocoding finished (match or no match). */
  geocoded: string[];
  /** Ideas moved out of Unsorted (FR-S6). */
  refiled: string[];
}

/**
 * Geocode every Stop of a trip that needs it, then re-file Unsorted ideas into Stops that now
 * have coordinates. Runs as the service (background job). Never throws.
 */
export async function geocodeStops(
  db: Db,
  tripId: string,
  deps: { geocoder?: Geocoder | null; now?: Date } = {},
): Promise<GeocodeResult> {
  const out: GeocodeResult = { geocoded: [], refiled: [] };
  const geocoder = deps.geocoder === undefined ? createGeocoder() : deps.geocoder;
  if (!geocoder) return out;
  const now = deps.now ?? new Date();
  try {
    const stopRows = await asService(db, (tx) =>
      tx.select().from(stops).where(eq(stops.tripId, tripId)).orderBy(asc(stops.position)),
    );
    const todo = stopRows.filter((s) => stopNeedsGeocode(s, now));
    if (todo.length === 0) return out;
    const located = await asService(db, (tx) =>
      tx
        .select({ stopId: ideas.stopId, lat: ideas.lat, lng: ideas.lng })
        .from(ideas)
        .where(eq(ideas.tripId, tripId)),
    );
    for (const s of todo) {
      const name = s.name.trim();
      let patch: Partial<typeof stops.$inferInsert>;
      try {
        const hint = s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : middleOf(located.filter((i) => i.stopId === s.id));
        const pick = pickGeocodeCandidate(await geocoder.search(name, hint), hint);
        if (pick) {
          // A failed zone lookup throws: the whole Stop is retried later rather than saved half-done.
          const timeZone = pick.timeZone ?? (await geocoder.timeZoneAt(pick));
          patch = {
            lat: pick.lat,
            lng: pick.lng,
            countryCode: pick.countryCode,
            ...(timeZone ? { timezone: timeZone } : {}),
          };
        } else {
          // No match ("Our cabin"): remember we tried this name; keep whatever the Stop had.
          patch = {};
        }
      } catch (err) {
        console.warn("[geocode] lookup failed; will retry later", s.id, (err as Error).message);
        continue;
      }
      // Only if the name hasn't changed meanwhile (a rename re-queues its own lookup).
      const done = await asService(db, (tx) =>
        tx
          .update(stops)
          .set({ ...patch, geocodedName: name, geocodeSource: geocoder.source, geocodedAt: now })
          .where(and(eq(stops.id, s.id), eq(stops.name, s.name)))
          .returning({ id: stops.id }),
      );
      if (done.length) out.geocoded.push(s.id);
    }
    if (out.geocoded.length) out.refiled = await refileTripIdeas(db, tripId);
  } catch (err) {
    console.error("[geocode] failed", tripId, err);
  }
  return out;
}

function middleOf(points: { lat: number | null; lng: number | null }[]): LatLng | null {
  const ps = points.filter((p): p is LatLng => p.lat != null && p.lng != null);
  if (!ps.length) return null;
  return { lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length, lng: ps.reduce((a, p) => a + p.lng, 0) / ps.length };
}

/** FR-S6: move located Unsorted ideas into the Stop they fall in. Filed ideas stay put. */
export async function refileTripIdeas(db: Db, tripId: string): Promise<string[]> {
  return asService(db, async (tx) => {
    const stopRows = await tx
      .select({ id: stops.id, name: stops.name, isDefault: stops.isDefault, position: stops.position, lat: stops.lat, lng: stops.lng })
      .from(stops)
      .where(eq(stops.tripId, tripId));
    const unsorted = await tx
      .select({ id: ideas.id, stopId: ideas.stopId, category: ideas.category, lat: ideas.lat, lng: ideas.lng })
      .from(ideas)
      .where(and(eq(ideas.tripId, tripId), isNull(ideas.stopId)));
    const moves = refileUnsorted(unsorted, stopRows);
    for (const m of moves) {
      await tx
        .update(ideas)
        .set({ stopId: m.stopId })
        .where(and(eq(ideas.id, m.ideaId), isNull(ideas.stopId)));
    }
    return moves.map((m) => m.ideaId);
  });
}

// ---------------------------------------------------------------------------
// Queueing
// ---------------------------------------------------------------------------

const RECENT = ((globalThis as { __wandrGeocodeQueued?: Map<string, number> }).__wandrGeocodeQueued ??= new Map());
/** Lazy backfill asks at most this often per trip per server instance. */
const REQUEUE_MS = 10 * 60 * 1000;

/**
 * Queue geocoding for a trip's Stops (after() or Inngest, server/jobs.ts). Safe anywhere: outside
 * a request scope (tests, scripts) it does nothing. `force` skips the per-trip throttle (a Stop
 * was just created or renamed).
 */
export async function queueStopGeocode(tripId: string, opts: { force?: boolean } = {}): Promise<void> {
  const last = RECENT.get(tripId);
  if (!opts.force && last && Date.now() - last < REQUEUE_MS) return;
  if (!createGeocoder()) return;
  RECENT.set(tripId, Date.now());
  try {
    const { enqueue } = await import("./jobs");
    const { EVENTS } = await import("@/inngest/client");
    await enqueue({ name: EVENTS.stopsGeocode, data: { tripId } });
  } catch {
    // No request scope (after() unavailable): the next trip load picks it up.
  }
}
