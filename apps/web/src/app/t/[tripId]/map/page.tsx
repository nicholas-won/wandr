import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TripMap } from "@/components/trip/planning/trip-map";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { tripContext } from "@/server/context";
import { getMapView } from "@/server/planning";
import { loadPlanning } from "@/server/planning-context";

const STATUS_LABEL: Record<string, string> = { planned: "Planned", shortlisted: "Shortlisted", done: "Done" };

/**
 * FR-122 map by Stop; FR-126 export to Google Maps (a link per place and a route per Stop).
 * FR-S9: opens on the current or next Stop with a whole-trip toggle.
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
  const shown = multi && focus ? groups.filter((g) => (g.stopId ?? "unsorted") === focus) : groups;
  const visible = shown.length ? shown : groups;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const base = `${routes.trip(tripId)}/map`;

  return (
    <main className="space-y-4">
      {multi ? (
        <nav aria-label="Show Stop" className="-mx-1 flex gap-1 overflow-x-auto">
          <FilterLink href={`${base}?stop=all`} active={!focus}>
            Whole trip
          </FilterLink>
          {groups.map((g) => (
            <FilterLink key={g.stopId ?? "u"} href={`${base}?stop=${g.stopId ?? "unsorted"}`} active={(g.stopId ?? "unsorted") === focus}>
              {g.name}
            </FilterLink>
          ))}
        </nav>
      ) : null}

      {key ? <TripMap apiKey={key} groups={visible} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {visible.map((g) => (
          <section key={g.stopId ?? "unsorted"} aria-labelledby={`g-${g.stopId ?? "u"}`} className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 id={`g-${g.stopId ?? "u"}`} className="font-display text-lg font-bold">
                {g.name}
              </h2>
              {g.routeUrls.map((u, i) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  <Route className="size-4" aria-hidden />
                  {g.routeUrls.length > 1 ? `Open in Google Maps (${i + 1}/${g.routeUrls.length})` : "Open in Google Maps"}
                </a>
              ))}
            </div>
            {g.ideas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No places here yet.</p>
            ) : (
              <ul className="divide-y">
                {g.ideas.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.title}</span>
                      {i.lat == null ? <span className="text-xs text-muted-foreground">No pin yet</span> : null}
                    </span>
                    {STATUS_LABEL[i.status] ? <Badge variant={i.status === "planned" ? "primary" : "secondary"}>{STATUS_LABEL[i.status]}</Badge> : null}
                    <a
                      href={i.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${i.title} in Google Maps`}
                      className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
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
