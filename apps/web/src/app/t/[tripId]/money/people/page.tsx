/** Organizer: who shares what. Late joiners (FR-12, Q22 itemized claims), drop-outs (FR-13), guest of honor (FR-90). */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DropOutChecklist, LateJoinerChecklist } from "@/components/money/membership-review";
import { GuestOfHonorToggle } from "@/components/money/money-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { dropOutChecklist, getMoneyOverview, lateJoinerChecklist, lateJoinerClaimables, membershipReviews } from "@/server/expenses";

export default async function MoneyPeoplePage({ params }: PageProps<"/t/[tripId]/money/people">) {
  const { tripId } = await params;
  const base = `${routes.trip(tripId)}/money`;
  await requireFullOrRedirect(`${base}/people`);
  const { db, claims } = await tripContext(tripId);
  const o = await getMoneyOverview(db, claims, tripId);
  if (!o.me.isOrganizer) notFound();
  const reviews = await membershipReviews(db, claims, tripId);
  const lists = await Promise.all(
    reviews.map(async (r) => ({
      ...r,
      items: r.kind === "late_join" ? await lateJoinerChecklist(db, claims, tripId, r.memberId) : await dropOutChecklist(db, claims, tripId, r.memberId),
    })),
  );
  const active = o.members.filter((m) => m.status === "active");
  const claimables = await lateJoinerClaimables(db, claims, tripId); // Q22

  return (
    <main className="space-y-4">
      <Link href={base} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Money
      </Link>
      <h2 className="font-display text-2xl font-bold">Who shares what</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {lists.length === 0 && claimables.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody joined late or dropped out with shared costs. Nothing to review.</p>
        ) : (
          lists.map((r) => (
            <Card key={`${r.kind}-${r.memberId}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  {r.name} {r.kind === "late_join" ? "joined later" : "dropped out"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {r.kind === "late_join" ? (
                  <LateJoinerChecklist tripId={tripId} memberId={r.memberId} name={r.name} items={r.items} />
                ) : (
                  <DropOutChecklist tripId={tripId} memberId={r.memberId} name={r.name} items={r.items} />
                )}
              </CardContent>
            </Card>
          ))
        )}
        {claimables.map((c) => (
          <Card key={`claim-${c.memberId}`}>
            <CardHeader>
              <CardTitle className="text-base">{c.name} can claim items</CardTitle>
              <p className="text-sm text-muted-foreground">
                These receipts are from before {c.name === "You" ? "you" : c.name} joined. {c.name === "You" ? "You" : "They"} claim what{" "}
                {c.name === "You" ? "you" : "they"} had, or you can add them with “Assign”.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {c.receipts.map((r) => (
                  <li key={r.expenseId}>
                    <Link className="font-semibold underline" href={`${base}/${r.expenseId}`}>
                      {r.merchant}
                    </Link>
                    {r.spentOn ? ` · ${r.spentOn}` : ""}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
        {o.size === "group" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Guest of honor</CardTitle>
              <p className="text-sm text-muted-foreground">
                A guest of honor doesn&apos;t pay. Their share spreads across everyone else, on every expense that isn&apos;t settled yet.
              </p>
            </CardHeader>
            <CardContent className="divide-y">
              {active.map((m) => (
                <GuestOfHonorToggle key={m.id} tripId={tripId} memberId={m.id} name={m.id === o.me.memberId ? "You" : m.displayName} on={m.isGuestOfHonor} />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
