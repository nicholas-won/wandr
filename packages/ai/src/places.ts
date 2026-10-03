/**
 * Google Places API (New) Text Search client (FR-31, FR-32, FR-33, C-5, C-6, C-7, C-24).
 *
 * Google's terms let us store only the place id long term. Everything else comes back in
 * a separate `display` object that callers must treat as a short-lived cache
 * (ideas.place_cache + place_cached_at) and refresh on view.
 */
import type { GeoPoint } from "./intake";
import type { StopContext } from "./extract";

export const PLACES_BASE_URL = "https://places.googleapis.com/v1";
export const PLACES_SEARCH_URL = `${PLACES_BASE_URL}/places:searchText`;

/** Place fields we request. Text Search prefixes each with `places.`; Place Details doesn't. */
const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "businessStatus",
  "priceLevel",
  "rating",
  "userRatingCount",
  "primaryType",
  "types",
  "googleMapsUri",
  "websiteUri",
  "movedPlaceId",
  "addressComponents",
  // Only the first photo's resource name + attributions are kept (display cache, never bytes).
  "photos",
];
export const SEARCH_FIELD_MASK = PLACE_FIELDS.map((f) => `places.${f}`).join(",");
export const DETAILS_FIELD_MASK = PLACE_FIELDS.join(",");

/** Google place ids are URL-safe tokens. */
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
/** `places/{placeId}/photos/{photoRef}`: validated before it is put into a URL path. */
const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]{10,300}\/photos\/[A-Za-z0-9_-]{10,1200}$/;

export function isPlaceId(id: string): boolean {
  return PLACE_ID_RE.test(id);
}

export function isPhotoName(name: string): boolean {
  return PHOTO_NAME_RE.test(name);
}

/** Who took a place photo. Google requires showing this next to the photo. */
export interface PhotoAttribution {
  displayName: string;
  /** Contributor profile link (Google Maps only), or null. */
  uri: string | null;
}

/** First place photo: resource name (short-lived, refreshed with details) + author credit. */
export interface PlacePhotoRef {
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  attributions: PhotoAttribution[];
}

export type BusinessStatus = "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";

/** Short-lived display cache: do NOT persist beyond Google's caching terms. */
export interface PlaceDisplayCache {
  name: string;
  address: string | null;
  location: GeoPoint | null;
  rating: number | null;
  userRatingCount: number | null;
  /** 0–4 (free … very expensive), null if unknown. */
  priceLevel: number | null;
  primaryType: string | null;
  types: string[];
  mapsUri: string | null;
  websiteUri: string | null;
  businessStatus: BusinessStatus;
  /** From addressComponents: ISO country code and locality (library sorting fallback). */
  countryCode: string | null;
  locality: string | null;
  /** Neighborhood or sublocality ("Alfama"), for the card's "filed under" line. Optional (older caches). */
  neighborhood?: string | null;
  /**
   * First place photo (display only). Optional: caches written before photos were requested
   * lack it, and the photo route refreshes those by place id.
   */
  photo?: PlacePhotoRef | null;
  fetchedAt: string;
}

export interface PlaceCandidate {
  /** The only field we may store long term. */
  placeId: string;
  movedPlaceId: string | null;
  display: PlaceDisplayCache;
}

export interface TextSearchRequest {
  textQuery: string;
  /** Bias towards a Stop (C-5). Radius metres, max 50 000. */
  locationBias?: { center: GeoPoint; radiusM?: number };
  languageCode?: string;
  maxResults?: number;
}

export interface PlaceSearch {
  searchText(req: TextSearchRequest): Promise<PlaceCandidate[]>;
}

export interface PlacesClient extends PlaceSearch {
  /** Place Details (New) by id; null when Google no longer knows the id (404). */
  getPlace(placeId: string, opts?: { languageCode?: string }): Promise<PlaceCandidate | null>;
  /**
   * Place Photo (New) media. Returns Google's response (image bytes after the redirect) for the
   * caller to stream; never stored. Throws PlacesError on HTTP errors (e.g. an expired name).
   */
  fetchPhoto(photoName: string, opts?: { maxWidthPx?: number; maxHeightPx?: number }): Promise<Response>;
}

export class PlacesError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlacesError";
  }
}

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  types?: string[];
  googleMapsUri?: string;
  websiteUri?: string;
  movedPlaceId?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  photos?: Array<{
    name?: string;
    widthPx?: number;
    heightPx?: number;
    authorAttributions?: Array<{ displayName?: string; uri?: string; photoUri?: string }>;
  }>;
}

const CONTRIBUTOR_URI_RE = /^https:\/\/(www\.)?maps\.google\.com\/|^https:\/\/(www\.)?google\.com\/maps\//;

export function mapPhoto(photos: RawPlace["photos"]): PlacePhotoRef | null {
  const first = photos?.find((ph) => typeof ph.name === "string" && isPhotoName(ph.name));
  if (!first?.name) return null;
  return {
    name: first.name,
    widthPx: typeof first.widthPx === "number" ? first.widthPx : null,
    heightPx: typeof first.heightPx === "number" ? first.heightPx : null,
    attributions: (first.authorAttributions ?? [])
      .filter((a) => typeof a.displayName === "string" && a.displayName.trim())
      .slice(0, 3)
      .map((a) => ({
        displayName: a.displayName!.trim().slice(0, 80),
        // Rendered as a link only when it points at a Google Maps contributor page.
        uri: typeof a.uri === "string" && CONTRIBUTOR_URI_RE.test(a.uri) ? a.uri : null,
      })),
  };
}

export function mapRawPlace(p: RawPlace, now: Date = new Date()): PlaceCandidate | null {
  if (!p.id) return null;
  const loc =
    typeof p.location?.latitude === "number" && typeof p.location?.longitude === "number"
      ? { lat: p.location.latitude, lng: p.location.longitude }
      : null;
  const status = (["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"] as const).find((s) => s === p.businessStatus);
  return {
    placeId: p.id,
    movedPlaceId: p.movedPlaceId ?? null,
    display: {
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? null,
      location: loc,
      rating: typeof p.rating === "number" ? p.rating : null,
      userRatingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      priceLevel: p.priceLevel !== undefined ? (PRICE_LEVELS[p.priceLevel] ?? null) : null,
      primaryType: p.primaryType ?? null,
      types: p.types ?? [],
      mapsUri: p.googleMapsUri ?? null,
      websiteUri: p.websiteUri ?? null,
      businessStatus: status ?? "UNKNOWN",
      countryCode: p.addressComponents?.find((c) => c.types?.includes("country"))?.shortText ?? null,
      locality:
        p.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ??
        p.addressComponents?.find((c) => c.types?.includes("postal_town"))?.longText ??
        null,
      neighborhood:
        p.addressComponents?.find((c) => c.types?.includes("neighborhood"))?.longText ??
        p.addressComponents?.find((c) => c.types?.includes("sublocality_level_1") || c.types?.includes("sublocality"))?.longText ??
        null,
      photo: mapPhoto(p.photos),
      fetchedAt: now.toISOString(),
    },
  };
}

export interface PlacesClientOptions {
  apiKey?: string;
  /** Injected for tests; defaults to global fetch (Google's fixed host, not user input). */
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

/**
 * Create a Places client, or null when no key is configured (GOOGLE_PLACES_API_KEY,
 * falling back to GOOGLE_MAPS_API_KEY). Callers must handle null gracefully.
 */
export function createPlacesClient(
  opts: PlacesClientOptions = {},
  env: Record<string, string | undefined> = process.env,
): PlacesClient | null {
  const apiKey = opts.apiKey ?? env.GOOGLE_PLACES_API_KEY ?? env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const now = opts.now ?? (() => new Date());
  return {
    async searchText(req) {
      const body: Record<string, unknown> = {
        textQuery: req.textQuery,
        pageSize: Math.min(Math.max(req.maxResults ?? 5, 1), 20),
      };
      if (req.languageCode) body.languageCode = req.languageCode;
      if (req.locationBias) {
        body.locationBias = {
          circle: {
            center: { latitude: req.locationBias.center.lat, longitude: req.locationBias.center.lng },
            radius: Math.min(Math.max(req.locationBias.radiusM ?? 30_000, 1), 50_000),
          },
        };
      }
      const res = await doFetch(PLACES_SEARCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          "x-goog-fieldmask": SEARCH_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new PlacesError(res.status, `Places searchText failed: ${res.status}`);
      const json = (await res.json()) as { places?: RawPlace[] };
      return (json.places ?? []).map((p) => mapRawPlace(p, now())).filter((p): p is PlaceCandidate => !!p);
    },
    async getPlace(placeId, o = {}) {
      if (!isPlaceId(placeId)) throw new PlacesError(400, "invalid place id");
      const url = new URL(`${PLACES_BASE_URL}/places/${placeId}`);
      if (o.languageCode) url.searchParams.set("languageCode", o.languageCode);
      const res = await doFetch(url.toString(), {
        method: "GET",
        headers: { "x-goog-api-key": apiKey, "x-goog-fieldmask": DETAILS_FIELD_MASK },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new PlacesError(res.status, `Places details failed: ${res.status}`);
      return mapRawPlace((await res.json()) as RawPlace, now());
    },
    async fetchPhoto(photoName, o = {}) {
      if (!isPhotoName(photoName)) throw new PlacesError(400, "invalid photo name");
      const url = new URL(`${PLACES_BASE_URL}/${photoName}/media`);
      const clamp = (n: number) => String(Math.min(Math.max(Math.round(n), 1), 4800));
      url.searchParams.set("maxWidthPx", clamp(o.maxWidthPx ?? 800));
      if (o.maxHeightPx) url.searchParams.set("maxHeightPx", clamp(o.maxHeightPx));
      // Key in a header, not the query string, so it never lands in logs or redirect URLs.
      const res = await doFetch(url.toString(), {
        method: "GET",
        headers: { "x-goog-api-key": apiKey },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new PlacesError(res.status, `Places photo failed: ${res.status}`);
      return res;
    },
  };
}

// ---------------------------------------------------------------------------
// Choosing a candidate
// ---------------------------------------------------------------------------

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestStop(
  point: GeoPoint,
  stops: StopContext[],
): { stop: StopContext; distanceKm: number } | null {
  let best: { stop: StopContext; distanceKm: number } | null = null;
  for (const s of stops) {
    if (s.lat == null || s.lng == null) continue;
    const d = haversineKm(point, { lat: s.lat, lng: s.lng });
    if (!best || d < best.distanceKm) best = { stop: s, distanceKm: d };
  }
  return best;
}

function foldName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\b(the|restaurant|cafe|bar|hotel)\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Token Jaccard similarity of two place names, 0..1 (accent/case-insensitive). */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(foldName(a).split(" ").filter(Boolean));
  const tb = new Set(foldName(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jacc = inter / (ta.size + tb.size - inter);
  // Containment counts too ("Joe's Pizza" vs "Joe's Pizza Broadway").
  const contain = inter / Math.min(ta.size, tb.size);
  return Math.max(jacc, contain * 0.9);
}

export interface PlaceChoice {
  candidate: PlaceCandidate;
  /** Other branches of the same chain near the Stop (FR-32 "1 of N nearby, change"). */
  chain: { branchCount: number; alternatives: PlaceCandidate[] } | null;
  nameSimilarity: number;
  /** Nearest Stop to the chosen candidate. */
  nearestStop: { stopId: string; distanceKm: number } | null;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
}

/**
 * Pick the best candidate. Chains (several candidates sharing a name) → branch nearest
 * the reference point / Stop (FR-32, C-6). Otherwise Google's relevance order wins.
 */
export function choosePlace(
  candidates: PlaceCandidate[],
  opts: { nameHint: string; stops: StopContext[]; near?: GeoPoint | null },
): PlaceChoice | null {
  if (!candidates.length) return null;
  const first = candidates[0]!;
  const sameName = candidates.filter((c) => foldName(c.display.name) === foldName(first.display.name));
  let chosen = first;
  let chain: PlaceChoice["chain"] = null;
  if (sameName.length > 1) {
    const ref = opts.near ?? null;
    const dist = (c: PlaceCandidate) => {
      if (!c.display.location) return Infinity;
      if (ref) return haversineKm(ref, c.display.location);
      return nearestStop(c.display.location, opts.stops)?.distanceKm ?? Infinity;
    };
    const sorted = [...sameName].sort((a, b) => dist(a) - dist(b));
    chosen = sorted[0]!;
    chain = { branchCount: sameName.length, alternatives: sorted.slice(1) };
  }
  const ns = chosen.display.location ? nearestStop(chosen.display.location, opts.stops) : null;
  return {
    candidate: chosen,
    chain,
    nameSimilarity: nameSimilarity(opts.nameHint, chosen.display.name),
    nearestStop: ns ? { stopId: ns.stop.id, distanceKm: ns.distanceKm } : null,
    permanentlyClosed: chosen.display.businessStatus === "CLOSED_PERMANENTLY",
    temporarilyClosed: chosen.display.businessStatus === "CLOSED_TEMPORARILY",
  };
}
