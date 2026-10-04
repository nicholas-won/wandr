import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TripMap } from "@/components/map/trip-map";
import type { MapPin, MapStop } from "@/components/map/map-helpers";
import { categoryLabel } from "@/components/library/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { tripContext } from "@/server/context";
import { getMapView } from "@/server/planning";
import { loadPlanning } from "@/server/planning-context";

const STATUS_LABEL: Record<string, string> = { planned: "✓ Decided", shortlisted: "⭐ Top pick", done: "Done" };
const UNSORTED = "unsorted";

/**
 * FR-122 map by Stop, built in (MapLibre/OpenFreeMap, or Google Maps JS with a key; D48).
 * FR-S9: opens on the current or next Stop with a whole-trip toggle.
 * FR-126: "Open in Google Maps" routes per Stop and per place stay as secondary actions.
 * Desktop: list left, sticky map right. Phone: map on top, list below.
 */
export default async function MapPage({ params, searchParams }: PageProps<"/t/[tripId]/map">) {
  const { tripId } = await params;
  const sp = await searchParams;
  const { db, claims } = await tripContext(tripId);
  const [groups, plan] = await Promise.all([getMapView(db, claims, tripId), loadPlanning(tripId)]);
  if (!groups || !plan) notFound();
  const multi = plan.showStops;
  const requested = typeof sp.stop === "string" ? sp.stop : undefined;
  const focus = requested === "all" ? null : (requested ?? plan.defaultStopId);
  const shown = multi && focus ? groups.filter((g) => (g.stopId ?? UNSORTED) === focus) : groups;
  const visible = shown.length ? shown : groups;
  const base = `${routes.trip(tripId)}/map`;

  const stops: MapStop[] = visible.map((g) => ({ id: g.stopId ?? UNSORTED, name: g.name, routeUrls: g.routeUrls }));
  const pins: MapPin[] = visible.flatMap((g) =>
    g.ideas.map((i) => ({
      id: i.id,
      lat: i.lat,
      lng: i.lng,
      title: i.title,
      category: i.category,
      stopId: g.stopId ?? UNSORTED,
      subtitle: [categoryLabel(i.category), STATUS_LABEL[i.status]].filter(Boolean).join(" · "),
      mapsUrl: i.mapsUrl,
      dimmed: i.status === "done",
    })),
  );
  const focusName = multi && focus ? visible[0]?.name : null;
  // FR-S9: with nothing located yet, open on the shown Stop's own coordinates.
  const center = visible.find((g) => g.center)?.center ?? null;

  return (
    <main className="space-y-4">
      {multi ? (
        <nav aria-label="Show Stop" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          <FilterLink href={`${base}?stop=all`} active={!focus}>
            Whole trip
          </FilterLink>
          {groups.map((g) => (
            <FilterLink key={g.stopId ?? "u"} href={`${base}?stop=${g.stopId ?? UNSORTED}`} active={(g.stopId ?? UNSORTED) === focus}>
              {g.name}
            </FilterLink>
          ))}
        </nav>
      ) : null}

      <TripMap
        layout="split"
        pins={pins}
        stops={stops}
        center={center}
        label={focusName ? `Map of ${focusName}` : "Map of the trip"}
        emptyText="No places yet. Ideas with a place show up here."
      />
    </main>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold",
        active ? "bg-foreground text-background" : "border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
