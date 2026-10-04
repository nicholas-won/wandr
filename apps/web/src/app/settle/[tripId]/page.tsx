/**
 * Money-only view for a removed member (FR-9, M-1, M-2, P-8): their balance per currency, the
 * expenses that involve them, adjustments and payments, and settle-up. Nothing else from the
 * trip: the data comes only from app.former_member_ledger (RLS), run as the caller.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@wandr/db";
import { money } from "@wandr/core";
import { AppHeader } from "@/components/app/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { getFormerMoney } from "@/server/account";
import { SettleForm } from "./settle-form";

export const metadata: Metadata = { title: "Settle up", robots: { index: false } };

const fmt = (minor: number, currency: string) => money.formatMinor(minor, currency);

function day(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function SettlePage({ params }: PageProps<"/settle/[tripId]">) {
  const { tripId } = await params;
  const user = await requireFullOrRedirect(routes.settle(tripId));
  const view = await getFormerMoney(await getDb(), user.userId, tripId);
  if (!view) notFound();

  const balances = Object.entries(view.balances);
  const open = balances.filter(([, b]) => b !== 0);
  const first = open[0];
  const currencies = balances.map(([c]) => c);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 pb-16 pt-8">
        <Link href={routes.home} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          ← Your trips
        </Link>
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{view.tripName}</h1>
          <p className="mt-1 text-muted-foreground">
            You&apos;re no longer on this trip. You can still see your own money here and settle up.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your balance</CardTitle>
          </CardHeader>
          <CardContent>
            {balances.length === 0 ? (
              <p className="text-muted-foreground">Nothing to settle.</p>
            ) : (
              <ul className="space-y-1">
                {balances.map(([c, b]) => (
                  <li key={c} className="text-lg font-semibold">
                    {money.standingOf(b) === "settled"
                      ? `All settled in ${c}`
                      : money.standingOf(b) === "you_owe"
                        ? `You owe ${fmt(-b, c)}`
                        : `You're owed ${fmt(b, c)}`}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {view.people.length > 0 && currencies.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Record a payment</CardTitle>
              <p className="text-sm text-muted-foreground">Paid someone back, or got paid? Log it here so the trip&apos;s balances match.</p>
            </CardHeader>
            <CardContent>
              <SettleForm
                tripId={tripId}
                people={view.people}
                currencies={currencies}
                suggestion={
                  first
                    ? {
                        direction: first[1] < 0 ? "paid" : "received",
                        currency: first[0],
                        amount: money.minorToDecimalString(Math.abs(first[1]), first[0]),
                      }
                    : null
                }
              />
            </CardContent>
          </Card>
        ) : null}

        {view.expenses.length > 0 ? (
          <section aria-labelledby="exp-h" className="space-y-2">
            <h2 id="exp-h" className="font-display text-lg font-bold">
              Your expenses
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {view.expenses.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{e.merchant}</span>
                    <span className="block text-muted-foreground">
                      {e.paidByMe ? "You paid" : `${e.payerName ?? "Someone"} paid`} {fmt(e.totalMinor, e.currency)}
                      {e.spentOn ? ` · ${day(e.spentOn)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block">Your share {fmt(e.myShareMinor, e.currency)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view.adjustments.length > 0 ? (
          <section aria-labelledby="adj-h" className="space-y-2">
            <h2 id="adj-h" className="font-display text-lg font-bold">
              Corrections
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {view.adjustments.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span>{a.merchant ? `Correction to ${a.merchant}` : "Balance settled when you left"}</span>
                  <span className="shrink-0">
                    {a.deltaMinor >= 0 ? "+" : "−"}
                    {fmt(Math.abs(a.deltaMinor), a.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view.payments.length > 0 ? (
          <section aria-labelledby="pay-h" className="space-y-2">
            <h2 id="pay-h" className="font-display text-lg font-bold">
              Payments
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {view.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {p.fromMe ? `You paid ${p.otherName ?? "someone"}` : `${p.otherName ?? "Someone"} paid you`}
                    {p.note ? <span className="block text-muted-foreground">{p.note}</span> : null}
                  </span>
                  <span className="shrink-0">{fmt(p.amountMinor, p.currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
