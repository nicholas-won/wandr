/**
 * Library home (FR-L6): places, not a feed. A grid of cities grouped by country ("Lisbon · 14"),
 * with the in-app trip-ready nudge (FR-L10; never by SMS) and a map toggle (FR-L7).
 */
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { groupLibrary, isPending } from "@wandr/core/library";
import { AutoRefresh } from "@/components/trip/auto-refresh";
import { categoryLabel, countryName, tileName } from "@/components/library/format";
import { SaveInput } from "@/components/library/save-input";
import { SaveMap } from "@/components/library/save-map";
import { CATEGORY_EMOJI } from "@/components/library/format";
import { cn } from "@/lib/utils";
import { libraryRoutes } from "@/lib/library-routes";
import { listMySaves } from "@/server/library";
import { libraryContext } from "@/server/library-context";

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const { view } = await searchParams;
  const { db, userId } = await libraryContext();
  const saves = userId ? await listMySaves(db, userId) : [];
  const groups = groupLibrary(saves);
  const pending = saves.filter(isPending);
  const ready = groups.flatMap((g) => g.tiles).filter((t) => t.readiness.ready && t.level !== "unsorted");
  const isMap = view === "map";

  return (
    <main className="space-y-6">
      <AutoRefresh active={pending.length > 0} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Your library</h1>
          <p className="text-sm text-muted-foreground">Save it now, go someday. Only you can see this.</p>
        </div>
        {saves.length ? (
          <nav aria-label="Library view" className="flex gap-1 rounded-full bg-muted p-1 text-sm font-semibold">
            <Link
              href={libraryRoutes.home}
              aria-current={!isMap ? "page" : undefined}
              className={cn("rounded-full px-4 py-1.5", !isMap ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              Places
            </Link>
            <Link
              href={libraryRoutes.map}
              aria-current={isMap ? "page" : undefined}
              className={cn("rounded-full px-4 py-1.5", isMap ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              Map
            </Link>
          </nav>
        ) : null}
      </div>

      <div className="lg:max-w-xl">
        <SaveInput autoFocus={saves.length === 0} />
      </div>

      {pending.length ? (
        <p className="text-sm font-medium text-muted-foreground" role="status">
          Sorting {pending.length} {pending.length === 1 ? "save" : "saves"}…
        </p>
      ) : null}

      {saves.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-display text-xl font-bold text-foreground">Nothing saved yet</p>
          <p className="mt-1 text-sm">Paste a TikTok, Reel or any link. We&apos;ll file it by country, city and kind of place.</p>
        </div>
      ) : isMap ? (
        <SaveMap
          points={saves
            .filter((s) => !isPending(s))
            .map((s) => ({
              id: s.id,
              title: s.title,
              lat: s.lat,
              lng: s.lng,
              placeId: s.placeId,
              group: s.regionOrCityOverride ?? s.regionOrCity ?? countryName(s.countryOverride ?? s.country) ?? "Not sorted yet",
              href: libraryRoutes.save(s.id),
            }))}
        />
      ) : (
        <>
          {ready.map((t) => (
            <Link
              key={t.key}
              href={`${libraryRoutes.place(t.key)}?start=1`}
              className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3 text-secondary-foreground hover:brightness-95"
            >
              <Sparkles className="size-5 shrink-0" aria-hidden />
              <span className="font-semibold">{tileName(t)} is trip-ready: start a trip?</span>
            </Link>
          ))}
          {groups.map((g) => (
            <section key={g.country ?? "none"} aria-labelledby={`c-${g.country ?? "none"}`} className="space-y-3">
              <h2 id={`c-${g.country ?? "none"}`} className="font-display text-xl font-bold">
                {countryName(g.country) ?? "Somewhere"} <span className="text-muted-foreground">· {g.count}</span>
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {g.tiles.map((t) => {
                  const cover = t.saves.find((s) => s.thumbnailUrl)?.thumbnailUrl;
                  const top = t.saves[0]?.categoryOverride ?? t.saves[0]?.category ?? "other";
                  return (
                    <li key={t.key}>
                      <Link
                        href={libraryRoutes.place(t.key)}
                        className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border bg-muted shadow-sm"
                      >
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote, untrusted hosts
                          <img src={cover} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover transition group-hover:scale-[1.02]" />
                        ) : (
                          <span aria-hidden className="absolute inset-0 grid place-items-center text-5xl">
                            {CATEGORY_EMOJI[top] ?? "✨"}
                          </span>
                        )}
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white">
                          <span className="block font-display text-lg font-bold leading-tight">
                            {tileName(t)} · {t.count}
                          </span>
                          <span className="text-xs opacity-90">
                            {t.level === "country"
                              ? "Whole country / region"
                              : t.level === "unsorted"
                                ? "Needs a place"
                                : t.readiness.ready
                                  ? "Trip-ready"
                                  : categoryLabel(top)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
