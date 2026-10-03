import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm, ResendLink } from "@/components/trip/invite-form";
import {
  AddManagedMember,
  JoinRequestActions,
  RecheckApprove,
  LeaveTrip,
  MemberMenu,
  RestoreButton,
  SizeNotice,
} from "@/components/trip/people-admin";
import { loadTripView, tripContext } from "@/server/context";
import { getPeople } from "@/server/membership";
import { listRecheckRequests } from "@/server/account";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", organizer: "Organizer", member: "" };

export default async function PeoplePage({ params }: PageProps<"/t/[tripId]/people">) {
  const { tripId } = await params;
  const view = await loadTripView(tripId);
  if (!view) notFound();
  const { db, claims } = await tripContext(tripId);
  const people = await getPeople(db, claims, tripId);
  if (!people) notFound();
  const isOrganizer = people.me.role !== "member";
  // FR-5: role and membership changes need a verified session; personal-link guests only view.
  const canManage = isOrganizer && people.me.verified;
  const activeOthers = people.people.filter((p) => p.status === "active");
  const rechecks = canManage && claims.sub ? await listRecheckRequests(db, claims.sub, tripId) : [];

  return (
    <main className="space-y-4 lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6 lg:space-y-0">
      {isOrganizer ? (
        <aside className="lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1">
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
        </aside>
      ) : null}
      <div className="space-y-4 lg:col-start-1 lg:row-start-1">
        {people.notices.map((n) => (
          <SizeNotice key={n} tripId={tripId} memberId={people.me.memberId} notice={n} />
        ))}

        {canManage && people.linkPaused ? (
          <p role="status" className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
            Your group link is paused: lots of people are waiting to join. It turns back on by itself once you approve
            or deny some of the requests below.
          </p>
        ) : null}

        {canManage && people.requests.length > 0 ? (
          <section aria-labelledby="requests-h" className="space-y-2">
            <h2 id="requests-h" className="font-display text-lg font-bold">
              Asking to join
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {people.requests.map((r) => (
                <li key={r.memberId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={r.name} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.last4 ? `Number ending ${r.last4}` : "Verified by email"}
                      {r.notInviteeName ? ` · says they're not ${r.notInviteeName}` : ""}
                    </span>
                  </span>
                  <JoinRequestActions tripId={tripId} memberId={r.memberId} name={r.name} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {rechecks.length > 0 ? (
          <section aria-labelledby="recheck-h" className="space-y-2">
            <h2 id="recheck-h" className="font-display text-lg font-bold">
              Is this really them?
            </h2>
            <p className="text-sm text-muted-foreground">
              Their number signed in after a long break. Numbers sometimes get a new owner, so they can&apos;t see money until
              someone who knows them confirms. Check with them first.
            </p>
            <ul className="divide-y rounded-xl border bg-card">
              {rechecks.map((r) => (
                <li key={r.memberId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={r.name} />
                  <span className="min-w-0 flex-1 font-medium">{r.name}</span>
                  <RecheckApprove tripId={tripId} memberId={r.memberId} name={r.name} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="members-h" className="space-y-2">
          <h2 id="members-h" className="font-display text-lg font-bold">
            On this trip
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {people.people.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={m.displayName} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {m.displayName}
                    {m.isMe ? <span className="text-muted-foreground"> (you)</span> : null}
                  </span>
                  {m.managedByName ? (
                    <span className="block text-xs text-muted-foreground">
                      {/* JR11: after their manager leaves, organizers act for them. */}
                      Managed by{" "}
                      {m.managedByName === "organizers" ? "the organizers" : m.managedByMe ? "you" : m.managedByName}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                {canManage && !m.isMe && m.role !== "owner" ? (
                  <MemberMenu
                    tripId={tripId}
                    member={{ id: m.id, displayName: m.displayName, role: m.role, managed: !!m.managedByName }}
                    others={activeOthers.filter((o) => o.id !== m.id).map((o) => ({ id: o.id, displayName: o.displayName }))}
                  />
                ) : null}
              </li>
            ))}
            {people.invited.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={m.displayName} className="opacity-60" />
                <span className="flex-1">
                  <span className="font-medium">{m.displayName}</span>
                  <span className="block text-xs text-muted-foreground">Invited · hasn&apos;t accepted yet</span>
                </span>
                {isOrganizer ? <ResendLink tripId={tripId} memberId={m.id} name={m.displayName} /> : null}
              </li>
            ))}
          </ul>
          {people.me.verified ? <AddManagedMember tripId={tripId} /> : null}
        </section>

        {people.former.length > 0 ? (
          <section aria-labelledby="former-h" className="space-y-2">
            <h2 id="former-h" className="font-display text-base font-bold text-muted-foreground">
              Former members
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {people.former.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={f.displayName} className="opacity-50" />
                  <span className="flex-1 text-muted-foreground">{f.displayName}</span>
                  {canManage && f.canRestore ? <RestoreButton tripId={tripId} memberId={f.id} name={f.displayName} /> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {people.me.verified ? (
          <div className="pt-2">
            <LeaveTrip tripId={tripId} memberId={people.me.memberId} isOwner={people.me.role === "owner"} />
          </div>
        ) : null}
      </div>

    </main>
  );
}
