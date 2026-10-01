import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm, ResendLink } from "@/components/trip/invite-form";
import { loadTripView } from "@/server/context";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", organizer: "Organizer", member: "" };

export default async function PeoplePage({ params }: PageProps<"/t/[tripId]/people">) {
  const { tripId } = await params;
  const view = await loadTripView(tripId);
  if (!view) notFound();
  const isOrganizer = view.me.role !== "member";

  return (
    <main className="space-y-4">
      {isOrganizer ? (
        <Card>
          <CardHeader>
            <CardTitle>{view.trip.size === "solo" ? "Who's coming?" : "Invite someone"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              They get a text with their own link. They can view and vote right away, with no app.
            </p>
          </CardHeader>
          <CardContent>
            <InviteForm tripId={tripId} />
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="members-h" className="space-y-2">
        <h2 id="members-h" className="font-display text-lg font-bold">
          On this trip
        </h2>
        <ul className="divide-y rounded-xl border bg-card">
          {view.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.displayName} />
              <span className="flex-1 font-medium">
                {m.displayName}
                {m.id === view.me.memberId ? <span className="text-muted-foreground"> (you)</span> : null}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{ROLE_LABEL[m.role]}</span>
            </li>
          ))}
          {view.invited.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.displayName} className="opacity-60" />
              <span className="flex-1">
                <span className="font-medium">{m.displayName}</span>
                <span className="block text-xs text-muted-foreground">
                  {m.status === "pending" ? "Asked to join" : "Invited · hasn't opened yet"}
                </span>
              </span>
              {isOrganizer ? <ResendLink tripId={tripId} memberId={m.id} name={m.displayName} /> : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
