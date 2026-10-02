"use client";

/**
 * FR-122: Google Maps JS, loaded only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. The page always
 * renders the accessible list next to it, so the map is an enhancement, never the only way in.
 */
import { useEffect, useRef, useState } from "react";
import type { MapGroup } from "@/server/planning";

type LatLng = { lat: number; lng: number };
type GMap = {
  fitBounds(b: unknown): void;
  setCenter(c: LatLng): void;
  setZoom(z: number): void;
};
type GoogleNS = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
    Marker: new (opts: Record<string, unknown>) => { addListener(ev: string, fn: () => void): void };
    LatLngBounds: new () => { extend(p: LatLng): void; isEmpty(): boolean };
    InfoWindow: new () => { setContent(c: string | Node): void; open(o: Record<string, unknown>): void };
  };
};

let loader: Promise<GoogleNS> | null = null;
function loadMaps(key: string): Promise<GoogleNS> {
  const w = window as unknown as { google?: GoogleNS; __wandrMapsReady?: () => void };
  if (w.google?.maps) return Promise.resolve(w.google);
  loader ??= new Promise((resolve, reject) => {
    w.__wandrMapsReady = () => resolve(w.google!);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__wandrMapsReady&loading=async`;
    s.async = true;
    s.onerror = () => {
      loader = null;
      reject(new Error("maps_failed"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

const COLORS = ["#e4572e", "#2e86ab", "#7b2cbf", "#2a9d8f", "#f4a261", "#6c757d"];

export function TripMap({ apiKey, groups }: { apiKey: string; groups: MapGroup[] }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMaps(apiKey)
      .then((g) => {
        if (cancelled || !el.current) return;
        const map = new g.maps.Map(el.current, { mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
        const bounds = new g.maps.LatLngBounds();
        const info = new g.maps.InfoWindow();
        groups.forEach((grp, gi) => {
          for (const i of grp.ideas) {
            if (i.lat == null || i.lng == null) continue;
            const position = { lat: i.lat, lng: i.lng };
            bounds.extend(position);
            const m = new g.maps.Marker({
              map,
              position,
              title: i.title,
              label: { text: String(gi + 1), color: "#fff", fontSize: "11px" },
              optimized: true,
              zIndex: i.status === "planned" ? 2 : 1,
            });
            m.addListener("click", () => {
              const a = document.createElement("a");
              a.href = i.mapsUrl;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.textContent = i.title; // text only: titles come from shared links (C-21)
              info.setContent(a);
              info.open({ anchor: m, map });
            });
          }
        });
        if (!bounds.isEmpty()) map.fitBounds(bounds);
        else {
          map.setCenter({ lat: 20, lng: 0 });
          map.setZoom(2);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [apiKey, groups]);

  if (failed) return null;
  return (
    <div className="space-y-2">
      <div ref={el} className="h-72 w-full overflow-hidden rounded-xl border bg-muted lg:h-[28rem]" role="img" aria-label="Map of the trip's places. The same places are listed below." />
      {groups.length > 1 ? (
        <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-hidden>
          {groups.map((g, i) => (
            <li key={g.stopId ?? "unsorted"} className="inline-flex items-center gap-1">
              <span className="inline-grid size-4 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
                {i + 1}
              </span>
              {g.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
