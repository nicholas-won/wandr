import { notFound } from "next/navigation";
import { getDb } from "@wandr/db";
import { Brand } from "@/components/brand";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { movableSave } from "@/server/text-intake";
import { MoveButton } from "../../move-button";

/** LB-7: a texted-in link landed in the library; send it to one of your trips. */
export default async function MoveSavePage({ params }: PageProps<"/move/saved/[savedId]">) {
  const { savedId } = await params;
  const user = await requireFullOrRedirect(`/move/saved/${savedId}`);
  const ctx = await movableSave(await getDb(), user.userId, savedId);
  if (!ctx) notFound();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-6">
      <Brand />
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Add to a trip?</h1>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{ctx.save.title}</span> is saved in your library. Pick a trip
          to add it to. It stays in your library too.
        </p>
      </div>
      {ctx.trips.length ? (
        <ul className="space-y-2">
          {ctx.trips.map((t) => (
            <li key={t.id}>
              <MoveButton kind="save" id={savedId} tripId={t.id} label={t.name} variant="outline" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">You aren&apos;t in any trips yet.</p>
      )}
    </main>
  );
}
