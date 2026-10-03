import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bookmark, Plus } from "lucide-react";
import { getDb } from "@wandr/db";
import { AppHeader } from "@/components/app/app-header";
import { buttonVariants } from "@/components/ui/button";
import { PasteStartForm } from "@/components/marketing/start-forms";
import { getSession, requireFullOrRedirect } from "@/lib/auth/session";
import { libraryRoutes } from "@/lib/library-routes";
import { routes } from "@/lib/routes";
import { countMySaves } from "@/server/library";
import { listMyTrips } from "@/server/trips";

export const metadata: Metadata = { title: "Your trips" };

const SIZE_LABEL = { solo: "Just you", duo: "Two of you", group: "Group trip" } as const;

/** The app's home (D64). The website lives at `/`. */
export default async function TripsPage() {
  await requireFullOrRedirect(routes.home);
  const session = await getSession();
  const db = await getDb();
  const trips = session.user ? await listMyTrips(db, session.user.userId) : [];
  const saves = session.user ? await countMySaves(db, session.user.userId) : 0;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight lg:text-4xl">Your trips</h1>
            <p className="mt-1 text-muted-foreground">
              {trips.length === 0 ? "Nothing planned yet." : `${trips.length} ${trips.length === 1 ? "trip" : "trips"}`}
            </p>
          </div>
          <Link href={routes.start} className={buttonVariants({ className: "hidden sm:inline-flex" })}>
            <Plus aria-hidden /> Plan a new trip
          </Link>
        </div>

        {/* Phones: capture-first (D64) */}
        <PasteStartForm className="mt-6 sm:hidden" label="Start from a TikTok or link" />

        {trips.length === 0 ? (
          <div className="mt-8 grid gap-4 rounded-3xl border border-dashed p-8 text-center lg:p-14">
            <p className="font-display text-2xl font-bold">Start your first trip</p>
            <p className="mx-auto max-w-md text-muted-foreground">
              Pick where you&apos;re going, or start from a TikTok you saved. You can invite friends any time.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={routes.start} className={buttonVariants()}>
                Plan a trip
              </Link>
              {saves > 0 ? (
                <Link href={libraryRoutes.home} className={buttonVariants({ variant: "outline" })}>
                  <Bookmark aria-hidden /> Start from your library
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((t) => (
              <li key={t.id}>
                <Link
                  href={routes.trip(t.id)}
                  className="group flex h-full flex-col justify-between gap-6 rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="font-display text-xl font-bold leading-tight">{t.name}</span>
                  <span className="flex items-center justify-between text-sm text-muted-foreground">
                    {SIZE_LABEL[t.size]}
                    <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={routes.start}
                className="flex h-full min-h-28 items-center justify-center gap-2 rounded-2xl border border-dashed p-5 font-semibold text-muted-foreground hover:bg-card hover:text-foreground"
              >
                <Plus className="size-5" aria-hidden /> New trip
              </Link>
            </li>
          </ul>
        )}
      </main>
    </div>
  );
}
