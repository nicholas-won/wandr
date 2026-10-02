"use client";

/**
 * The interactive map surface. Client-only (loaded with next/dynamic, ssr: false). Picks the
 * provider (D48): Google Maps JS when a key is configured, else MapLibre + OpenFreeMap. It only
 * draws what it's given; it never fetches places itself (surprises are filtered upstream, FR-91).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  categoryToken,
  clusterPins,
  markerLabel,
  pinBounds,
  pinSetKey,
  type LocatedPin,
  type MapMarker,
} from "./map-helpers";
import type { MapAdapter, MapTheme } from "./providers/types";

export interface MapCanvasProps {
  pins: LocatedPin[];
  route: { lat: number; lng: number }[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  interactive: boolean;
  cluster: boolean;
  groupNames?: Map<string, string>;
  ariaLabel: string;
  className?: string;
  onFail: () => void;
}

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function currentTheme(): MapTheme {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export default function MapCanvas(props: MapCanvasProps) {
  const { pins, route, selectedId, onSelect, interactive, cluster, groupNames, ariaLabel, className, onFail } = props;
  const el = useRef<HTMLDivElement>(null);
  const adapter = useRef<MapAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(2);
  const reduced = useReducedMotion();
  const callbacks = useRef({ onSelect, onFail });
  useEffect(() => {
    callbacks.current = { onSelect, onFail };
  });
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let made: MapAdapter | null = null;
    const container = el.current;
    if (!container) return;
    const opts = {
      container,
      theme: currentTheme(),
      interactive,
      initialBounds: pinBounds(pinsRef.current),
      onZoom: (z: number) => setZoom(Math.floor(z)),
      onMarkerClick: (m: MapMarker) => {
        if (m.kind === "pin") callbacks.current.onSelect?.(m.pin.id);
        else {
          const ids = new Set(m.pinIds);
          const b = pinBounds(pinsRef.current.filter((p) => ids.has(p.id)), 0.002);
          if (b) adapter.current?.fitBounds(b, !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        }
      },
      onError: () => {
        if (!cancelled) callbacks.current.onFail();
      },
    };
    (async () => {
      try {
        if (GOOGLE_KEY) {
          const { createGoogle } = await import("./providers/google");
          made = await createGoogle(GOOGLE_KEY, opts);
        } else {
          const { createMapLibre, webglAvailable } = await import("./providers/maplibre");
          if (!webglAvailable()) throw new Error("no_webgl");
          made = createMapLibre(opts);
        }
        if (cancelled) {
          made.destroy();
          return;
        }
        adapter.current = made;
        setZoom(Math.floor(made.getZoom()));
        setReady(true);
      } catch {
        if (!cancelled) callbacks.current.onFail();
      }
    })();
    return () => {
      cancelled = true;
      made?.destroy();
      adapter.current = null;
    };
  }, [interactive]);

  // Follow light/dark changes.
  useEffect(() => {
    if (!ready) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => adapter.current?.setTheme(currentTheme());
    mq.addEventListener("change", update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq.removeEventListener("change", update);
      obs.disconnect();
    };
  }, [ready]);

  // Re-fit when the set of pins changes (Stop filter, day switch), not on selection.
  const setKey = pinSetKey(pins);
  const firstFit = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstFit.current) {
      firstFit.current = false;
      return; // initial bounds were passed at creation
    }
    const b = pinBounds(pinsRef.current);
    if (b) adapter.current?.fitBounds(b, !reduced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fit only when the pin set changes
  }, [ready, setKey]);

  const markers = useMemo(
    () => clusterPins(pins, zoom, { selectedId, cluster, groupNames }),
    [pins, zoom, selectedId, cluster, groupNames],
  );

  useEffect(() => {
    if (!ready) return;
    adapter.current?.draw(
      markers.map((m) => ({
        marker: m,
        token: m.kind === "pin" ? categoryToken(m.pin.category) : "--foreground",
        selected: m.kind === "pin" && m.pin.id === selectedId,
        dimmed: m.kind === "pin" && !!m.pin.dimmed,
        ariaLabel: markerLabel(m),
      })),
      route,
    );
  }, [ready, markers, route, selectedId]);

  // Keep the selected pin in view (no fly animation under reduced motion).
  useEffect(() => {
    if (!ready || !selectedId) return;
    const p = pinsRef.current.find((x) => x.id === selectedId);
    if (p) adapter.current?.reveal(p, !reduced);
  }, [ready, selectedId, reduced]);

  return (
    <div
      ref={el}
      role={interactive ? "region" : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      aria-hidden={interactive ? undefined : true}
      className={className}
    />
  );
}
