/**
 * Pure helpers for the shared map (FR-122, FR-L7, FR-O7). No DOM, no provider SDKs: bounds,
 * clustering, category colours and route preparation, so they're unit-testable and identical for
 * Google Maps JS and MapLibre.
 */

export interface MapPin {
  id: string;
  lat: number | null;
  lng: number | null;
  title: string;
  category: string;
  /** Short text drawn inside the marker (route order "1", "2"…). */
  label?: string;
  stopId?: string | null;
  /** City or region used to cluster when zoomed out (library, FR-L7). Falls back to stopId. */
  group?: string;
  /** Secondary line in the list ("Food · Planned"). */
  subtitle?: string;
  /** In-app link for the place (library save detail). */
  href?: string;
  /** Plain Google Maps link (FR-126). No affiliate params (§11). */
  mapsUrl?: string;
  /** Shown faded (dropped / passed / not on today's plan). */
  dimmed?: boolean;
}

export interface MapStop {
  id: string;
  name: string;
  /** "Open in Google Maps" route links for this Stop (FR-126). */
  routeUrls?: string[];
}

export type LocatedPin = MapPin & { lat: number; lng: number };

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function isLocated(p: MapPin): p is LocatedPin {
  return (
    p.lat != null &&
    p.lng != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

export function locatedPins(pins: MapPin[]): LocatedPin[] {
  return pins.filter(isLocated);
}

/**
 * Bounding box for the pins. A single point (or several at the same spot) gets a small box
 * (~`minSpanDeg`) so the map doesn't zoom to street level. Null when nothing is located.
 */
export function pinBounds(pins: { lat: number; lng: number }[], minSpanDeg = 0.01): Bounds | null {
  if (pins.length === 0) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of pins) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  if (east - west < minSpanDeg) {
    const c = (east + west) / 2;
    west = c - minSpanDeg / 2;
    east = c + minSpanDeg / 2;
  }
  if (north - south < minSpanDeg) {
    const c = (north + south) / 2;
    south = Math.max(-85, c - minSpanDeg / 2);
    north = Math.min(85, c + minSpanDeg / 2);
  }
  return { west, south, east, north };
}

export function boundsContains(b: Bounds, p: { lat: number; lng: number }): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}

/** Below this zoom, pins collapse into one marker per city / Stop (FR-L7). */
export const GROUP_BELOW_ZOOM = 9;
/** At or above this zoom nothing clusters (identical coordinates stay separate pins). */
export const NO_CLUSTER_FROM_ZOOM = 16;
/** Pins closer than this many screen pixels merge into a count marker. */
export const CLUSTER_CELL_PX = 44;

export type MapMarker =
  | { kind: "pin"; key: string; pin: LocatedPin; lat: number; lng: number }
  | { kind: "cluster"; key: string; lat: number; lng: number; count: number; pinIds: string[]; name?: string };

/** Web-Mercator world pixel coordinates at a zoom (256px tiles). */
export function project(p: { lat: number; lng: number }, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function centroid(ps: LocatedPin[]): { lat: number; lng: number } {
  return {
    lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length,
    lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length,
  };
}

function toMarkers(buckets: Map<string, LocatedPin[]>, names?: Map<string, string>): MapMarker[] {
  const out: MapMarker[] = [];
  for (const [k, ps] of buckets) {
    if (ps.length === 1) {
      const pin = ps[0]!;
      out.push({ kind: "pin", key: `p:${pin.id}`, pin, lat: pin.lat, lng: pin.lng });
    } else {
      const ids = ps.map((p) => p.id).sort();
      out.push({ kind: "cluster", key: `c:${k}:${ids.length}:${ids[0]}`, ...centroid(ps), count: ps.length, pinIds: ids, name: names?.get(k) });
    }
  }
  return out;
}

/**
 * Turns pins into what to draw at a zoom.
 * - Zoomed out (< GROUP_BELOW_ZOOM) with 2+ groups: one marker per city / Stop (FR-L7).
 * - Otherwise: screen-grid clustering so overlapping pins merge into a count.
 * - The selected pin always draws on its own, so selection is never hidden in a cluster.
 * - `cluster: false` (a day's route) draws every pin.
 */
export function clusterPins(
  pins: LocatedPin[],
  zoom: number,
  opts: { selectedId?: string | null; cluster?: boolean; groupNames?: Map<string, string> } = {},
): MapMarker[] {
  const { selectedId = null, cluster = true } = opts;
  const solo = (p: LocatedPin): MapMarker => ({ kind: "pin", key: `p:${p.id}`, pin: p, lat: p.lat, lng: p.lng });
  if (!cluster || zoom >= NO_CLUSTER_FROM_ZOOM) return pins.map(solo);
  const selected = pins.find((p) => p.id === selectedId);
  const rest = selected ? pins.filter((p) => p !== selected) : pins;
  const groupOf = (p: LocatedPin) => p.group ?? p.stopId ?? "";
  const groups = new Set(pins.map(groupOf));
  let buckets: Map<string, LocatedPin[]>;
  let names: Map<string, string> | undefined;
  if (zoom < GROUP_BELOW_ZOOM && groups.size > 1) {
    buckets = new Map();
    names = new Map();
    for (const p of rest) {
      const g = groupOf(p);
      buckets.set(g, [...(buckets.get(g) ?? []), p]);
      names.set(g, opts.groupNames?.get(g) ?? p.group ?? "");
    }
  } else {
    buckets = new Map();
    const z = Math.floor(zoom);
    for (const p of rest) {
      const { x, y } = project(p, z);
      const k = `${Math.floor(x / CLUSTER_CELL_PX)}:${Math.floor(y / CLUSTER_CELL_PX)}`;
      buckets.set(k, [...(buckets.get(k) ?? []), p]);
    }
  }
  const out = toMarkers(buckets, names);
  if (selected) out.push(solo(selected));
  return out;
}

/** Ordered coordinates for a route (a day's plan, FR-O7). Unknown or unlocated ids are skipped. */
export function routeCoordinates(route: string[] | undefined, pins: LocatedPin[]): { lat: number; lng: number }[] {
  if (!route?.length) return [];
  const byId = new Map(pins.map((p) => [p.id, p]));
  return route.flatMap((id) => {
    const p = byId.get(id);
    return p ? [{ lat: p.lat, lng: p.lng }] : [];
  });
}

/**
 * Category → CSS custom property from globals.css, so markers follow the app's light and dark
 * themes. Tokens only; never hard-coded colours.
 */
const CATEGORY_TOKEN: Record<string, string> = {
  food: "--primary",
  drink: "--primary",
  activity: "--vote-down",
  sight: "--vote-down",
  shopping: "--vote-down",
  nightlife: "--accent-foreground",
  stay: "--secondary-foreground",
  transit: "--vote-pass",
  city: "--vote-pass",
  other: "--vote-pass",
};

export function categoryToken(category: string | null | undefined): string {
  return CATEGORY_TOKEN[category ?? ""] ?? "--vote-pass";
}

const CATEGORY_NAME: Record<string, string> = {
  food: "Food",
  drink: "Drinks",
  activity: "Activities",
  sight: "Sights",
  shopping: "Shopping",
  nightlife: "Nightlife",
  stay: "Stays",
  transit: "Getting around",
  city: "Places to go",
  other: "Other",
};

/** Legend entries for the categories present, merged by colour ("Food & Drinks"). */
export function legendFor(pins: { category: string }[]): { token: string; label: string }[] {
  const byToken = new Map<string, string[]>();
  for (const p of pins) {
    const t = categoryToken(p.category);
    const name = CATEGORY_NAME[p.category] ?? "Other";
    const names = byToken.get(t) ?? [];
    if (!names.includes(name)) names.push(name);
    byToken.set(t, names);
  }
  return [...byToken.entries()].map(([token, names]) => ({ token, label: names.join(" & ") }));
}

/** Screen-reader label for a marker. Titles come from shared links; they're text, never markup (C-21). */
export function markerLabel(m: MapMarker): string {
  if (m.kind === "cluster") return m.name ? `${m.name}: ${m.count} places. Zoom in.` : `${m.count} places here. Zoom in.`;
  return m.pin.label ? `${m.pin.label}. ${m.pin.title}` : m.pin.title;
}

/** A stable signature of which pins are on the map, so we only re-fit when the set changes. */
export function pinSetKey(pins: { id: string }[]): string {
  return pins
    .map((p) => p.id)
    .sort()
    .join(",");
}
