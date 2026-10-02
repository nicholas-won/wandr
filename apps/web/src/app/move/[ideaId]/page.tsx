import { notFound } from "next/navigation";
import { getDb } from "@wandr/db";
import { Brand } from "@/components/brand";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { movableIdea } from "@/server/text-intake";
import { MoveButton } from "../move-button";

/** LB-7: "Saved to Lisbon trip · move to library?" from a texted-in link. */
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
      <MoveButton kind="idea" id={ideaId} label="Move to my library" />
    </main>
  );
}
