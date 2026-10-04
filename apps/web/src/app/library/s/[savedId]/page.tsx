/** One saved idea (§5 "Saved idea"). Also the FR-1a landing after pasting a link on the home screen. */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { effectiveSort, isPending, placeKey, suggestTrip } from "@wandr/core/library";
import { AutoRefresh } from "@/components/trip/auto-refresh";
import { categoryLabel, countryName, mapsLink, tileName } from "@/components/library/format";
import { SaveCard } from "@/components/library/save-card";
import { SaveDetail } from "@/components/library/save-detail";
import { libraryRoutes } from "@/lib/library-routes";
import { routes } from "@/lib/routes";
import { getSave, sendableTrips } from "@/server/library";
import { libraryContext } from "@/server/library-context";

export default async function SavePage({ params, searchParams }: PageProps<"/library/s/[savedId]">) {
  const { savedId } = await params;
  const { new: isNew } = await searchParams;
  const { db, userId } = await libraryContext();
  if (!userId) redirect(routes.signin(libraryRoutes.save(savedId)));
  if (!/^[0-9a-f-]{36}$/i.test(savedId)) notFound();
  const save = await getSave(db, userId, savedId);
  if (!save) notFound();
  const trips = await sendableTrips(db, userId);
  const e = effectiveSort(save);
  const pending = isPending(save);
  const suggestion = suggestTrip({ city: e.city, countryName: countryName(e.country) });
  const where = e.city || e.country ? tileName(e) : null;

  return (
    <main className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <AutoRefresh active={pending} />
      <div className="space-y-5">
        <Link href={libraryRoutes.home} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Library
        </Link>
        <SaveCard save={save} />
        {!pending && where ? (
          <p className="text-sm text-muted-foreground">
            Filed under{" "}
            <Link href={libraryRoutes.place(placeKey(e.country, e.city))} className="font-semibold text-foreground hover:underline">
              {where}
            </Link>{" "}
            · {categoryLabel(e.category)}
          </p>
        ) : null}
        <SaveDetail
          id={save.id}
          title={save.title}
          pending={pending}
          selectable={!pending && !save.listicle && save.extraction !== "failed"}
          needsReview={save.needsReview}
          country={e.country}
          city={e.city}
          category={e.category}
          hasOverride={!!(save.countryOverride || save.regionOrCityOverride || save.categoryOverride)}
          note={save.note}
          priority={save.priority}
          listicle={save.listicle}
          boards={save.boards}
          trips={trips}
          suggestedName={suggestion?.name ?? null}
          suggestedCity={suggestion?.stopName ?? null}
          fromHome={isNew === "1"}
        />
      </div>
      <aside className="space-y-4">
        {!pending && (save.lat != null || save.placeId) ? (
          <a
            href={mapsLink(save)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <ExternalLink className="size-4" aria-hidden /> Open in Google Maps
          </a>
        ) : null}
        {save.sources.length ? (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold">Sources</h2>
            <ul className="space-y-1 text-sm">
              {save.sources.map((s) =>
                s.url ? (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-muted-foreground hover:underline">
                      {s.creatorHandle ?? new URL(s.url).hostname}
                    </a>
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        ) : null}
        {save.sentTo.length ? (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold">Sent to</h2>
            <ul className="space-y-1 text-sm">
              {save.sentTo.map((t) => (
                <li key={t.tripId}>
                  <Link href={routes.trip(t.tripId)} className="hover:underline">
                    {t.tripName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </main>
  );
}
