"use client";

/**
 * FR-L7: map of saves, clustered by city when zoomed out (LB-10). Uses the shared TripMap
 * (MapLibre/OpenFreeMap, or Google Maps JS with a key; D48) with the same saves listed by city,
 * so the list stays the keyboard and screen-reader path.
 */
import { useMemo } from "react";
import { TripMap } from "@/components/map/trip-map";
import type { MapPin, MapStop } from "@/components/map/map-helpers";
import { categoryLabel, mapsLink } from "./format";

export interface MapPoint {
  id: string;
  title: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  /** City or region label used for clustering ("Lisbon"). */
  group: string;
  category?: string | null;
  href?: string;
}

export function SaveMap({ points, label = "Map of your saves" }: { points: MapPoint[]; label?: string }) {
  const { pins, stops } = useMemo(() => {
    const names: string[] = [];
    const pins: MapPin[] = points.map((p) => {
      if (!names.includes(p.group)) names.push(p.group);
      const category = p.category ?? "other";
      return {
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        title: p.title,
        category,
        group: p.group,
        stopId: p.group,
        subtitle: categoryLabel(category),
        href: p.href,
        mapsUrl: mapsLink(p),
      };
    });
    const stops: MapStop[] | undefined = names.length > 1 ? names.map((n) => ({ id: n, name: n })) : undefined;
    return { pins, stops };
  }, [points]);

  return <TripMap layout="stacked" pins={pins} stops={stops} label={label} emptyText="Nothing to map yet." />;
}
