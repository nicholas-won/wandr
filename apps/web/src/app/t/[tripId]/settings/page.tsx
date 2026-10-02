/**
 * Trip settings: group link, who can join, ownership and deleting the trip (FR-2, FR-3, FR-6, FR-7,
 * FR-10, J-7, JR3). Organizers only; ownership and delete are owner only.
 */
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { loadTripView, tripContext } from "@/server/context";
import { deleteConfirmationWord, deletionPreviewLines } from "@wandr/core";
import {
  defaultSuccessor,
  getGroupLink,
  MembershipError,
  ownershipCandidates,
  tripDeletionPreview,
} from "@/server/membership";
import { DeleteTrip, GroupLinkCard, JoinSettingsForm, TransferOwnership } from "./settings-forms";
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
  const [candidates, successor, deletion] = isOwner
    ? await Promise.all([
        ownershipCandidates(db, user.userId, tripId),
        defaultSuccessor(db, user.userId, tripId),
        tripDeletionPreview(db, user.userId, tripId),
      ])
    : [[], null, null];

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
        <Card id="ownership">
          <CardHeader>
            <CardTitle>Ownership</CardTitle>
            <p className="text-sm text-muted-foreground">
              {successor
                ? `If you ever delete your account, ${successor.name} becomes the owner unless you pick someone.`
                : "Once someone else has joined and confirmed their number, you can hand the trip to them."}
            </p>
            {/* JR3: to leave, the owner transfers first or deletes the trip. */}
            <p className="text-sm text-muted-foreground">To leave the trip, hand it to someone else first, or delete it.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidates.length > 0 ? <TransferOwnership tripId={tripId} candidates={candidates} /> : null}
            {deletion ? (
              <DeleteTrip
                tripId={tripId}
                confirmWord={deleteConfirmationWord(deletion.tripName)}
                lines={deletionPreviewLines(deletion)}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
