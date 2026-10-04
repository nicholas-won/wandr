/**
 * Google Maps JS (D48: used when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, within the free tier).
 * Minimal hand-written typings for the few APIs we use (no @types dependency).
 */
import type { MapMarker } from "../map-helpers";
import { resolveToken, type AdapterOptions, type DrawMarker, type MapAdapter } from "./types";

type LatLng = { lat: number; lng: number };
type LatLngBoundsLiteral = { west: number; south: number; east: number; north: number };
interface GMarker {
  setMap(m: GMap | null): void;
  setOptions(o: Record<string, unknown>): void;
  addListener(ev: string, fn: () => void): void;
}
interface GMap {
  getZoom(): number | undefined;
  getBounds(): { contains(p: LatLng): boolean } | undefined;
  fitBounds(b: LatLngBoundsLiteral, padding?: number): void;
  panTo(p: LatLng): void;
  setCenter(p: LatLng): void;
  addListener(ev: string, fn: () => void): { remove(): void };
}
interface GPolyline {
  setMap(m: GMap | null): void;
  setPath(p: LatLng[]): void;
  setOptions(o: Record<string, unknown>): void;
}
interface GMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Polyline: new (opts: Record<string, unknown>) => GPolyline;
  SymbolPath: { CIRCLE: number };
  event: { clearInstanceListeners(o: unknown): void };
}

type GWindow = Window & { google?: { maps: GMaps }; __wandrGmapsReady?: () => void; gm_authFailure?: () => void };

let loader: Promise<GMaps> | null = null;
export function loadGoogleMaps(key: string): Promise<GMaps> {
  const w = window as GWindow;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  loader ??= new Promise<GMaps>((resolve, reject) => {
    w.__wandrGmapsReady = () => (w.google?.maps ? resolve(w.google.maps) : reject(new Error("maps")));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__wandrGmapsReady&loading=async`;
    s.async = true;
    s.onerror = () => {
      loader = null;
      reject(new Error("maps"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

function icon(g: GMaps, d: DrawMarker) {
  const m = d.marker;
  if (m.kind === "cluster") {
    return {
      path: g.SymbolPath.CIRCLE,
      scale: m.count >= 100 ? 21 : m.count >= 10 ? 18 : 15,
      fillColor: resolveToken("--foreground", "#1f1a17"),
      fillOpacity: 1,
      strokeColor: resolveToken("--background", "#fbf7f2"),
      strokeWeight: 3,
    };
  }
  const labelled = !!m.pin.label;
  return {
    path: g.SymbolPath.CIRCLE,
    scale: d.selected ? (labelled ? 15 : 12) : labelled ? 11 : 7,
    fillColor: resolveToken(d.token),
    fillOpacity: d.dimmed && !d.selected ? 0.45 : 1,
    strokeColor: d.selected ? resolveToken("--foreground", "#1f1a17") : resolveToken("--card", "#ffffff"),
    strokeWeight: d.selected ? 3 : 2,
  };
}

function label(d: DrawMarker) {
  const m = d.marker;
  const text = m.kind === "cluster" ? String(m.count) : m.pin.label;
  if (!text) return null;
  return {
    text,
    color: resolveToken(m.kind === "cluster" ? "--background" : "--vote-foreground", "#ffffff"),
    fontSize: "12px",
    fontWeight: "700",
  };
}

export async function createGoogle(apiKey: string, opts: AdapterOptions): Promise<MapAdapter> {
  const w = window as GWindow;
  w.gm_authFailure = () => opts.onError(); // bad or restricted key
  const g = await loadGoogleMaps(apiKey);
  const map = new g.Map(opts.container, {
    center: { lat: 20, lng: 0 },
    zoom: 2,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    rotateControl: false,
    clickableIcons: false,
    gestureHandling: opts.interactive ? "cooperative" : "none",
    disableDefaultUI: !opts.interactive,
    keyboardShortcuts: opts.interactive,
    colorScheme: opts.theme === "dark" ? "DARK" : "LIGHT",
  });
  if (opts.initialBounds) map.fitBounds(opts.initialBounds, 48);
  const idle = map.addListener("idle", () => opts.onZoom(map.getZoom() ?? 2));
  const markers = new Map<string, { gm: GMarker; ref: { m: MapMarker } }>();
  const line = new g.Polyline({ map, path: [], clickable: false, strokeOpacity: 0.85, strokeWeight: 3.5 });

  return {
    draw(next, route) {
      const keep = new Set<string>();
      for (const d of next) {
        keep.add(d.marker.key);
        let e = markers.get(d.marker.key);
        if (!e) {
          const ref = { m: d.marker };
          const gm = new g.Marker({ map, position: { lat: d.marker.lat, lng: d.marker.lng }, clickable: opts.interactive });
          if (opts.interactive) gm.addListener("click", () => opts.onMarkerClick(ref.m));
          e = { gm, ref };
          markers.set(d.marker.key, e);
        }
        e.ref.m = d.marker;
        e.gm.setOptions({
          position: { lat: d.marker.lat, lng: d.marker.lng },
          icon: icon(g, d),
          label: label(d),
          title: d.ariaLabel, // plain text; Maps JS escapes it
          zIndex: d.selected ? 5 : d.marker.kind === "cluster" ? 4 : d.dimmed ? 1 : 3,
        });
      }
      for (const [k, e] of markers) {
        if (!keep.has(k)) {
          g.event.clearInstanceListeners(e.gm);
          e.gm.setMap(null);
          markers.delete(k);
        }
      }
      line.setOptions({ strokeColor: resolveToken("--primary", "#c2410c") });
      line.setPath(route);
    },
    fitBounds(b) {
      map.fitBounds(b, 48);
    },
    reveal(p, animate) {
      if (map.getBounds()?.contains(p)) return;
      if (animate) map.panTo(p);
      else map.setCenter(p);
    },
    getZoom: () => map.getZoom() ?? 2,
    setTheme() {
      // colorScheme is fixed at creation in Maps JS; tokens on markers still update on redraw.
    },
    destroy() {
      idle.remove();
      markers.forEach((e) => {
        g.event.clearInstanceListeners(e.gm);
        e.gm.setMap(null);
      });
      markers.clear();
      line.setMap(null);
      if (w.gm_authFailure) w.gm_authFailure = undefined;
    },
  };
}
