/**
 * Place search for "wrong place? fix" (FR-23, FR-32) and adding a place by hand (FR-L20).
 *
 * Google Places (New) Text Search runs here, server-side, so the key never reaches the browser.
 * Picks never count as AI imports (FR-L22) and never touch the AI pipeline. Only the place id is
 * stored long term; the rest is the short-lived display cache (FR-31).
 *
 * Cost control: a simple per-person fixed-window limit (PLACE_SEARCHES_PER_MINUTE) on top of the
 * client-side debounce. It's per server instance, which is enough for the POC.
 */
import {
  categoryFromPlaceTypes,
  createMemoryRateLimiter,
  createPlacesClient,
  FAR_FROM_STOP_KM,
  isPlaceId,
  nearestStop,
  toSearchResult,
  type GeoPoint,
  type PlaceCandidate,
  type PlaceSearchResult,
  type PlacesClient,
  type RateLimiter,
} from "@wandr/ai";

export const PLACE_SEARCHES_PER_MINUTE = 20;
export const PLACE_SEARCH_RESULTS = 5;
/** Bias radius around a Stop (C-5). */
const BIAS_RADIUS_M = 30_000;

export class PlacePickError extends Error {
  constructor(
    public readonly code: "not_connected" | "not_found" | "invalid" | "rate_limited",
    message: string = code,
  ) {
    super(message);
    this.name = "PlacePickError";
  }
}

export type PlaceSearchOutcome =
  | { connected: false }
  | { connected: true; results: PlaceSearchResult[] }
  | { connected: true; rateLimited: true };

let limiter: RateLimiter = createMemoryRateLimiter(PLACE_SEARCHES_PER_MINUTE, 60_000);

export function setPlaceSearchLimiterForTests(l: RateLimiter | undefined) {
  limiter = l ?? createMemoryRateLimiter(PLACE_SEARCHES_PER_MINUTE, 60_000);
}

/** The Places client, or null when no Google key is configured ("place search isn't connected"). */
export function placesClient(override?: PlacesClient | null): PlacesClient | null {
  return override === undefined ? createPlacesClient() : override;
}

export function placeSearchConnected(): boolean {
  return createPlacesClient() !== null;
}

/** Text Search, 5 results, biased to `near` when known. `actor` keys the rate limit. */
export async function searchPlaces(
  args: { actor: string; query: string; near?: GeoPoint | null },
  deps: { places?: PlacesClient | null; limiter?: RateLimiter } = {},
): Promise<PlaceSearchOutcome> {
  const places = placesClient(deps.places);
  if (!places) return { connected: false };
  const query = args.query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (query.length < 2) return { connected: true, results: [] };
  const r = await (deps.limiter ?? limiter).take(`place-search:${args.actor}`);
  if (!r.ok) return { connected: true, rateLimited: true };
  const found = await places.searchText({
    textQuery: query,
    locationBias: args.near ? { center: args.near, radiusM: BIAS_RADIUS_M } : undefined,
    maxResults: PLACE_SEARCH_RESULTS,
  });
  return { connected: true, results: found.slice(0, PLACE_SEARCH_RESULTS).map(toSearchResult) };
}

/**
 * Fetch the picked place by id from Google (never trust display data from the browser).
 * Throws PlacePickError.
 */
export async function fetchPickedPlace(placeId: string, override?: PlacesClient | null): Promise<PlaceCandidate> {
  const places = placesClient(override);
  if (!places) throw new PlacePickError("not_connected", "Place search isn't connected.");
  if (!isPlaceId(placeId)) throw new PlacePickError("invalid");
  const c = await places.getPlace(placeId);
  if (!c || !c.display.name) throw new PlacePickError("not_found", "Couldn't find that place. Try another.");
  return c;
}

/** The fields a manual pick sets, shared by trip ideas and library saves. */
export function pickedFields(c: PlaceCandidate) {
  const d = c.display;
  return {
    title: d.name.slice(0, 120),
    category: categoryFromPlaceTypes(d.primaryType, d.types),
    placeId: c.placeId,
    placeCache: d,
    placeCachedAt: new Date(),
    lat: d.location?.lat ?? null,
    lng: d.location?.lng ?? null,
    priceLevel: d.priceLevel,
    permanentlyClosed: d.businessStatus === "CLOSED_PERMANENTLY", // FR-33
    city: d.locality,
    country: d.countryCode?.toUpperCase() ?? null,
    // A person picked it: it's right by definition (FR-23).
    extraction: "resolved" as const,
    confidence: 1,
    candidates: null,
  };
}

/**
 * The Stop a picked place belongs to (same rules as the AI path, C-5): the nearest Stop with
 * coordinates within FAR_FROM_STOP_KM; farther away → Unsorted (null, FR-S3). With no Stop
 * coordinates at all, a one-Stop trip keeps everything; otherwise `fallback`.
 */
export function stopForPick(
  location: GeoPoint | null,
  tripStops: { id: string; name: string; lat: number | null; lng: number | null }[],
  fallback: string | null,
): string | null {
  const withCoords = tripStops.filter((s) => s.lat != null && s.lng != null);
  if (location && withCoords.length) {
    const ns = nearestStop(location, withCoords);
    return ns && ns.distanceKm <= FAR_FROM_STOP_KM ? ns.stop.id : null;
  }
  if (tripStops.length === 1) return tripStops[0]!.id;
  return fallback;
}

/** Bias point for a trip search: the idea's Stop, else the only Stop with coordinates. */
export function biasFor(
  tripStops: { id: string; lat: number | null; lng: number | null }[],
  stopId: string | null,
): GeoPoint | null {
  const s = stopId ? tripStops.find((x) => x.id === stopId) : undefined;
  if (s && s.lat != null && s.lng != null) return { lat: s.lat, lng: s.lng };
  const withCoords = tripStops.filter((x) => x.lat != null && x.lng != null);
  return withCoords.length === 1 ? { lat: withCoords[0]!.lat!, lng: withCoords[0]!.lng! } : null;
}
