/** Trip settings: group link, who can join, ownership (FR-2, FR-3, FR-6, FR-7, FR-10, J-7). Organizers only. */
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { loadTripView, tripContext } from "@/server/context";
import { defaultSuccessor, getGroupLink, MembershipError, ownershipCandidates } from "@/server/membership";
import { GroupLinkCard, JoinSettingsForm, TransferOwnership } from "./settings-forms";
import { BachModeCard } from "@/components/trip/bach-mode-card";

export default async function SettingsPage({ params }: PageProps<"/t/[tripId]/settings">) {
  const { tripId } = await params;
  const user = await requireFullOrRedirect(`${routes.trip(tripId)}/settings`);
  const view = await loadTripView(tripId);
  if (!view || view.me.role === "member") notFound();
  const { db } = await tripContext(tripId);
  const link = await getGroupLink(db, user.userId, tripId).catch((e) => {
    if (e instanceof MembershipError) notFound();
    throw e;
  });
  const isOwner = view.me.role === "owner";
  const [candidates, successor] = isOwner
    ? await Promise.all([ownershipCandidates(db, user.userId, tripId), defaultSuccessor(db, user.userId, tripId)])
    : [[], null];

  return (
    <main className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <GroupLinkCard tripId={tripId} url={link.url} paused={link.paused} size={view.trip.size} />

      <Card>
        <CardHeader>
          <CardTitle>Who can join</CardTitle>
        </CardHeader>
        <CardContent>
          <JoinSettingsForm tripId={tripId} inviteListOnly={link.inviteListOnly} outsiderName={link.outsiderName ?? ""} />
        </CardContent>
      </Card>

      {/* §6.10: bachelor/bachelorette mode is hidden for solo and duo trips. */}
      {view.trip.size === "group" ? (
        <BachModeCard
          tripId={tripId}
          on={view.trip.bachMode}
          people={view.members.map(({ id, displayName, isGuestOfHonor }) => ({ id, displayName, isGuestOfHonor }))}
        />
      ) : null}

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Ownership</CardTitle>
            <p className="text-sm text-muted-foreground">
              {successor
                ? `If you ever delete your account, ${successor.name} becomes the owner unless you pick someone.`
                : "Once someone else has joined and confirmed their number, you can hand the trip to them."}
            </p>
          </CardHeader>
          {candidates.length > 0 ? (
            <CardContent>
              <TransferOwnership tripId={tripId} candidates={candidates} />
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </main>
  );
}
