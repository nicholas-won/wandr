"use client";

/**
 * Plan page map (FR-O7): the chosen day's items in order with the route drawn between them.
 * Desktop: a sticky rail next to the days. Phone: a collapsed "Show map" that only loads the map
 * when opened. Only one map instance is ever mounted.
 */
import { useEffect, useState } from "react";
import { ChevronDown, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isLocated, type MapPin } from "./map-helpers";
import { TripMap } from "./trip-map";

export interface PlanMapDay {
  key: string;
  label: string;
  /** In plan order; labels ("1", "2"…) are added here. */
  pins: MapPin[];
}

function useMedia(query: string): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const set = () => setOn(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, [query]);
  return on;
}

export function PlanMapRail({ days, className }: { days: PlanMapDay[]; className?: string }) {
  const mapped = days.filter((d) => d.pins.some(isLocated));
  const [dayKey, setDayKey] = useState<string | null>(mapped[0]?.key ?? null);
  const [open, setOpen] = useState(false);
  const desktop = useMedia("(min-width: 1024px)");
  if (mapped.length === 0) return null;
  const day = mapped.find((d) => d.key === dayKey) ?? mapped[0]!;
  const pins = day.pins.map((p, i) => ({ ...p, label: String(i + 1) }));

  const chooser =
    mapped.length > 1 ? (
      <div role="group" aria-label="Day on the map" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {mapped.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={d.key === day.key}
            onClick={() => setDayKey(d.key)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold",
              d.key === day.key ? "bg-foreground text-background" : "border text-muted-foreground hover:bg-muted",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
    ) : null;

  const map = (
    <TripMap layout="rail" pins={pins} route={pins.map((p) => p.id)} label={`Route for ${day.label}`} emptyText="Nothing planned this day." />
  );

  return (
    <aside aria-label="Day map" className={cn("order-first lg:order-none", className)}>
      {desktop ? (
        <div className="sticky top-6 space-y-3 rounded-xl border bg-card p-3">
          <h2 className="font-display text-base font-bold">{day.label} on the map</h2>
          {chooser}
          {map}
        </div>
      ) : (
        <div className="mb-4 rounded-xl border bg-card">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-sm font-semibold"
          >
            <MapIcon className="size-4" aria-hidden />
            <span className="flex-1 text-left">{open ? "Hide map" : `Show map for ${day.label}`}</span>
            <ChevronDown className={cn("size-4", open && "rotate-180")} aria-hidden />
          </button>
          {open && desktop === false ? (
            <div className="space-y-3 border-t p-3">
              {chooser}
              {map}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
