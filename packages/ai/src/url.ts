/**
 * Classify pasted input and canonicalize URLs for caching / dedup (FR-20, FR-22, FR-34, C-13).
 */
import type { Fetcher } from "./safe-fetch";

/** Mirrors the `source_kind` enum in packages/db/src/schema.ts (subset produced from pasted input). */
export type SourceKind = "tiktok" | "instagram" | "youtube" | "google_maps" | "url" | "screenshot" | "text" | "sms";
export type PastedKind = Extract<SourceKind, "tiktok" | "instagram" | "youtube" | "google_maps" | "url" | "text">;

export interface ClassifiedInput {
  kind: PastedKind;
  /** The first URL found in the input (absolute, as pasted), if any. */
  url: string | null;
  /** Free text around the URL (or the whole input when it's just text). */
  text: string;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/i;
// Bare domains people paste without a scheme ("vm.tiktok.com/ZM123", "maps.app.goo.gl/abc").
const BARE_URL_RE =
  /\b(?:www\.|m\.|vm\.|vt\.)?(?:tiktok\.com|instagram\.com|instagr\.am|youtube\.com|youtu\.be|maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})\/[^\s<>"'`]*/i;

function trimTrailingPunctuation(u: string): string {
  return u.replace(/[)\].,!?;:'"»”]+$/u, "");
}

export function hostKind(hostname: string, pathname = "/"): PastedKind {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "instagram.com" || h.endsWith(".instagram.com") || h === "instagr.am") return "instagram";
  if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be" || h === "youtube-nocookie.com")
    return "youtube";
  if (h === "maps.app.goo.gl") return "google_maps";
  if (h === "goo.gl" && pathname.startsWith("/maps")) return "google_maps";
  if (/^maps\.google\.[a-z.]+$/.test(h)) return "google_maps";
  if (/^google\.[a-z.]+$/.test(h) && pathname.startsWith("/maps")) return "google_maps";
  if (h === "g.co" && pathname.startsWith("/kgs")) return "google_maps";
  return "url";
}

/** Classify whatever the user pasted into a source kind (FR-20). */
export function classifyInput(raw: string): ClassifiedInput {
  const input = raw.trim();
  let match = URL_RE.exec(input);
  let urlStr: string | null = match ? trimTrailingPunctuation(match[0]) : null;
  if (!urlStr) {
    const bare = BARE_URL_RE.exec(input);
    if (bare) {
      match = bare;
      urlStr = `https://${trimTrailingPunctuation(bare[0])}`;
    }
  }
  if (!urlStr || !match) return { kind: "text", url: null, text: input };
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return { kind: "text", url: null, text: input };
  }
  const text = (input.slice(0, match.index) + " " + input.slice(match.index + match[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { kind: hostKind(u.hostname, u.pathname), url: u.toString(), text };
}

/** Query params that never identify content (C-13). Matched case-insensitively. */
const TRACKING_PARAMS = new Set([
  "igsh", "igshid", "si", "_t", "_r", "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid",
  "mc_cid", "mc_eid", "ref", "ref_src", "ref_url", "feature", "mibextid", "source_impression_id",
]);
const TRACKING_PREFIXES = ["utm_", "share_"];

/** Per-platform allowlist of params that *do* identify content. `null` = generic rules. */
const KEEP_PARAMS: Partial<Record<PastedKind, Set<string>>> = {
  tiktok: new Set(),
  instagram: new Set(),
  youtube: new Set(["v", "list"]),
  google_maps: new Set(["q", "query", "query_place_id", "cid", "ll", "api", "destination", "place_id", "ftid"]),
};

/**
 * Normalize a URL for cache keys and dedup. Pure: does not follow short links
 * (use `canonicalizeUrl` for that).
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  u.hash = "";
  u.username = "";
  u.password = "";
  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  const kind = hostKind(host, u.pathname);
  u.protocol = "https:";
  if (u.port === "443" || u.port === "80") u.port = "";

  // Host canonicalization per platform.
  if (kind === "tiktok" && (host === "m.tiktok.com" || host === "tiktok.com")) host = "www.tiktok.com";
  if (kind === "instagram") host = "www.instagram.com";
  if (kind === "youtube") {
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) {
        u.pathname = "/watch";
        const keep = new URLSearchParams();
        keep.set("v", id);
        u.search = keep.toString();
      }
    }
    host = "www.youtube.com";
  }
  if (!["tiktok", "instagram", "youtube"].includes(kind) && host.startsWith("www.")) {
    // Keep www for maps (google.com/maps vs www.google.com/maps are the same) — normalize to bare.
    host = host.slice(4);
  }
  u.hostname = host;

  // Params.
  const keep = KEEP_PARAMS[kind];
  const params = [...u.searchParams.entries()];
  const filtered = params.filter(([k]) => {
    const key = k.toLowerCase();
    if (keep) return keep.has(key);
    if (TRACKING_PARAMS.has(key)) return false;
    return !TRACKING_PREFIXES.some((p) => key.startsWith(p));
  });
  filtered.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  u.search = new URLSearchParams(filtered).toString();

  // Instagram: /reels/ID and /reel/ID are the same post; drop the username prefix form /user/p/ID.
  if (kind === "instagram") {
    const m = /\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(u.pathname);
    if (m) u.pathname = `/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}`;
  }
  // YouTube shorts → watch?v= (same video).
  if (kind === "youtube") {
    const m = /^\/(shorts|live|embed)\/([A-Za-z0-9_-]{6,})/.exec(u.pathname);
    if (m) {
      u.pathname = "/watch";
      u.search = new URLSearchParams([["v", m[2]!]]).toString();
    }
  }

  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  let out = u.toString();
  if (u.pathname === "/" && !u.search) out = out.replace(/\/$/, "");
  return out;
}

/** Links whose identity is only knowable by following a redirect (C-13). */
export function isShortLink(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  if (h === "vm.tiktok.com" || h === "vt.tiktok.com") return true;
  if (h === "tiktok.com" && /^\/t\//.test(u.pathname)) return true;
  if (h === "maps.app.goo.gl") return true;
  if (h === "goo.gl" && u.pathname.startsWith("/maps")) return true;
  if (h === "g.co" && u.pathname.startsWith("/kgs")) return true;
  if (h === "instagr.am") return true;
  return false;
}

/**
 * Normalize a URL, first resolving short links through the SSRF-safe fetcher.
 * Never throws: on fetch failure returns the normalized short link.
 */
export async function canonicalizeUrl(
  raw: string,
  fetcher: Fetcher,
): Promise<{ url: string; normalizedUrl: string; resolvedFrom?: string }> {
  if (!isShortLink(raw)) return { url: raw, normalizedUrl: normalizeUrl(raw) };
  try {
    // GET (not HEAD): some shorteners answer HEAD with 405. Body is capped small.
    const res = await fetcher(raw, { method: "GET", maxBytes: 64 * 1024 });
    if (res.url && res.url !== raw) {
      return { url: res.url, normalizedUrl: normalizeUrl(res.url), resolvedFrom: raw };
    }
  } catch {
    /* fall through */
  }
  return { url: raw, normalizedUrl: normalizeUrl(raw) };
}
