import { notFound, redirect } from "next/navigation";
import { STAGE_ORDER } from "@wandr/core";
import { PollForm } from "@/components/trip/planning/poll-form";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { loadPlanning } from "@/server/planning-context";
import { pollableIdeas } from "@/server/polls";

/** FR-47 / FR-S12: organizers start a poll (duo and group trips only, §6.10). */
export default async function NewPollPage({ params }: PageProps<"/t/[tripId]/polls/new">) {
  const { tripId } = await params;
  const plan = await loadPlanning(tripId);
  if (!plan || plan.size === "solo") notFound();
  if (!plan.me.isOrganizer) redirect(`${routes.trip(tripId)}/polls`);
  const { db, claims } = await tripContext(tripId);
  const ideas = await pollableIdeas(db, claims, tripId);
  const stages = STAGE_ORDER.filter((k) => {
    const s = plan.stages.find((x) => x.kind === k);
    return s?.status !== "not_needed" && (k !== "getting_around" || plan.stops.length > 1);
  });
  return (
    <main className="max-w-2xl space-y-4">
      <h2 className="font-display text-xl font-bold">New poll</h2>
      <PollForm
        tripId={tripId}
        ideas={ideas.map((i) => ({ id: i.id, title: i.title, stopId: i.stopId }))}
        stops={plan.showStops ? plan.stops.map((s) => ({ id: s.id, name: s.name })) : []}
        stages={stages}
      />
    </main>
  );
}
