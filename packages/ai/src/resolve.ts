/**
 * Pipeline orchestrator: pasted input → idea card data (FR-20–26, FR-30–35).
 *
 *   classify → canonicalize URL → (cache) → fetch metadata → extract (Claude | heuristic)
 *   → Places match per place (biased to Stops) → Stop assignment → confidence / review flags
 *
 * All I/O is injected (`ResolveDeps`) so callers (Inngest job, tests, evals) control it.
 */
import { createHash } from "node:crypto";
import type { StructuredModel } from "./claude";
import {
  extractPlaces,
  type ExtractedPlace,
  type ExtractionKind,
  type IdeaCategory,
  type ScreenshotInput,
  type StopContext,
  type TripContext,
} from "./extract";
import { fetchSourceMetadata, type GeoPoint, type SourceMetadata } from "./intake";
import { choosePlace, nearestStop, type PlaceCandidate, type PlaceDisplayCache, type PlacesClient } from "./places";
import { safeFetch, type Fetcher } from "./safe-fetch";
import { classifyInput, isShortLink, normalizeUrl, type PastedKind } from "./url";

/** FR-23: below this, the card shows "Is this right?". */
export const REVIEW_THRESHOLD = 0.6;
/** C-5: a match farther than this from every Stop is suspicious. */
export const FAR_FROM_STOP_KM = 50;

// ---------------------------------------------------------------------------
// Injected infrastructure
// ---------------------------------------------------------------------------

export interface ResolveCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export interface RateLimiter {
  /** Consume one unit for `key`. */
  take(key: string): Promise<{ ok: boolean; retryAfterMs?: number }>;
}

export class RateLimitedError extends Error {
  constructor(
    public readonly key: string,
    public readonly retryAfterMs?: number,
  ) {
    super(`Rate limited: ${key}`);
    this.name = "RateLimitedError";
  }
}

/** In-process cache (dev/tests). Production should back this with Postgres/Redis. */
export function createMemoryCache(now: () => number = Date.now): ResolveCache & { size(): number } {
  const m = new Map<string, { v: unknown; exp: number }>();
  return {
    async get(k) {
      const e = m.get(k);
      if (!e) return null;
      if (e.exp <= now()) {
        m.delete(k);
        return null;
      }
      return structuredClone(e.v);
    },
    async set(k, v, ttl) {
      m.set(k, { v: structuredClone(v), exp: now() + ttl * 1000 });
    },
    size: () => m.size,
  };
}

/** Fixed-window limiter (dev/tests). */
export function createMemoryRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): RateLimiter {
  const m = new Map<string, { count: number; reset: number }>();
  return {
    async take(key) {
      const t = now();
      let e = m.get(key);
      if (!e || e.reset <= t) {
        e = { count: 0, reset: t + windowMs };
        m.set(key, e);
      }
      if (e.count >= limit) return { ok: false, retryAfterMs: e.reset - t };
      e.count++;
      return { ok: true };
    },
  };
}

export interface ResolveDeps {
  fetcher?: Fetcher;
  /** null/undefined → heuristic extraction. */
  model?: StructuredModel | null;
  /** null/undefined → no Places match (cards stay placeless, confidence unchanged). */
  places?: PlacesClient | null;
  cache?: ResolveCache | null;
  rateLimiter?: RateLimiter | null;
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolveInput {
  /** Whatever the user pasted / texted: a link, link + text, or plain text. */
  raw: string;
  screenshot?: ScreenshotInput;
  /** Rate-limit keys, e.g. [`user:${memberId}`, `trip:${tripId}`] (FR-34). */
  rateLimitKeys?: string[];
}

export interface ResolvedPlace {
  name: string;
  category: IdeaCategory;
  summary: string;
  cityHint: string | null;
  /** ISO 3166-1 alpha-2 (library auto-sort, FR-L3). */
  country: string | null;
  /** City, or region for region-level saves (LB-8). */
  regionOrCity: string | null;
  addressHint: string | null;
  searchQuery: string;
  priceLevel: number | null;
  evidence: ExtractedPlace["evidence"];
  /** Final confidence after Places matching (0..1). */
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
  /** Null = "Unsorted / new city?" (FR-S3). */
  stopId: string | null;
  distanceToStopKm: number | null;
  /** Storable long-term (Google ToS). */
  placeId: string | null;
  /** Short-lived display cache — store in ideas.place_cache with place_cached_at. */
  display: PlaceDisplayCache | null;
  location: GeoPoint | null;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
  /** FR-32 chain branch choice. */
  chain: { branchCount: number; alternativePlaceIds: string[] } | null;
}

export type ResolveState = "resolved" | "needs_review" | "not_a_place" | "failed";

export interface ResolvedSource {
  kind: PastedKind;
  url: string | null;
  normalizedUrl: string | null;
  caption: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  creatorHandle: string | null;
  fetchStatus: SourceMetadata["fetchStatus"];
}

export interface ResolvedIdea {
  /** Maps to ideas.extraction (extraction_state enum). */
  state: ResolveState;
  kind: ExtractionKind;
  source: ResolvedSource;
  places: ResolvedPlace[];
  /** First place (single-place cards). For listicles, ask the sharer (FR-24, D26). */
  primary: ResolvedPlace | null;
  confidence: number;
  needsReview: boolean;
  isNonPlaceReason: string | null;
  suggestedTripName: string | null;
  suspiciousInstructions: boolean;
  extractor: "claude" | "heuristic";
  model: string | null;
  warnings: string[];
  /** Served from the URL cache (FR-34). */
  fromCache: boolean;
  /**
   * FR-L22: true only for a new extraction the person started (not a cache hit, not a
   * failed extraction, not a typed plain-text idea). Used for the daily AI-import counter.
   */
  countsAsImport: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_VERSION = "v1";
const META_TTL_S = 7 * 24 * 3600;
const RESOLVE_TTL_S = 24 * 3600; // includes Places display data; keep short (C-24)

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 24);
}

export function stopsFingerprint(stops: StopContext[]): string {
  return hash(
    JSON.stringify(
      [...stops]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((s) => [s.id, s.name, s.lat ?? null, s.lng ?? null]),
    ),
  );
}

function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Match a free-text city hint to a Stop by name (exact or contained). */
export function stopByName(cityHint: string | null, stops: StopContext[]): StopContext | null {
  if (!cityHint) return null;
  const h = fold(cityHint);
  if (!h) return null;
  return (
    stops.find((s) => fold(s.name) === h) ??
    stops.find((s) => {
      const n = fold(s.name);
      return n.length >= 3 && (h.includes(n) || n.includes(h));
    }) ??
    null
  );
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function biasPoint(p: ExtractedPlace, stops: StopContext[]): GeoPoint | null {
  if (p.location) return p.location;
  const s = stopByName(p.cityHint, stops);
  if (s && s.lat != null && s.lng != null) return { lat: s.lat, lng: s.lng };
  // Single-Stop trips: bias there by default (C-5).
  const withCoords = stops.filter((x) => x.lat != null && x.lng != null);
  if (withCoords.length === 1) return { lat: withCoords[0]!.lat!, lng: withCoords[0]!.lng! };
  return null;
}

async function resolvePlace(
  p: ExtractedPlace,
  kind: ExtractionKind,
  trip: TripContext,
  places: PlacesClient | null,
  warnings: string[],
): Promise<ResolvedPlace> {
  const reasons: string[] = [];
  let confidence = p.confidence;
  let placeId: string | null = p.placeId ?? null;
  let display: PlaceDisplayCache | null = null;
  let location: GeoPoint | null = p.location ?? null;
  let permanentlyClosed = false;
  let temporarilyClosed = false;
  let chain: ResolvedPlace["chain"] = null;

  if (places && p.searchQuery && p.name !== "Dropped pin") {
    const near = biasPoint(p, trip.stops);
    let candidates: PlaceCandidate[] = [];
    try {
      candidates = await places.searchText({
        textQuery: p.searchQuery,
        locationBias: near ? { center: near, radiusM: 30_000 } : undefined,
        maxResults: 5,
      });
    } catch {
      warnings.push("places_error");
    }
    // A Maps link with a known place id: prefer that exact candidate.
    if (p.placeId) {
      const exact = candidates.find((c) => c.placeId === p.placeId);
      if (exact) candidates = [exact, ...candidates.filter((c) => c !== exact)];
    }
    const choice = choosePlace(candidates, { nameHint: p.name, stops: trip.stops, near: p.location ?? null });
    if (choice) {
      const sim = choice.nameSimilarity;
      const exactId = p.placeId && choice.candidate.placeId === p.placeId;
      if (exactId || sim >= 0.5 || kind === "city") {
        placeId = choice.candidate.placeId;
        display = choice.candidate.display;
        location = display.location ?? location;
        permanentlyClosed = choice.permanentlyClosed;
        temporarilyClosed = choice.temporarilyClosed;
        if (choice.chain) {
          chain = {
            branchCount: choice.chain.branchCount,
            alternativePlaceIds: choice.chain.alternatives.map((a) => a.placeId),
          };
        }
        // Agreement between the model and Places raises confidence a little; a weak name match lowers it.
        confidence = exactId || sim >= 0.8 ? Math.min(1, confidence + 0.1) : confidence * 0.85;
        if (choice.candidate.movedPlaceId) warnings.push("place_moved");
      } else {
        // Places found something else: don't attach it (C-21: model output validated against Places).
        confidence *= 0.6;
        reasons.push("places_name_mismatch");
      }
    } else {
      confidence *= 0.7;
      reasons.push("no_places_match");
    }
  }

  // Stop assignment: coordinates first, then the city hint.
  let stopId: string | null = null;
  let distanceToStopKm: number | null = null;
  if (location) {
    const ns = nearestStop(location, trip.stops);
    if (ns) {
      distanceToStopKm = Math.round(ns.distanceKm * 10) / 10;
      if (ns.distanceKm <= FAR_FROM_STOP_KM) stopId = ns.stop.id;
      else if (confidence < 0.85) reasons.push("far_from_stops"); // C-5
    }
  }
  if (!stopId && !location) stopId = stopByName(p.cityHint, trip.stops)?.id ?? null;
  if (!stopId && trip.stops.length === 1 && !location && kind !== "city") stopId = trip.stops[0]!.id;

  if (permanentlyClosed) reasons.push("permanently_closed");
  if (confidence < REVIEW_THRESHOLD) reasons.push("low_confidence");
  confidence = Math.round(confidence * 100) / 100;

  return {
    name: display?.name && kind !== "city" ? display.name : p.name,
    category: p.category,
    summary: p.summary,
    cityHint: p.cityHint,
    country: p.country ?? display?.countryCode ?? null,
    regionOrCity: p.regionOrCity ?? (kind !== "city" ? display?.locality ?? null : null),
    addressHint: p.addressHint,
    searchQuery: p.searchQuery,
    priceLevel: p.priceLevel ?? display?.priceLevel ?? null,
    evidence: p.evidence,
    confidence,
    needsReview: reasons.some((r) => r !== "permanently_closed"),
    reviewReasons: reasons,
    stopId,
    distanceToStopKm,
    placeId,
    display,
    location,
    permanentlyClosed,
    temporarilyClosed,
    chain,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Resolve pasted input into idea-card data. Never throws for remote failures (the card
 * must still appear, FR-23); throws RateLimitedError when a limiter key is exhausted.
 */
export async function resolveIdea(
  input: ResolveInput,
  tripCtx?: TripContext | null,
  deps: ResolveDeps = {},
): Promise<ResolvedIdea> {
  // Library saves (FR-L1) have no trip: same pipeline, no Stops.
  const trip: TripContext = tripCtx ?? { stops: [] };
  const fetcher = deps.fetcher ?? safeFetch;
  const cache = deps.cache ?? null;
  const classified = classifyInput(input.raw);

  // Cache lookup is by normalized URL (FR-34). Short links are resolved inside intake,
  // so we key on the post-canonicalization URL via the metadata cache below.
  const metaKeyFor = (normUrl: string) => `ai:${CACHE_VERSION}:meta:${hash(normUrl)}`;
  const resolveKeyFor = (normUrl: string) =>
    `ai:${CACHE_VERSION}:resolve:${hash(normUrl)}:${stopsFingerprint(trip.stops)}:${deps.model ? "m" : "h"}`;

  const cacheable = !!classified.url && !input.screenshot;
  let meta: SourceMetadata | null = null;

  if (cacheable && cache) {
    if (!isShortLink(classified.url!)) {
      const norm = normalizeUrl(classified.url!);
      const hit = (await cache.get(resolveKeyFor(norm))) as ResolvedIdea | null;
      if (hit) return { ...hit, fromCache: true, countsAsImport: false };
      meta = (await cache.get(metaKeyFor(norm))) as SourceMetadata | null;
      if (meta) meta = { ...meta, userText: classified.text };
    }
  }

  for (const key of input.rateLimitKeys ?? []) {
    if (!deps.rateLimiter) break;
    const r = await deps.rateLimiter.take(key);
    if (!r.ok) throw new RateLimitedError(key, r.retryAfterMs);
  }

  if (!meta) {
    meta = await fetchSourceMetadata(classified, { fetcher });
    if (cache && meta.normalizedUrl && meta.fetchStatus !== "failed") {
      const hit = (await cache.get(resolveKeyFor(meta.normalizedUrl))) as ResolvedIdea | null;
      if (hit && !input.screenshot) return { ...hit, fromCache: true, countsAsImport: false };
      await cache.set(metaKeyFor(meta.normalizedUrl), meta, META_TTL_S);
    }
  }

  const outcome = await extractPlaces({ meta, trip, screenshot: input.screenshot }, deps.model ?? null);
  const warnings = [...meta.warnings, ...outcome.warnings];
  const { result } = outcome;

  const toResolve = result.kind === "not_a_place" ? [] : result.places;
  const places = await mapLimit(toResolve, 4, (p) => resolvePlace(p, result.kind, trip, deps.places ?? null, warnings));

  const primary = places[0] ?? null;
  let state: ResolveState;
  if (result.kind === "not_a_place") state = "not_a_place";
  else if (places.length === 0) state = meta.fetchStatus === "failed" && !meta.userText ? "failed" : "needs_review";
  else if (result.kind === "listicle") state = places.every((p) => !p.needsReview) ? "resolved" : "needs_review";
  else state = primary!.needsReview ? "needs_review" : "resolved";

  const confidence =
    result.kind === "not_a_place"
      ? 0
      : places.length
        ? Math.round((places.reduce((s, p) => s + p.confidence, 0) / places.length) * 100) / 100
        : 0;

  const resolved: ResolvedIdea = {
    state,
    kind: result.kind,
    source: {
      kind: meta.kind,
      url: meta.url,
      normalizedUrl: meta.normalizedUrl,
      caption: meta.caption ?? null,
      title: meta.title ?? null,
      thumbnailUrl: meta.thumbnailUrl ?? null,
      creatorHandle: meta.creatorHandle ?? null,
      fetchStatus: meta.fetchStatus,
    },
    places,
    primary,
    confidence,
    needsReview: state === "needs_review",
    isNonPlaceReason: result.isNonPlaceReason,
    suggestedTripName: result.suggestedTripName,
    suspiciousInstructions: result.suspiciousInstructions,
    extractor: outcome.extractor,
    model: outcome.model ?? null,
    warnings: [...new Set(warnings)],
    fromCache: false,
    countsAsImport: state !== "failed" && (meta.kind !== "text" || !!input.screenshot),
  };

  if (cache && meta.normalizedUrl && !input.screenshot && state !== "failed") {
    await cache.set(resolveKeyFor(meta.normalizedUrl), { ...resolved, countsAsImport: false }, RESOLVE_TTL_S);
  }
  return resolved;
}
