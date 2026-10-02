import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PollCard } from "@/components/trip/planning/poll-card";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { loadPlanning } from "@/server/planning-context";
import { listPolls } from "@/server/polls";

/** FR-47/48, FR-S12: polls next to the stages. Hidden in solo trips (§6.10). */
export default async function PollsPage({ params }: PageProps<"/t/[tripId]/polls">) {
  const { tripId } = await params;
  const plan = await loadPlanning(tripId);
  if (!plan || plan.size === "solo") notFound();
  const { db, claims } = await tripContext(tripId);
  const all = await listPolls(db, claims, tripId);
  const open = all.filter((p) => p.status === "open" || p.status === "paused" || p.status === "needs_decision");
  const done = all.filter((p) => p.status === "decided");
  const base = `${routes.trip(tripId)}/polls`;

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Polls</h2>
        {plan.me.isOrganizer ? (
          <Link href={`${base}/new`} className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden /> New poll
          </Link>
        ) : null}
      </div>

      {all.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-display text-lg font-bold text-foreground">No polls yet</p>
          <p className="mt-1 text-sm">
            {plan.me.isOrganizer
              ? "Ask the group to choose: a theme, matching shirts, which hotel, who's driving."
              : "When an organizer asks the group to choose something, it shows up here."}
          </p>
        </div>
      ) : null}

      {open.length ? (
        <ul className="grid gap-3 xl:grid-cols-2">
          {open.map((p) => (
            <li key={p.id}>
              <PollCard tripId={tripId} poll={p} />
            </li>
          ))}
        </ul>
      ) : null}

      {done.length ? (
        <section aria-labelledby="decided-h" className="space-y-3">
          <h3 id="decided-h" className="font-display text-lg font-bold">
            Decided
          </h3>
          <ul className="grid gap-3 xl:grid-cols-2">
            {done.map((p) => (
              <li key={p.id}>
                <PollCard tripId={tripId} poll={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
