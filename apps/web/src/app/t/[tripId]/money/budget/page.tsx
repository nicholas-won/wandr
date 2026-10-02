/**
 * Budget check-in (FR-74, FR-T9, D11, D58). Opt-in by an organizer. Ranges are private; what
 * others see comes only from app.budget_view: the rounded band with 3+ answers (group), or the
 * other person's range once both answered (duo).
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { money } from "@wandr/core";
import { BudgetForm, BudgetToggle } from "@/components/money/money-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { loadTripView, tripContext } from "@/server/context";
import { getBudget } from "@/server/expenses";

const range = (min: number, max: number, c: string) => `${money.formatMinor(min, c)} – ${money.formatMinor(max, c)}`;

export default async function BudgetPage({ params }: PageProps<"/t/[tripId]/money/budget">) {
  const { tripId } = await params;
  const base = `${routes.trip(tripId)}/money`;
  await requireFullOrRedirect(`${base}/budget`);
  const { db, claims } = await tripContext(tripId);
  const b = await getBudget(db, claims, tripId);
  const view = await loadTripView(tripId);
  const other = view?.members.find((m) => m.id !== view.me.memberId) ?? null;
  const own = b.rows.find((r) => r.kind === "own");
  const others = b.rows.filter((r) => r.kind === "member");
  const bands = b.rows.filter((r) => r.kind === "band");

  return (
    <main className="space-y-4">
      <Link href={base} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Money
      </Link>
      <h2 className="font-display text-2xl font-bold">Budget check-in</h2>
      {!b.enabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agree on a comfortable spend, privately</CardTitle>
            <p className="text-sm text-muted-foreground">
              {b.size === "duo"
                ? "Each of you enters a range. You see each other's once you've both answered."
                : b.size === "solo"
                  ? "Set a personal budget for this trip."
                  : "Everyone enters a range privately. The group only sees a rounded band, once at least 3 people answer."}
            </p>
          </CardHeader>
          <CardContent>
            {b.isOrganizer ? <BudgetToggle tripId={tripId} on={false} /> : <p className="text-sm">An organizer can turn this on.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your range (per person, whole trip)</CardTitle>
              <p className="text-sm text-muted-foreground">
                {b.size === "group" ? "Only you see your exact numbers." : b.size === "duo" ? "" : "Just for you."}
              </p>
            </CardHeader>
            <CardContent>
              <BudgetForm
                tripId={tripId}
                duo={b.size === "duo"}
                otherName={other?.displayName ?? null}
                initial={own ? { currency: own.currency, minMinor: own.minMinor, maxMinor: own.maxMinor } : null}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{b.size === "group" ? "The group's band" : b.size === "duo" ? "Both budgets" : "Your budget"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {own ? <p>You: {range(own.minMinor, own.maxMinor, own.currency)}</p> : null}
              {others.map((r) => (
                <p key={r.memberId}>
                  {r.displayName}: {range(r.minMinor, r.maxMinor, r.currency)}
                </p>
              ))}
              {bands.map((r) => (
                <p key={r.currency} className="font-semibold">
                  Group band: {range(r.minMinor, r.maxMinor, r.currency)}
                </p>
              ))}
              {b.size === "group" && bands.length === 0 ? (
                <p className="text-muted-foreground">The band shows once at least 3 people have answered.</p>
              ) : null}
              {b.size === "duo" && others.length === 0 ? (
                <p className="text-muted-foreground">{other?.displayName ?? "The other person"}&apos;s range shows once you&apos;ve both answered.</p>
              ) : null}
              {b.isOrganizer ? (
                <div className="pt-2">
                  <BudgetToggle tripId={tripId} on />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
