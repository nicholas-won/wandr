/**
 * Link intake: fetch public metadata for a pasted link (FR-20, FR-26, FR-30 step 1, §9).
 *
 * - TikTok / YouTube: public oEmbed (caption/title, author, thumbnail).
 * - Instagram: Open Graph tags on the post page. IG oEmbed has needed no token since
 *   June 2026 but has returned no thumbnail or author since Nov 2025 (§9, C-3), so OG
 *   is the source for thumbnail, caption and handle.
 * - Google Maps: parsed from the URL itself (place name, coords, cid, query) (C-15).
 * - Anything else: generic Open Graph / meta / JSON-LD parse.
 *
 * Everything returned here is UNTRUSTED (C-21): it must only ever reach a model inside
 * the untrusted-data block built by extract.ts.
 */
import type { Fetcher, SafeResponse } from "./safe-fetch";
import { SafeFetchError } from "./safe-fetch";
import { canonicalizeUrl, classifyInput, hostKind, type ClassifiedInput, type PastedKind } from "./url";

export type FetchStatus = "ok" | "private" | "not_found" | "blocked" | "failed" | "skipped";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MapsLinkInfo {
  /** place | search | pin (coords only) | directions | list | unknown */
  type: "place" | "search" | "pin" | "directions" | "list" | "unknown";
  placeName?: string;
  query?: string;
  cid?: string;
  /** Google place id (ChIJ…) when present in the URL. */
  placeId?: string;
  /** Place coordinates (from !3d!4d or q=lat,lng), else the viewport centre. */
  location?: GeoPoint;
}

export interface LodgingInfo {
  provider: "airbnb" | "vrbo" | "booking" | "hotels" | "expedia" | "other";
  checkIn?: string;
  checkOut?: string;
  guests?: number;
}

export interface SourceMetadata {
  kind: PastedKind;
  /** URL as pasted (after short-link resolution), or null for plain text. */
  url: string | null;
  normalizedUrl: string | null;
  /** Text the user typed alongside the link (or the whole input for kind=text). */
  userText: string;
  title?: string;
  /** Post caption (TikTok oEmbed title, IG og:description caption, YouTube title). */
  caption?: string;
  description?: string;
  siteName?: string;
  authorName?: string;
  /** Creator handle without "@", lowercased (§11: store from day one). */
  creatorHandle?: string;
  thumbnailUrl?: string;
  hashtags: string[];
  /** Explicit location tag (e.g. 📍 line, og place tags, JSON-LD address locality). */
  locationTag?: string;
  geo?: GeoPoint;
  maps?: MapsLinkInfo;
  lodging?: LodgingInfo;
  /** Structured place data from JSON-LD (hotels, restaurants publish this). */
  jsonLdPlace?: { name?: string; type?: string; address?: string; locality?: string; geo?: GeoPoint };
  fetchStatus: FetchStatus;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Small parsing helpers (exported for tests)
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith("#x")) {
      const cp = parseInt(lower.slice(2), 16);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    if (lower.startsWith("#")) {
      const cp = parseInt(lower.slice(1), 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[lower] ?? m;
  });
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(tag);
  if (!m) return undefined;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
}

export interface HtmlMeta {
  title?: string;
  meta: Record<string, string>;
  jsonLd: unknown[];
}

/** Regex-based <head> parser: <title>, <meta property|name|itemprop content>, JSON-LD. */
export function parseHtmlMeta(html: string): HtmlMeta {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content !== undefined && !(key in meta)) meta[key] = content.trim();
  }
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const jsonLd: unknown[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(m[1]!.trim());
      if (Array.isArray(parsed)) jsonLd.push(...parsed);
      else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"]))
        jsonLd.push(...(parsed as { "@graph": unknown[] })["@graph"]);
      else jsonLd.push(parsed);
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return { title: t ? decodeEntities(t[1]!.replace(/\s+/g, " ").trim()) : undefined, meta, jsonLd };
}

export function extractHashtags(text: string | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,60})/gu)) out.add(m[1]!.toLowerCase());
  return [...out];
}

/** "📍 Name, City" / "Location: X" style tags in captions. */
export function extractLocationTag(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const pin = /(?:📍|📌|🗺️?|Location:|Loc:|Where:)\s*([^\n#@|•]{2,80})/iu.exec(text);
  if (pin) return pin[1]!.trim().replace(/[\s,.;:–-]+$/u, "");
  return undefined;
}

function cleanHandle(h: string | undefined): string | undefined {
  if (!h) return undefined;
  const m = /@?([A-Za-z0-9._]{1,40})/.exec(h.trim());
  return m ? m[1]!.toLowerCase().replace(/\.+$/, "") : undefined;
}

function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function validGeo(lat?: number, lng?: number): GeoPoint | undefined {
  if (lat === undefined || lng === undefined) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// Google Maps URL parsing (C-15)
// ---------------------------------------------------------------------------

function plusDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " ")).trim();
  } catch {
    return s.replace(/\+/g, " ").trim();
  }
}

function parseLatLng(s: string | null | undefined): GeoPoint | undefined {
  if (!s) return undefined;
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(s);
  return m ? validGeo(Number(m[1]), Number(m[2])) : undefined;
}

export function parseGoogleMapsUrl(raw: string): MapsLinkInfo {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { type: "unknown" };
  }
  const path = u.pathname;
  const qp = u.searchParams;
  const info: MapsLinkInfo = { type: "unknown" };

  // Viewport "@lat,lng,zoom"
  const at = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(path);
  const viewport = at ? validGeo(Number(at[1]), Number(at[2])) : undefined;
  // Exact place coords in the data blob "!3dLAT!4dLNG"
  const d34 = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(path + u.search);
  const exact = d34 ? validGeo(Number(d34[1]), Number(d34[2])) : undefined;
  // Place id "!1sChIJ…" / ftid / query_place_id / place_id
  const pid = /!1s(ChIJ[A-Za-z0-9_-]+)/.exec(path) ?? /!19s(ChIJ[A-Za-z0-9_-]+)/.exec(path);
  info.placeId = qp.get("query_place_id") ?? qp.get("place_id") ?? pid?.[1] ?? undefined;
  const cid = qp.get("cid") ?? /!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i.exec(path)?.[1];
  if (cid) info.cid = cid.startsWith("0x") ? BigInt(cid).toString() : cid;

  const placeM = /\/maps\/place\/([^/@]+)/.exec(path);
  const searchM = /\/maps\/search\/([^/@]+)/.exec(path);
  if (/\/maps\/dir\//.test(path) || qp.get("api") === "1" && /\/maps\/dir/.test(path)) {
    info.type = "directions";
    const dest = qp.get("destination");
    if (dest) {
      info.location = parseLatLng(dest);
      if (!info.location) info.placeName = dest;
    }
  } else if (/\/maps\/(placelists|lists)\b|\/maps\/@.*\/data=.*!4m\d+!11m/.test(path)) {
    info.type = "list";
  } else if (placeM) {
    info.type = "place";
    const name = plusDecode(placeM[1]!);
    const asCoords = parseLatLng(name);
    if (asCoords) {
      info.type = "pin";
      info.location = asCoords;
    } else {
      info.placeName = name;
    }
  } else if (searchM) {
    const q = plusDecode(searchM[1]!);
    const coords = parseLatLng(q);
    if (coords) {
      info.type = "pin";
      info.location = coords;
    } else {
      info.type = "search";
      info.query = q;
    }
  } else if (qp.get("q") || qp.get("query")) {
    const q = (qp.get("q") ?? qp.get("query"))!.trim();
    const coords = parseLatLng(q);
    if (coords) {
      info.type = "pin";
      info.location = coords;
    } else {
      info.type = info.placeId || info.cid ? "place" : "search";
      info.query = q;
      if (info.type === "place") info.placeName = q;
    }
  } else if (qp.get("ll")) {
    info.type = "pin";
    info.location = parseLatLng(qp.get("ll"));
  } else if (info.cid || info.placeId) {
    info.type = "place";
  } else if (viewport) {
    info.type = "pin";
  }
  info.location ??= exact ?? viewport;
  if (exact) info.location = exact;
  return info;
}

// ---------------------------------------------------------------------------
// Lodging links (C-16)
// ---------------------------------------------------------------------------

export function detectLodging(raw: string): LodgingInfo | undefined {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  const h = u.hostname.toLowerCase();
  let provider: LodgingInfo["provider"] | undefined;
  if (/(^|\.)airbnb\.[a-z.]+$/.test(h) && /\/rooms\/|\/h\//.test(u.pathname)) provider = "airbnb";
  else if (/(^|\.)vrbo\.com$/.test(h) || /(^|\.)homeaway\./.test(h)) provider = "vrbo";
  else if (/(^|\.)booking\.com$/.test(h) && /\/hotel\//.test(u.pathname)) provider = "booking";
  else if (/(^|\.)hotels\.com$/.test(h)) provider = "hotels";
  else if (/(^|\.)expedia\.[a-z.]+$/.test(h) && /hotel/i.test(u.pathname)) provider = "expedia";
  if (!provider) return undefined;
  const qp = u.searchParams;
  const date = (k: string[]) => k.map((x) => qp.get(x)).find((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ?? undefined;
  const guests = num(qp.get("adults") ?? qp.get("guests") ?? qp.get("group_adults") ?? undefined);
  return {
    provider,
    checkIn: date(["check_in", "checkin", "checkIn", "startDate", "chkin"]),
    checkOut: date(["check_out", "checkout", "checkOut", "endDate", "chkout"]),
    guests: guests && guests > 0 && guests < 100 ? guests : undefined,
  };
}

// ---------------------------------------------------------------------------
// Platform fetchers
// ---------------------------------------------------------------------------

function statusFromHttp(status: number): FetchStatus {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "private";
  if (status === 404 || status === 410) return "not_found";
  return "failed";
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function handleFromUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const m = /\/@([A-Za-z0-9._-]{1,40})/.exec(raw);
  return m ? cleanHandle(m[1]) : undefined;
}

async function fetchTikTok(meta: SourceMetadata, fetcher: Fetcher): Promise<void> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(meta.url!)}`;
  const res = await fetcher(endpoint, { headers: { accept: "application/json" }, maxBytes: 256 * 1024 });
  meta.fetchStatus = statusFromHttp(res.status);
  // TikTok oEmbed returns 400 for private / removed videos.
  if (res.status === 400) meta.fetchStatus = "private";
  meta.creatorHandle ??= handleFromUrl(meta.url);
  if (meta.fetchStatus !== "ok") return;
  const j = parseJson(res.body);
  if (!j) {
    meta.fetchStatus = "failed";
    return;
  }
  meta.caption = str(j.title);
  meta.authorName = str(j.author_name);
  meta.creatorHandle = cleanHandle(str(j.author_unique_id)) ?? handleFromUrl(str(j.author_url)) ?? meta.creatorHandle;
  meta.thumbnailUrl = str(j.thumbnail_url);
  meta.siteName = "TikTok";
}

async function fetchYouTube(meta: SourceMetadata, fetcher: Fetcher): Promise<void> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(meta.url!)}`;
  const res = await fetcher(endpoint, { headers: { accept: "application/json" }, maxBytes: 256 * 1024 });
  meta.fetchStatus = statusFromHttp(res.status);
  if (meta.fetchStatus !== "ok") return;
  const j = parseJson(res.body);
  if (!j) {
    meta.fetchStatus = "failed";
    return;
  }
  meta.title = str(j.title);
  meta.caption = meta.title;
  meta.authorName = str(j.author_name);
  meta.creatorHandle = handleFromUrl(str(j.author_url));
  meta.thumbnailUrl = str(j.thumbnail_url);
  meta.siteName = "YouTube";
}

/** Parse IG og:title / og:description into handle + caption. */
export function parseInstagramOg(m: Record<string, string>): { handle?: string; caption?: string; authorName?: string } {
  const out: { handle?: string; caption?: string; authorName?: string } = {};
  const desc = m["og:description"] ?? m["description"];
  const title = m["og:title"] ?? m["twitter:title"];
  // "1,234 likes, 56 comments - handle on March 1, 2026: "caption text""
  if (desc) {
    const d = /-\s*([A-Za-z0-9._]{1,30})\s+on\s+[^:]{3,40}:\s*["“]?([\s\S]*?)["”]?\.?\s*$/.exec(desc);
    if (d) {
      out.handle = cleanHandle(d[1]);
      out.caption = d[2]!.trim();
    } else {
      out.caption = desc;
    }
  }
  // "Display Name (@handle) • Instagram photos and videos" / "Name on Instagram: "caption""
  if (title) {
    const h = /\(@([A-Za-z0-9._]{1,30})\)/.exec(title);
    if (h) out.handle ??= cleanHandle(h[1]);
    const t = /^(.*?)\s+on Instagram:\s*["“]?([\s\S]*?)["”]?$/.exec(title);
    if (t) {
      out.authorName = t[1]!.trim();
      out.caption ??= t[2]!.trim();
      if (out.caption && t[2] && t[2].length > out.caption.length) out.caption = t[2].trim();
    }
  }
  return out;
}

function applyGenericMeta(meta: SourceMetadata, html: HtmlMeta): void {
  const m = html.meta;
  meta.title ??= m["og:title"] ?? m["twitter:title"] ?? html.title;
  meta.description ??= m["og:description"] ?? m["description"] ?? m["twitter:description"];
  meta.thumbnailUrl ??= m["og:image"] ?? m["og:image:url"] ?? m["og:image:secure_url"] ?? m["twitter:image"];
  meta.siteName ??= m["og:site_name"];
  const lat =
    num(m["place:location:latitude"]) ?? num(m["og:latitude"]) ?? num(m["latitude"]) ??
    num(m["geo.position"]?.split(/[;,]/)[0]) ?? num(m["icbm"]?.split(/[;,]/)[0]);
  const lng =
    num(m["place:location:longitude"]) ?? num(m["og:longitude"]) ?? num(m["longitude"]) ??
    num(m["geo.position"]?.split(/[;,]/)[1]) ?? num(m["icbm"]?.split(/[;,]/)[1]);
  meta.geo ??= validGeo(lat, lng);
  meta.locationTag ??= m["geo.placename"] ?? m["og:locality"];
  const creator = m["twitter:creator"];
  if (creator && meta.kind === "url") meta.creatorHandle ??= cleanHandle(creator);

  // JSON-LD: first place-like entity.
  const PLACE_TYPES = /Restaurant|Hotel|LodgingBusiness|LocalBusiness|BarOrPub|CafeOrCoffeeShop|TouristAttraction|Museum|Place|FoodEstablishment|VacationRental|Accommodation|Product/i;
  for (const node of html.jsonLd) {
    if (!node || typeof node !== "object") continue;
    const n = node as Record<string, unknown>;
    const type = Array.isArray(n["@type"]) ? (n["@type"] as unknown[]).join(",") : str(n["@type"]);
    if (!type || !PLACE_TYPES.test(type) || /Product/.test(type)) continue;
    const addr = n.address as Record<string, unknown> | string | undefined;
    const geo = n.geo as Record<string, unknown> | undefined;
    const place = {
      name: str(n.name),
      type,
      address:
        typeof addr === "string"
          ? addr
          : addr
            ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.addressCountry]
                .map((x) => (typeof x === "string" ? x : typeof x === "object" && x ? str((x as Record<string, unknown>).name) : undefined))
                .filter(Boolean)
                .join(", ")
            : undefined,
      locality: typeof addr === "object" && addr ? str(addr.addressLocality) : undefined,
      geo: geo ? validGeo(num(String(geo.latitude)), num(String(geo.longitude))) : undefined,
    };
    meta.jsonLdPlace = place;
    meta.geo ??= place.geo;
    meta.locationTag ??= place.locality;
    break;
  }
}

async function fetchHtml(meta: SourceMetadata, fetcher: Fetcher): Promise<SafeResponse | null> {
  const res = await fetcher(meta.url!, { maxBytes: 2 * 1024 * 1024 });
  meta.fetchStatus = statusFromHttp(res.status);
  if (meta.fetchStatus !== "ok") return null;
  const ct = res.headers["content-type"] ?? "";
  if (ct && !/html|xml/i.test(ct)) {
    meta.warnings.push(`unsupported_content_type:${ct.split(";")[0]}`);
    return null;
  }
  return res;
}

async function fetchInstagram(meta: SourceMetadata, fetcher: Fetcher): Promise<void> {
  const res = await fetchHtml(meta, fetcher);
  if (!res) return;
  const html = parseHtmlMeta(res.body);
  const ig = parseInstagramOg(html.meta);
  // IG serves a login wall without OG tags for private posts.
  if (!html.meta["og:description"] && !html.meta["og:title"]) {
    meta.fetchStatus = "private";
    return;
  }
  meta.caption = ig.caption;
  meta.creatorHandle = ig.handle;
  meta.authorName = ig.authorName;
  meta.thumbnailUrl = html.meta["og:image"];
  meta.title = html.meta["og:title"];
  meta.siteName = "Instagram";
}

async function fetchGeneric(meta: SourceMetadata, fetcher: Fetcher): Promise<void> {
  const res = await fetchHtml(meta, fetcher);
  if (!res) return;
  applyGenericMeta(meta, parseHtmlMeta(res.body));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface IntakeDeps {
  fetcher: Fetcher;
}

/**
 * Turn pasted input into SourceMetadata. Never throws for remote failures: the card
 * must still appear (FR-23) and the user can fix it (C-1, C-4).
 */
export async function fetchSourceMetadata(
  input: string | ClassifiedInput,
  deps: IntakeDeps,
): Promise<SourceMetadata> {
  const classified = typeof input === "string" ? classifyInput(input) : input;
  const meta: SourceMetadata = {
    kind: classified.kind,
    url: classified.url,
    normalizedUrl: null,
    userText: classified.text,
    hashtags: [],
    fetchStatus: "skipped",
    warnings: [],
  };
  if (!classified.url) {
    meta.hashtags = extractHashtags(classified.text);
    meta.locationTag = extractLocationTag(classified.text);
    return meta;
  }

  const canon = await canonicalizeUrl(classified.url, deps.fetcher);
  meta.url = canon.url;
  meta.normalizedUrl = canon.normalizedUrl;
  // A short link may resolve to a different platform (e.g. maps.app.goo.gl → google.com/maps).
  try {
    const u = new URL(canon.url);
    meta.kind = classified.kind === "text" ? "url" : hostKind(u.hostname, u.pathname);
  } catch {
    /* keep */
  }

  try {
    switch (meta.kind) {
      case "tiktok":
        await fetchTikTok(meta, deps.fetcher);
        break;
      case "youtube":
        await fetchYouTube(meta, deps.fetcher);
        break;
      case "instagram":
        await fetchInstagram(meta, deps.fetcher);
        break;
      case "google_maps": {
        // Everything we need is in the URL; don't fetch Google pages.
        meta.maps = parseGoogleMapsUrl(canon.url);
        meta.fetchStatus = "skipped";
        if (meta.maps.type === "unknown") meta.warnings.push("maps_link_unparsed");
        break;
      }
      default:
        meta.lodging = detectLodging(canon.url);
        await fetchGeneric(meta, deps.fetcher);
    }
  } catch (e) {
    if (e instanceof SafeFetchError) {
      meta.fetchStatus = ["blocked_ip", "blocked_host", "blocked_port", "blocked_scheme"].includes(e.code)
        ? "blocked"
        : "failed";
      meta.warnings.push(`fetch_${e.code}`);
    } else {
      meta.fetchStatus = "failed";
      meta.warnings.push("fetch_error");
    }
  }

  const allText = [meta.caption, meta.description, meta.userText].filter(Boolean).join("\n");
  meta.hashtags = extractHashtags(allText);
  meta.locationTag ??= extractLocationTag(allText);
  if (meta.fetchStatus === "private") meta.warnings.push("private_post");
  return meta;
}
