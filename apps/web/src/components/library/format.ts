/** Display helpers for the idea library (§6.12). Pure; safe on server and client. */
import { CATEGORY_LABEL, type LibraryCategory } from "@wandr/core/library";

let names: Intl.DisplayNames | null = null;

/** "PT" → "Portugal". Falls back to the code. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍽️",
  drink: "🍹",
  nightlife: "🪩",
  activity: "🎟️",
  sight: "📸",
  shopping: "🛍️",
  stay: "🛏️",
  transit: "🚆",
  city: "🏙️",
  other: "✨",
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c as LibraryCategory] ?? "Other";
}

/** Tile title: the city/region, else the country, else "Not sorted yet". */
export function tileName(t: { city: string | null; country: string | null }): string {
  return t.city ?? countryName(t.country) ?? "Not sorted yet";
}

/** Plain Google Maps link (no API key, no affiliate params; §11). */
export function mapsLink(s: { title: string; lat: number | null; lng: number | null; placeId: string | null }): string {
  const q = s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : s.title;
  const u = new URL("https://www.google.com/maps/search/");
  u.searchParams.set("api", "1");
  u.searchParams.set("query", q);
  if (s.placeId) u.searchParams.set("query_place_id", s.placeId);
  return u.toString();
}
