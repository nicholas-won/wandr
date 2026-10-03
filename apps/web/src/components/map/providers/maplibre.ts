/**
 * MapLibre GL + OpenFreeMap (keyless vector tiles; D48 fallback when no Google key).
 * Loaded with a dynamic import from the map canvas, so it never runs on the server and its ~800 KB
 * bundle only downloads when a map is actually shown. Attribution ("OpenFreeMap © OpenMapTiles
 * Data from OpenStreetMap") comes from the tile source and is shown by MapLibre's control.
 */
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Bounds } from "../map-helpers";
import { markerKey, styleMarkerElement } from "./marker-dom";
import { resolveToken, type AdapterOptions, type DrawMarker, type MapAdapter, type MapTheme } from "./types";

export const OPENFREEMAP_STYLE: Record<MapTheme, string> = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const ROUTE_SOURCE = "wandr-route";
const ROUTE_LAYER = "wandr-route-line";

/** WebGL is required; without it the component keeps the list only. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function toLngLatBounds(b: Bounds): [[number, number], [number, number]] {
  return [
    [b.west, b.south],
    [b.east, b.north],
  ];
}

export function createMapLibre(opts: AdapterOptions): MapAdapter {
  const map = new maplibregl.Map({
    container: opts.container,
    style: OPENFREEMAP_STYLE[opts.theme],
    ...(opts.initialBounds
      ? { bounds: toLngLatBounds(opts.initialBounds), fitBoundsOptions: { padding: 48, maxZoom: 15 } }
      : { center: [0, 20] as [number, number], zoom: 1 }),
    interactive: opts.interactive,
    attributionControl: { compact: true },
    // Phones: one finger scrolls the page, two fingers move the map (no scroll trap).
    cooperativeGestures: opts.interactive && window.matchMedia("(pointer: coarse)").matches,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  if (opts.interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.keyboard.disableRotation();
  map.touchZoomRotate.disableRotation();

  let loaded = false;
  let route: { lat: number; lng: number }[] = [];
  const markers = new Map<string, { m: maplibregl.Marker; el: HTMLElement }>();

  const drawRoute = () => {
    if (!map.isStyleLoaded()) return;
    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: route.map((p) => [p.lng, p.lat]) },
    };
    const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else map.addSource(ROUTE_SOURCE, { type: "geojson", data });
    if (!map.getLayer(ROUTE_LAYER)) {
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": resolveToken("--primary", "#c2410c"), "line-width": 3.5, "line-opacity": 0.85, "line-dasharray": [2, 1.5] },
      });
    } else {
      map.setPaintProperty(ROUTE_LAYER, "line-color", resolveToken("--primary", "#c2410c"));
    }
  };

  map.on("load", () => {
    loaded = true;
    // Compact attribution starts expanded; collapse to the (i) button so it doesn't cover small
    // maps. It stays one tap away, as OpenFreeMap/OSM attribution requires.
    opts.container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    drawRoute();
  });
  map.on("style.load", drawRoute);
  map.on("error", () => {
    // Only a failure before the first render is fatal (style or glyphs unreachable). Individual
    // tile errors later just leave gaps.
    if (!loaded) opts.onError();
  });
  map.on("zoomend", () => opts.onZoom(map.getZoom()));

  return {
    draw(next: DrawMarker[], nextRoute) {
      const keep = new Set<string>();
      for (const d of next) {
        const key = markerKey(d);
        keep.add(key);
        let entry = markers.get(key);
        if (!entry) {
          const el = document.createElement(opts.interactive ? "button" : "div");
          const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([d.marker.lng, d.marker.lat]).addTo(map);
          if (opts.interactive) {
            el.addEventListener("click", (e) => {
              e.stopPropagation();
              const cur = (el as HTMLElement & { __marker?: DrawMarker["marker"] }).__marker;
              if (cur) opts.onMarkerClick(cur);
            });
          }
          entry = { m, el };
          markers.set(key, entry);
        }
        entry.m.setLngLat([d.marker.lng, d.marker.lat]);
        (entry.el as HTMLElement & { __marker?: DrawMarker["marker"] }).__marker = d.marker;
        styleMarkerElement(entry.el, d, opts.interactive);
      }
      for (const [key, entry] of markers) {
        if (!keep.has(key)) {
          entry.m.remove();
          markers.delete(key);
        }
      }
      route = nextRoute;
      if (loaded) drawRoute();
    },
    fitBounds(b, animate) {
      map.fitBounds(toLngLatBounds(b), { padding: 48, maxZoom: 15, animate, duration: animate ? 600 : 0 });
    },
    reveal(p, animate) {
      if (map.getBounds().contains([p.lng, p.lat])) return;
      if (animate) map.easeTo({ center: [p.lng, p.lat], duration: 500 });
      else map.jumpTo({ center: [p.lng, p.lat] });
    },
    getZoom: () => map.getZoom(),
    setTheme(theme) {
      map.setStyle(OPENFREEMAP_STYLE[theme]);
    },
    destroy() {
      markers.forEach((e) => e.m.remove());
      markers.clear();
      map.remove();
    },
  };
}
