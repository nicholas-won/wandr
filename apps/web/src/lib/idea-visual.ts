/**
 * Pure helpers for idea and save cards: the photo / thumbnail / illustration choice, the
 * "Filed under" line and the memory-jogger blurb. Safe on server and client.
 *
 * Google terms (FR-31): only place ids are stored long term. Everything read here from
 * `place_cache` is a short-lived display cache; the photo itself is streamed by
 * /api/place-photo and never stored.
 */
import type { PhotoAttribution, PlaceDisplayCache } from "@wandr/ai/places";

/** Display caches older than this are refreshed by place id before use. */
export const PLACE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type PhotoKind = "idea" | "save";

export interface CardPhoto {
  /** Same-origin route; the Google key never reaches the browser. */
  src: string;
  attributions: PhotoAttribution[];
}

export interface CardVisualFields {
  /** Google place photo, with the author credit Google requires. */
  photo: CardPhoto | null;
  /**
   * Set when the display cache predates photos or is stale: the client pings this URL once so
   * the next render can show a photo. Costs one Place Details call, never a photo.
   */
  photoPrime: string | null;
  /** "Alfama, Lisbon · Food": shows people the app sorted it. */
  locationLabel: string | null;
  /** AI summary, else the source caption's first line. Plain text only. */
  blurb: string | null;
}

/** Singular category names for the card line ("· Food"). */
export const CATEGORY_NOUN: Record<string, string> = {
  food: "Food",
  drink: "Drinks",
  nightlife: "Nightlife",
  activity: "Activity",
  sight: "Sight",
  shopping: "Shopping",
  stay: "Stay",
  transit: "Getting around",
  city: "Place to go",
  other: "Idea",
};

/** FNV-1a, 32-bit, hex. Versions photo URLs so a changed photo never shows a stale credit. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function photoSrc(kind: PhotoKind, id: string, photoName: string): string {
  return `/api/place-photo/${kind}/${id}?v=${shortHash(photoName)}`;
}

/**
 * Same-origin URL for an uploaded screenshot (FR-20), by idea / save source row id. The route
 * checks the viewer can see the item; the bytes are never public.
 */
export function screenshotSrc(kind: PhotoKind, sourceId: string): string {
  return `/api/screenshot/${kind}/${sourceId}`;
}

/** The card's fallback visual: a source thumbnail, else the uploaded screenshot. */
export function sourceThumb(
  kind: PhotoKind,
  sources: { id?: string; kind: string; thumbnailUrl: string | null; storagePath?: string | null }[],
): string | null {
  const thumb = sources.find((s) => s.thumbnailUrl)?.thumbnailUrl;
  if (thumb) return thumb;
  const shot = sources.find((s) => s.kind === "screenshot" && s.storagePath && s.id);
  return shot ? screenshotSrc(kind, shot.id!) : null;
}

export function isCacheStale(cachedAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!cachedAt) return true;
  const t = typeof cachedAt === "string" ? Date.parse(cachedAt) : cachedAt.getTime();
  return !Number.isFinite(t) || now.getTime() - t > PLACE_CACHE_MAX_AGE_MS;
}

/** Read the parts of an untyped jsonb display cache we use, defensively. */
export function readCache(raw: unknown): Pick<PlaceDisplayCache, "photo" | "neighborhood" | "locality"> & { hasPhotoField: boolean } {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<PlaceDisplayCache>;
  const photo =
    c.photo && typeof c.photo === "object" && typeof c.photo.name === "string"
      ? {
          name: c.photo.name,
          widthPx: c.photo.widthPx ?? null,
          heightPx: c.photo.heightPx ?? null,
          attributions: Array.isArray(c.photo.attributions)
            ? c.photo.attributions
                .filter((a) => a && typeof a.displayName === "string")
                .map((a) => ({ displayName: a.displayName, uri: typeof a.uri === "string" ? a.uri : null }))
            : [],
        }
      : null;
  return {
    photo,
    hasPhotoField: "photo" in c,
    neighborhood: typeof c.neighborhood === "string" ? c.neighborhood : null,
    locality: typeof c.locality === "string" ? c.locality : null,
  };
}

/**
 * Card photo fields from the display cache. A photo is offered only when its author credit is
 * known (Google requires it). Stale or pre-photo caches get a prime URL instead.
 */
export function cardPhoto(args: {
  kind: PhotoKind;
  id: string;
  placeId: string | null;
  placeCache: unknown;
  placeCachedAt: Date | string | null;
  enabled: boolean;
  now?: Date;
}): Pick<CardVisualFields, "photo" | "photoPrime"> {
  if (!args.enabled || !args.placeId) return { photo: null, photoPrime: null };
  const c = readCache(args.placeCache);
  const stale = isCacheStale(args.placeCachedAt, args.now);
  const photo = c.photo ? { src: photoSrc(args.kind, args.id, c.photo.name), attributions: c.photo.attributions } : null;
  // A stale cache with a photo is refreshed by the photo request itself.
  const needsPrime = !photo && (stale || !c.hasPhotoField || !args.placeCache);
  return { photo, photoPrime: needsPrime ? `/api/place-photo/${args.kind}/${args.id}?prime=1` : null };
}

function clean(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/** "Alfama, Lisbon · Food", from the most specific parts we know, without repeats. */
export function locationLabel(args: {
  neighborhood?: string | null;
  city?: string | null;
  stop?: string | null;
  country?: string | null;
  category: string;
}): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const p of [args.neighborhood, args.city ?? args.stop, args.city ? null : args.country]) {
    const v = clean(p);
    if (!v) continue;
    const k = v.toLocaleLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(v.slice(0, 40));
  }
  const place = parts.slice(0, 2).join(", ");
  const noun = CATEGORY_NOUN[args.category] ?? null;
  if (!place) return noun && args.category !== "other" ? noun : null;
  return noun ? `${place} · ${noun}` : place;
}

// Control, zero-width and bidi-override characters: never rendered from untrusted captions.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

/**
 * First meaningful line of an untrusted caption, for display as plain text (C-21: data only).
 * Drops URLs, @mentions-only and hashtag-only lines; trims trailing hashtag runs; ≤140 chars.
 */
export function captionLine(caption: string | null | undefined, max = 140): string | null {
  if (!caption) return null;
  const lines = caption.replace(UNSAFE_CHARS, "").split(/\r?\n/);
  for (const raw of lines) {
    let line = raw
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line || /^([#@][\p{L}\p{N}_.]+\s*)+$/u.test(line)) continue;
    if (!/[\p{L}\p{N}]/u.test(line)) continue;
    if (line.length > max) line = `${line.slice(0, max - 1).trimEnd()}…`;
    return line;
  }
  return null;
}

/** The memory-jogger: AI summary (≤140), else the caption's first line. */
export function cardBlurb(summary: string | null | undefined, caption: string | null | undefined): string | null {
  const s = clean(summary);
  if (s) return s.length > 140 ? `${s.slice(0, 139).trimEnd()}…` : s;
  return captionLine(caption);
}

/** Server-side switch: photos need a Places key (GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY). */
export function placePhotosEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.GOOGLE_PLACES_API_KEY || env.GOOGLE_MAPS_API_KEY);
}
