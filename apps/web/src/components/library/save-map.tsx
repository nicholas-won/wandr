"use client";

/**
 * FR-L7: map of saves, clustered by city when zoomed out (LB-10).
 * Uses Google Maps JS only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set; otherwise (and for
 * screen readers always) an accessible list grouped by city with plain map links.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { mapsLink } from "./format";

export interface MapPoint {
  id: string;
  title: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  /** City or region label used for clustering ("Lisbon"). */
  group: string;
  href?: string;
}

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
/** Below this zoom, show one marker per city with a count. */
const CLUSTER_BELOW_ZOOM = 10;

// Minimal typings for the bits of Maps JS we use (no @types dependency).
type LatLngLiteral = { lat: number; lng: number };
interface GMarker {
  setMap(m: GMap | null): void;
  addListener(ev: string, fn: () => void): void;
}
interface GMap {
  getZoom(): number | undefined;
  setZoom(z: number): void;
  setCenter(c: LatLngLiteral): void;
  fitBounds(b: unknown): void;
  addListener(ev: string, fn: () => void): void;
}
interface GMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  LatLngBounds: new () => { extend(p: LatLngLiteral): void };
}
declare global {
  interface Window {
    google?: { maps: GMaps };
    __wandrMapsLoading?: Promise<GMaps>;
  }
}

function loadMaps(key: string): Promise<GMaps> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  window.__wandrMapsLoading ??= new Promise<GMaps>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    s.async = true;
    s.onload = () => (window.google?.maps ? resolve(window.google.maps) : reject(new Error("maps")));
    s.onerror = () => reject(new Error("maps"));
    document.head.appendChild(s);
  });
  return window.__wandrMapsLoading;
}

function clusters(points: (MapPoint & LatLngLiteral)[]) {
  const m = new Map<string, (MapPoint & LatLngLiteral)[]>();
  for (const p of points) m.set(p.group, [...(m.get(p.group) ?? []), p]);
  return [...m.entries()].map(([group, ps]) => ({
    group,
    count: ps.length,
    lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length,
    lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length,
  }));
}

function GoogleMap({ apiKey, points }: { apiKey: string; points: (MapPoint & LatLngLiteral)[] }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let markers: GMarker[] = [];
    let cancelled = false;
    loadMaps(apiKey)
      .then((g) => {
        if (cancelled || !el.current) return;
        const map = new g.Map(el.current, { mapTypeControl: false, streetViewControl: false, zoom: 3, center: points[0] });
        const bounds = new g.LatLngBounds();
        points.forEach((p) => bounds.extend(p));
        if (points.length > 1) map.fitBounds(bounds);
        else map.setZoom(14);
        const draw = () => {
          markers.forEach((m) => m.setMap(null));
          const zoom = map.getZoom() ?? 3;
          if (zoom < CLUSTER_BELOW_ZOOM) {
            markers = clusters(points).map((c) => {
              const m = new g.Marker({
                map,
                position: { lat: c.lat, lng: c.lng },
                label: { text: String(c.count), color: "white", fontWeight: "700" },
                title: `${c.group}: ${c.count}`,
              });
              m.addListener("click", () => {
                map.setCenter({ lat: c.lat, lng: c.lng });
                map.setZoom(CLUSTER_BELOW_ZOOM + 2);
              });
              return m;
            });
          } else {
            markers = points.map((p) => {
              const m = new g.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: p.title });
              if (p.href) m.addListener("click", () => (window.location.href = p.href!));
              return m;
            });
          }
        };
        map.addListener("zoom_changed", draw);
        draw();
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      markers.forEach((m) => m.setMap(null));
    };
  }, [apiKey, points]);
  if (failed) return null;
  return <div ref={el} aria-hidden className="h-[55vh] min-h-72 w-full overflow-hidden rounded-xl border bg-muted" />;
}

export function SaveMap({ points }: { points: MapPoint[] }) {
  const located = points.filter((p): p is MapPoint & LatLngLiteral => p.lat != null && p.lng != null);
  const groups = new Map<string, MapPoint[]>();
  for (const p of points) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);

  return (
    <div className="space-y-4">
      {KEY && located.length ? <GoogleMap apiKey={KEY} points={located} /> : null}
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to map yet.</p>
      ) : (
        <div className={KEY && located.length ? "sr-only" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
          {[...groups.entries()].map(([group, ps]) => (
            <section key={group} className="rounded-xl border bg-card p-4" aria-label={`${group}, ${ps.length} saved`}>
              <h3 className="font-display font-bold">
                {group} · {ps.length}
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {ps.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    {p.href ? (
                      <Link href={p.href} className="truncate hover:underline">
                        {p.title}
                      </Link>
                    ) : (
                      <span className="truncate">{p.title}</span>
                    )}
                    <a
                      href={mapsLink(p)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary"
                    >
                      <MapPin className="size-3.5" aria-hidden /> Map
                      <span className="sr-only"> for {p.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
