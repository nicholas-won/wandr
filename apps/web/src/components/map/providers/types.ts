/**
 * The single map-provider abstraction (D48): Google Maps JS when a key is configured, otherwise
 * MapLibre GL on OpenFreeMap tiles. The React component only talks to this interface.
 */
import type { Bounds, MapMarker } from "../map-helpers";

export type MapTheme = "light" | "dark";

export interface DrawMarker {
  marker: MapMarker;
  /** CSS custom property for the fill ("--primary"). */
  token: string;
  selected: boolean;
  dimmed: boolean;
  ariaLabel: string;
}

export interface AdapterOptions {
  container: HTMLElement;
  theme: MapTheme;
  /** False for the mini-map: no pan/zoom gestures, no marker clicks. */
  interactive: boolean;
  initialBounds: Bounds | null;
  onZoom: (zoom: number) => void;
  onMarkerClick: (m: MapMarker) => void;
  /** Tiles/style/script failed: the component falls back to the list. */
  onError: () => void;
}

export interface MapAdapter {
  draw(markers: DrawMarker[], route: { lat: number; lng: number }[]): void;
  fitBounds(b: Bounds, animate: boolean): void;
  /** Pan so the point is visible (no-op when already in view). */
  reveal(p: { lat: number; lng: number }, animate: boolean): void;
  getZoom(): number;
  setTheme(theme: MapTheme): void;
  destroy(): void;
}

/** Resolve a CSS custom property to a concrete colour (for APIs that can't take var()). */
export function resolveToken(token: string, fallback = "#57534e"): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v || fallback;
}
