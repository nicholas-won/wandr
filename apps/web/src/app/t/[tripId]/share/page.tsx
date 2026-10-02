import { notFound } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareButton } from "@/components/share/share-sheet";
import { tripContext } from "@/server/context";
import { shareMoments } from "@/server/share";

/**
 * FR-80a "Share this to the group chat?" prompts (organizers) and quick idea sharing (anyone).
 * Hidden in solo trips (§6.10). Duo trips read "Send to Sam".
 */
export default async function SharePage({ params }: PageProps<"/t/[tripId]/share">) {
  const { tripId } = await params;
  const { db, claims } = await tripContext(tripId);
  const m = await shareMoments(db, claims, tripId);
  if (!m) notFound();
  const [first, ...rest] = m.prompts;

  return (
    <main className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-4">
        {first ? (
          <Card>
            <CardHeader>
              <Badge className="w-fit">{first.why}</Badge>
              <CardTitle className="text-xl">{first.title}</CardTitle>
              <CardDescription>
                {m.label === "Share to the group chat"
                  ? "Share this to the group chat? Everyone can tap to vote, no app needed."
                  : "It goes from your phone, so it's free. They can tap to vote."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ShareButton tripId={tripId} kind={first.kind} subjectId={first.subjectId} label={m.label} block />
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            <MessagesSquare className="mx-auto mb-2 size-8" aria-hidden />
            <p className="font-display text-xl font-bold text-foreground">Nothing new to share</p>
            <p className="mt-1 text-sm">
              {m.isOrganizer
                ? "New votes, decisions and the daily idea roundup show up here."
                : "You can still share any new idea below."}
            </p>
          </div>
        )}

        {rest.length ? (
          <section aria-labelledby="more-h" className="space-y-2">
            <h2 id="more-h" className="font-display text-lg font-bold">
              Also worth sharing
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {rest.map((p) => (
                <li key={`${p.kind}:${p.subjectId}`} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.why}</p>
                    <p className="font-semibold">{p.title}</p>
                  </div>
                  <ShareButton tripId={tripId} kind={p.kind} subjectId={p.subjectId} label={m.label} variant="outline" size="sm" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {m.ideas.length ? (
        <aside aria-labelledby="ideas-h" className="space-y-2 lg:sticky lg:top-8">
          <h2 id="ideas-h" className="font-display text-lg font-bold">
            Share an idea
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {m.ideas.map((i) => (
              <li key={i.subjectId} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate font-medium">{i.title}</span>
                <ShareButton tripId={tripId} kind="idea" subjectId={i.subjectId} label="Share" variant="outline" size="sm" />
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </main>
  );
}
