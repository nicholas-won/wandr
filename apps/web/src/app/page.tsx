import Link from "next/link";
import { ArrowRight, Bookmark } from "lucide-react";
import { getDb } from "@wandr/db";
import { Brand } from "@/components/brand";
import { Landing } from "@/components/marketing/landing";
import { ClassicSetupForm, PasteStartForm } from "@/components/marketing/start-forms";
import { getSession } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { libraryRoutes } from "@/lib/library-routes";
import { countMySaves } from "@/server/library";
import { listMyTrips } from "@/server/trips";

/** Visitors get the landing page; people with trips get their planning dashboard. */
export default async function Home() {
  const session = await getSession();
  const db = await getDb();
  const trips = session.user ? await listMyTrips(db, session.user.userId) : [];
  // P2 / §6.12: the Library appears only once the person has saved something of their own.
  const saves = session.user ? await countMySaves(db, session.user.userId) : 0;
  if (trips.length === 0 && saves === 0) return <Landing />;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-12 pt-6 lg:px-8">
      <header className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-4">
          {saves > 0 ? (
            <Link
              href={libraryRoutes.home}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <Bookmark className="size-4" aria-hidden /> Library · {saves}
            </Link>
          ) : null}
          {session.user?.provisional ? (
            <Link href={routes.signin()} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="trips-h" className="space-y-4">
          <h1 id="trips-h" className="font-display text-3xl font-extrabold tracking-tight">
            Your trips
          </h1>
          {trips.length === 0 ? (
            <p className="text-muted-foreground">
              No trips yet.{" "}
              <Link href={libraryRoutes.home} className="font-semibold text-primary hover:underline">
                Start one from your library
              </Link>{" "}
              or plan a new one.
            </p>
          ) : null}
          <ul className="grid gap-3 sm:grid-cols-2">
            {trips.map((t) => (
              <li key={t.id}>
                <Link
                  href={routes.trip(t.id)}
                  className="group flex h-full items-center justify-between rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md"
                >
                  <span>
                    <span className="block font-display text-lg font-bold">{t.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {t.size === "solo" ? "Just you" : t.size === "duo" ? "Two of you" : "Group trip"}
                    </span>
                  </span>
                  <ArrowRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {/* Phones: capture-first */}
          <PasteStartForm className="pt-4 lg:hidden" label="Start a trip from a link" />
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border bg-card p-6 shadow-sm">
            <h2 className="mb-4 font-display text-xl font-bold">Plan a new trip</h2>
            <ClassicSetupForm />
          </div>
          <PasteStartForm className="hidden lg:block" label="Or start from a TikTok or link" idPrefix="side-paste" />
        </aside>
      </div>
    </div>
  );
}
