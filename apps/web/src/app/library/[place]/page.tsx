/** A city's (or region's) saves by category, with a map toggle (FR-L6, FR-L7, FR-L10–L12). */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { groupByCategory, isPending, parsePlaceKey, preselectForTrip, savesForPlace, suggestTrip } from "@wandr/core/library";
import { AutoRefresh } from "@/components/trip/auto-refresh";
import { countryName, tileName } from "@/components/library/format";
import { PlaceSaves } from "@/components/library/place-saves";
import { SaveMap } from "@/components/library/save-map";
import { cn } from "@/lib/utils";
import { libraryRoutes } from "@/lib/library-routes";
import { routes } from "@/lib/routes";
import { listMySaves, sendableTrips } from "@/server/library";
import { libraryContext } from "@/server/library-context";

export default async function PlacePage({ params, searchParams }: PageProps<"/library/[place]">) {
  const { place } = await params;
  const { view, start } = await searchParams;
  const key = decodeURIComponent(place);
  if (!parsePlaceKey(key)) notFound();
  const { db, userId } = await libraryContext();
  if (!userId) redirect(routes.signin(libraryRoutes.place(key)));
  const saves = savesForPlace(await listMySaves(db, userId), key);
  if (saves.length === 0) notFound();
  const first = saves[0]!;
  const city = first.regionOrCityOverride ?? first.regionOrCity;
  const country = first.countryOverride ?? first.country;
  const name = tileName({ city, country });
  const suggestion = suggestTrip({ city, countryName: countryName(country) });
  const trips = await sendableTrips(db, userId);
  const isMap = view === "map";
  const base = libraryRoutes.place(key);

  return (
    <main className="space-y-5">
      <AutoRefresh active={saves.some(isPending)} />
      <Link href={libraryRoutes.home} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Library
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          {name} <span className="text-muted-foreground">· {saves.length}</span>
        </h1>
        <nav aria-label="View" className="flex gap-1 rounded-full bg-muted p-1 text-sm font-semibold">
          <Link href={base} aria-current={!isMap ? "page" : undefined} className={cn("rounded-full px-4 py-1.5", !isMap ? "bg-card shadow-sm" : "text-muted-foreground")}>
            List
          </Link>
          <Link href={`${base}?view=map`} aria-current={isMap ? "page" : undefined} className={cn("rounded-full px-4 py-1.5", isMap ? "bg-card shadow-sm" : "text-muted-foreground")}>
            Map
          </Link>
        </nav>
      </div>

      {isMap ? (
        <SaveMap
          points={saves.map((s) => ({
            id: s.id,
            title: s.title,
            lat: s.lat,
            lng: s.lng,
            placeId: s.placeId,
            group: name,
            href: libraryRoutes.save(s.id),
          }))}
        />
      ) : (
        <PlaceSaves
          groups={groupByCategory(saves).map((g) => ({
            category: g.category,
            saves: g.saves.map((s) => ({
              ...s,
              mine: true,
              selectable: !isPending(s) && !s.listicle && s.extraction !== "failed",
            })),
          }))}
          preselected={preselectForTrip(saves)}
          trips={trips}
          suggestedName={suggestion?.name ?? "New trip"}
          city={suggestion?.stopName ?? null}
          startOpen={start === "1"}
        />
      )}
    </main>
  );
}
