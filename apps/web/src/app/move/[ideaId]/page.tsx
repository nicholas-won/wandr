import { notFound } from "next/navigation";
import { getDb } from "@wandr/db";
import { Brand } from "@/components/brand";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { movableIdea } from "@/server/text-intake";
import { MoveButton } from "../move-button";

/**
 * LB-7: "Saved to Lisbon trip · move to library?" from a texted-in link.
 * TX7: if others already voted on it, it can still move, with a clear warning that their votes
 * are lost (the library copy never carries votes).
 */
export default async function MoveIdeaPage({ params }: PageProps<"/move/[ideaId]">) {
  const { ideaId } = await params;
  const user = await requireFullOrRedirect(`/move/${ideaId}`);
  const idea = await movableIdea(await getDb(), user.userId, ideaId);
  if (!idea) notFound();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-6">
      <Brand />
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Move to your library?</h1>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{idea.title}</span> is in {idea.tripName}. Move it to your
          library to save it for someday instead.
        </p>
      </div>
      {idea.othersVoted ? (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold">People already voted on this.</p>
          <p className="mt-1 text-muted-foreground">
            Moving it takes it out of the trip and their votes are lost. Your library copy won&apos;t have any votes.
          </p>
        </div>
      ) : null}
      <MoveButton
        kind="idea"
        id={ideaId}
        label={idea.othersVoted ? "Move anyway, votes will be lost" : "Move to my library"}
        variant={idea.othersVoted ? "destructive" : "primary"}
        confirmVotesLost={idea.othersVoted}
      />
    </main>
  );
}
