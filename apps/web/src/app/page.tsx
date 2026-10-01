import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDb } from "@wandr/db";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { listMyTrips } from "@/server/trips";
import { startTripAction } from "./actions";

export default async function Home() {
  const session = await getSession();
  const trips = session.user ? await listMyTrips(await getDb(), session.user.userId) : [];

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-6">
      <div className="flex items-center justify-between">
        <Brand />
        {session.user && !session.user.provisional ? null : (
          <Link href={routes.signin()} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        )}
      </div>

      {trips.length === 0 ? (
        <section className="flex flex-col justify-center gap-4 py-12">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight">
            Drop a TikTok,
            <br />
            <span className="text-primary">get a vote.</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Paste a place you found. Your friends vote by text. The plan sorts itself out.
          </p>
        </section>
      ) : (
        <section className="space-y-2 py-6" aria-labelledby="trips-h">
          <h1 id="trips-h" className="font-display text-2xl font-extrabold">
            Your trips
          </h1>
          <ul className="divide-y rounded-xl border bg-card">
            {trips.map((t) => (
              <li key={t.id}>
                <Link href={routes.trip(t.id)} className="flex items-center justify-between px-4 py-4 hover:bg-muted">
                  <span className="font-semibold">{t.name}</span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={startTripAction} className="mt-auto space-y-3">
        <label htmlFor="raw" className="text-sm font-semibold">
          {trips.length ? "Start another trip" : "Start a trip"}
        </label>
        <input
          id="raw"
          name="raw"
          autoComplete="off"
          placeholder="Paste a TikTok or link, or name your trip"
          className="h-14 w-full rounded-full border border-input bg-card px-5 text-base shadow-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="lg" block>
          Start <ArrowRight aria-hidden />
        </Button>
      </form>
    </main>
  );
}
