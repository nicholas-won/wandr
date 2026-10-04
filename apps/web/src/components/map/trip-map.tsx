"use client";

/**
 * The one map used everywhere (FR-122 trip map, FR-L7 library map, FR-O7 day route).
 * - Always tries to render an interactive map: Google Maps JS with a key (D48), else MapLibre on
 *   OpenFreeMap. Without WebGL, or if the map can't load, the list below carries everything.
 * - The map is supplementary: a keyboard-usable list of the same pins sits next to or under it,
 *   with selection synced both ways.
 * - It draws only the pins it's handed. Never add another data source here (surprise privacy,
 *   FR-91: callers pass RLS-filtered data).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ExternalLink, MapPin as MapPinIcon, Route, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryToken, isLocated, legendFor, routeCoordinates, type MapPin, type MapStop } from "./map-helpers";

const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="size-full motion-safe:animate-pulse bg-muted" />,
});

export type TripMapLayout = "split" | "stacked" | "rail" | "mini";

export interface TripMapProps {
  pins: MapPin[];
  /** Groups the list (and clusters when zoomed out) by Stop; order is kept. */
  stops?: MapStop[];
  /** The Stop's coordinates: the map opens there when no place is located yet (FR-S9). */
  center?: { lat: number; lng: number } | null;
  /** Ordered pin ids for a day's plan, drawn as a line (FR-O7). Turns clustering off. */
  route?: string[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  layout?: TripMapLayout;
  /** Accessible name for the map region ("Map of Lisbon"). */
  label?: string;
  emptyText?: string;
  /** Extra content above the list (e.g. a heading). */
  listHeader?: ReactNode;
  className?: string;
}

const MAP_BOX: Record<TripMapLayout, string> = {
  split: "h-[45vh] min-h-64 lg:h-[calc(100dvh-4rem)] lg:min-h-[28rem]",
  stacked: "h-[50vh] min-h-72 lg:h-[60vh]",
  rail: "h-72 lg:h-[22rem]",
  mini: "h-40",
};

function useIsDesktop(): boolean {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

export function TripMap({
  pins,
  stops,
  center = null,
  route,
  selectedId: controlled,
  onSelect,
  layout = "stacked",
  label = "Map of these places",
  emptyText = "Nothing to map yet.",
  listHeader,
  className,
}: TripMapProps) {
  const [own, setOwn] = useState<string | null>(null);
  const selectedId = controlled !== undefined ? controlled : own;
  const [failed, setFailed] = useState(false);
  const isDesktop = useIsDesktop();
  const items = useRef(new Map<string, HTMLElement>());

  const located = useMemo(() => pins.filter(isLocated), [pins]);
  const routeLine = useMemo(() => routeCoordinates(route, located), [route, located]);
  const groupNames = useMemo(() => new Map((stops ?? []).map((s) => [s.id, s.name])), [stops]);
  const legend = useMemo(() => legendFor(located), [located]);
  const selected = pins.find((p) => p.id === selectedId) ?? null;
  const mini = layout === "mini";
  const showMap = (located.length > 0 || (!!center && !mini)) && !failed;

  const select = useCallback(
    (id: string | null, fromMap = false) => {
      if (controlled === undefined) setOwn(id);
      onSelect?.(id);
      if (fromMap && id && isDesktop) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        items.current.get(id)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      }
    },
    [controlled, onSelect, isDesktop],
  );
  const onMapSelect = useCallback((id: string) => select(id, true), [select]);
  const onFail = useCallback(() => setFailed(true), []);
  // The mini-map sits in CSS-hidden rails on phones: only load map code once it's actually shown.
  const miniRef = useRef<HTMLDivElement>(null);
  const [miniVisible, setMiniVisible] = useState(false);
  useEffect(() => {
    const node = miniRef.current;
    if (!mini || !node || miniVisible) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setMiniVisible(true);
    });
    io.observe(node);
    return () => io.disconnect();
  }, [mini, miniVisible, showMap]);

  if (mini) {
    return showMap ? (
      <div ref={miniRef} className={cn("overflow-hidden rounded-lg border bg-muted", MAP_BOX.mini, className)}>
        {miniVisible ? (
          <MapCanvas pins={located} route={routeLine} selectedId={null} interactive={false} cluster groupNames={groupNames} ariaLabel={label} className="size-full" onFail={onFail} />
        ) : null}
      </div>
    ) : null;
  }

  const mapBlock = showMap ? (
    <div className={cn("space-y-2", layout === "split" && "order-first lg:sticky lg:top-6 lg:order-last lg:self-start")}>
      <div className={cn("relative overflow-hidden rounded-xl border bg-muted", MAP_BOX[layout])}>
        <MapCanvas
          pins={located}
          route={routeLine}
          center={center}
          selectedId={selectedId}
          onSelect={onMapSelect}
          interactive
          cluster={!route?.length}
          groupNames={groupNames}
          ariaLabel={`${label}: ${located.length} ${located.length === 1 ? "place" : "places"}. The same places are listed ${layout === "split" ? "alongside" : "below"}.`}
          className="size-full"
          onFail={onFail}
        />
        {selected ? <SelectedBar pin={selected} onClose={() => select(null)} /> : null}
      </div>
      {legend.length > 1 ? (
        <ul aria-hidden className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {legend.map((l) => (
            <li key={l.token} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: `var(${l.token})` }} />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : failed && located.length ? (
    <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground" role="status">
      The map couldn&apos;t load here. Every place is in the list.
    </p>
  ) : null;

  const list =
    pins.length === 0 ? (
      <p className="text-sm text-muted-foreground">{emptyText}</p>
    ) : (
      <PinList
        pins={pins}
        stops={stops}
        selectedId={selectedId}
        onSelect={(id) => select(id === selectedId ? null : id)}
        register={(id, node) => {
          if (node) items.current.set(id, node);
          else items.current.delete(id);
        }}
        compact={layout === "rail"}
        canSelect={showMap}
      />
    );

  if (layout === "split") {
    return (
      <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start", className)}>
        {mapBlock}
        <div className="order-last min-w-0 space-y-3 lg:order-first">
          {listHeader}
          {list}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("space-y-4", className)}>
      {mapBlock}
      {listHeader}
      {list}
    </div>
  );
}

function SelectedBar({ pin, onClose }: { pin: MapPin; onClose: () => void }) {
  return (
    <div className="absolute left-2 right-12 top-2 z-10 flex items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 text-sm shadow-md backdrop-blur" aria-live="polite">
      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: `var(${categoryToken(pin.category)})` }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{pin.title}</span>
        {pin.subtitle ? <span className="block truncate text-xs text-muted-foreground">{pin.subtitle}</span> : null}
      </span>
      {pin.href ? (
        <Link href={pin.href} className="shrink-0 text-xs font-semibold text-primary hover:underline">
          Open
        </Link>
      ) : null}
      {pin.mapsUrl ? (
        <a
          href={pin.mapsUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label={`Open ${pin.title} in Google Maps`}
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : null}
      <button type="button" onClick={onClose} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Clear selection">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

interface PinListProps {
  pins: MapPin[];
  stops?: MapStop[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  register: (id: string, node: HTMLElement | null) => void;
  compact: boolean;
  canSelect: boolean;
}

function PinList({ pins, stops, selectedId, onSelect, register, compact, canSelect }: PinListProps) {
  const sections = useMemo(() => {
    if (!stops?.length) return [{ id: "all", name: null as string | null, routeUrls: [] as string[], pins }];
    const known = new Set(stops.map((s) => s.id));
    const out = stops.map((s) => ({ id: s.id, name: s.name as string | null, routeUrls: s.routeUrls ?? [], pins: pins.filter((p) => (p.stopId ?? "") === s.id) }));
    const rest = pins.filter((p) => !known.has(p.stopId ?? ""));
    if (rest.length) out.push({ id: "__rest", name: "Other places", routeUrls: [], pins: rest });
    return out;
  }, [pins, stops]);
  const headed = sections.length > 1 || !!sections[0]?.name;

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-4")}>
      {sections.map((s) => (
        <section key={s.id} aria-labelledby={headed ? `pins-${s.id}` : undefined} className={cn(!compact && "rounded-xl border bg-card")}>
          {headed ? (
            <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1", compact ? "pb-1" : "border-b px-4 py-3")}>
              <h2 id={`pins-${s.id}`} className={cn("font-display font-bold", compact ? "text-sm" : "text-lg")}>
                {s.name} <span className="font-normal text-muted-foreground">· {s.pins.length}</span>
              </h2>
              {s.routeUrls.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline">
                  <Route className="size-3.5" aria-hidden />
                  {s.routeUrls.length > 1 ? `Open in Google Maps (${i + 1}/${s.routeUrls.length})` : "Open in Google Maps"}
                </a>
              ))}
            </div>
          ) : null}
          {s.pins.length === 0 ? (
            <p className={cn("text-sm text-muted-foreground", !compact && "px-4 py-3")}>No places here yet.</p>
          ) : (
            <ul className={cn(compact ? "space-y-1" : "divide-y")}>
              {s.pins.map((p) => {
                const on = p.id === selectedId;
                const has = isLocated(p);
                const body = (
                  <>
                    <span
                      aria-hidden
                      className={cn("grid shrink-0 place-items-center rounded-full text-[11px] font-bold", p.label ? "size-6" : "size-3", !has && "opacity-40")}
                      style={{ background: `var(${categoryToken(p.category)})`, color: "var(--vote-foreground)" }}
                    >
                      {p.label}
                    </span>
                    <span className={cn("min-w-0 flex-1", p.dimmed && "opacity-60")}>
                      <span className="block truncate font-medium">{p.title}</span>
                      {p.subtitle || !has ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {[p.subtitle, has ? null : "No pin yet"].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                  </>
                );
                return (
                  <li key={p.id} ref={(n) => register(p.id, n)} className={cn("flex items-center gap-1", compact ? "rounded-lg" : "px-2", on && "bg-accent/60")}>
                    {has && canSelect ? (
                      <button
                        type="button"
                        onClick={() => onSelect(p.id)}
                        aria-pressed={on}
                        aria-label={`${p.label ? `${p.label}. ` : ""}${p.title}: show on map`}
                        className={cn(
                          "flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        {body}
                      </button>
                    ) : (
                      <span className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-2 py-2 text-sm">{body}</span>
                    )}
                    {p.href ? (
                      <Link href={p.href} className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-primary hover:bg-muted" aria-label={`Open ${p.title}`}>
                        Open
                      </Link>
                    ) : null}
                    {p.mapsUrl ? (
                      <a
                        href={p.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        aria-label={`Open ${p.title} in Google Maps`}
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                      >
                        {has ? <MapPinIcon className="size-4" aria-hidden /> : <ExternalLink className="size-4" aria-hidden />}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
