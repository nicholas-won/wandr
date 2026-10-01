import { AddIdea } from "@/components/trip/add-idea";
import { AutoRefresh } from "@/components/trip/auto-refresh";
import { IdeaCard } from "@/components/trip/idea-card";
import { notFound } from "next/navigation";
import { loadTripView, tripContext } from "@/server/context";

export default async function IdeasPage({ params }: PageProps<"/t/[tripId]">) {
  const { tripId } = await params;
  const { session } = await tripContext(tripId);
  const view = await loadTripView(tripId);
  if (!view) notFound();
  const { size } = view.trip;
  const processing = view.ideas.some((c) => c.processing);
  const unvoted = view.ideas.filter((c) => !c.myVote && !c.processing && !c.notAPlace).length;
  const canAdd = !!session.user;
  const other = view.members.find((m) => m.id !== view.me.memberId);

  return (
    <main className="space-y-4">
      <AutoRefresh active={processing} />
      {canAdd ? <AddIdea tripId={tripId} autoFocus={view.ideas.length === 0} /> : null}

      {size === "duo" && !view.me.noticesSeen.includes("duo_votes_visible") ? (
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          In 2-person trips, you and {other?.displayName ?? "your travel buddy"} see each other&apos;s votes.
        </p>
      ) : null}

      {size === "group" && unvoted > 0 ? (
        <p className="text-sm font-semibold text-primary">
          {unvoted} {unvoted === 1 ? "idea needs" : "ideas need"} your vote
        </p>
      ) : null}

      {view.ideas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-display text-xl font-bold text-foreground">Drop a TikTok, get a vote.</p>
          <p className="mt-1 text-sm">
            Paste any link (TikTok, Instagram, Google Maps) or type an idea. We&apos;ll find the place.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {view.ideas.map((card) => (
            <li key={card.id}>
              <IdeaCard tripId={tripId} card={card} size={size} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
