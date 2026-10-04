import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PollCard } from "@/components/trip/planning/poll-card";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { getPoll } from "@/server/polls";

/** One poll: the place a personal-link guest lands to vote (FR-47, P4 "2 taps"). */
export default async function PollPage({ params }: PageProps<"/t/[tripId]/polls/[pollId]">) {
  const { tripId, pollId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(pollId)) notFound();
  const { db, claims } = await tripContext(tripId);
  const poll = await getPoll(db, claims, tripId, pollId);
  if (!poll) notFound();
  return (
    <main className="max-w-2xl space-y-4">
      <Link
        href={`${routes.trip(tripId)}/polls`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All polls
      </Link>
      <PollCard tripId={tripId} poll={poll} detail />
    </main>
  );
}
