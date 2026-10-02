/**
 * Map links (FR-122, FR-126 first half: "send the plan to Google Maps, one list per Stop").
 * Plain links only: no affiliate parameters, no tracking (§11 trust rules).
 * Uses the documented Google Maps URLs API (https://developers.google.com/maps/documentation/urls).
 */

export interface MapPlace {
  title: string;
  lat: number | null;
  lng: number | null;
  placeId?: string | null;
}

const BASE = "https://www.google.com/maps";

/** Has a usable pin. */
export function hasPin(p: MapPlace): p is MapPlace & { lat: number; lng: number } {
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

const coord = (p: { lat: number; lng: number }) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** One place: search by place id when known, else by coordinates, else by name. */
export function googleMapsPlaceUrl(p: MapPlace): string {
  const q = new URLSearchParams({ api: "1" });
  if (hasPin(p)) q.set("query", coord(p));
  else q.set("query", p.title);
  if (p.placeId) q.set("query_place_id", p.placeId);
  return `${BASE}/search/?${q.toString()}`;
}

/** Google's URL API allows up to 9 waypoints plus origin and destination. */
export const MAX_PLACES_PER_ROUTE = 11;

/**
 * A Stop's places as Google Maps route links, in the given order, chunked to the URL limit
 * (consecutive chunks share an endpoint so the route continues). Places without pins are skipped.
 * One place → a place link. None → [].
 */
export function googleMapsRouteUrls(places: readonly MapPlace[]): string[] {
  const pinned = places.filter(hasPin);
  if (pinned.length === 0) return [];
  if (pinned.length === 1) return [googleMapsPlaceUrl(pinned[0]!)];
  const urls: string[] = [];
  for (let start = 0; start < pinned.length - 1; start += MAX_PLACES_PER_ROUTE - 1) {
    const chunk = pinned.slice(start, start + MAX_PLACES_PER_ROUTE);
    if (chunk.length < 2) break;
    const q = new URLSearchParams({
      api: "1",
      origin: coord(chunk[0]!),
      destination: coord(chunk[chunk.length - 1]!),
      travelmode: "walking",
    });
    const mid = chunk.slice(1, -1);
    if (mid.length) q.set("waypoints", mid.map(coord).join("|"));
    urls.push(`${BASE}/dir/?${q.toString()}`);
  }
  return urls;
}

/** Bounding box of pinned places (to fit a map), or null. */
export function boundsOf(places: readonly MapPlace[]): { north: number; south: number; east: number; west: number } | null {
  const pinned = places.filter(hasPin);
  if (!pinned.length) return null;
  return {
    north: Math.max(...pinned.map((p) => p.lat)),
    south: Math.min(...pinned.map((p) => p.lat)),
    east: Math.max(...pinned.map((p) => p.lng)),
    west: Math.min(...pinned.map((p) => p.lng)),
  };
}
