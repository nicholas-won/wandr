/**
 * Money (FR-124): expenses, balances per currency, categories, spend per person.
 * Mobile: capture-first ("Snap a receipt" is the primary action, P3/P4).
 * Desktop: expense list next to a sticky balances rail.
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { Download, PenLine, Receipt, Users, Wallet } from "lucide-react";
import { money } from "@wandr/core";
import { SnapReceipt } from "@/components/money/snap-receipt";
import { DisplayCurrency, RecordPayment } from "@/components/money/money-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { getRates } from "@/lib/fx";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { CATEGORY_LABEL, getMoneyOverview, membershipReviews, type ExpenseCategory } from "@/server/expenses";

const fmt = (n: number, c: string) => money.formatMinor(n, c);

export default async function MoneyPage({ params }: PageProps<"/t/[tripId]/money">) {
  const { tripId } = await params;
  const base = `${routes.trip(tripId)}/money`;
  await requireFullOrRedirect(base);
  const { db, claims } = await tripContext(tripId);
  const o = await getMoneyOverview(db, claims, tripId);
  const reviews = o.me.isOrganizer ? await membershipReviews(db, claims, tripId) : [];
  const solo = o.size === "solo";

  // FR-66: approximate total in the person's display currency (display only).
  const jar = await cookies();
  const pref = jar.get("w_dccy")?.value;
  const display = pref && /^[A-Z]{3}$/.test(pref) ? pref : (o.currencies[0] ?? "USD");
  let approx: { byCategory: Partial<Record<ExpenseCategory, number>>; total: number; missing: string[] } | null = null;
  if (o.currencies.length > 1 || (o.currencies.length === 1 && o.currencies[0] !== display)) {
    const rates = await getRates(display);
    if (rates) {
      const report = Object.entries(o.categories).flatMap(([cur, row]) =>
        Object.entries(row).map(([category, v]) => ({ currency: cur, totalMinor: v as number, category: category as ExpenseCategory, shares: [] })),
      );
      const a = money.approximateCategoryTotals(report, display, rates);
      approx = {
        byCategory: a.byCategory,
        total: money.sumMinor(Object.values(a.byCategory).map((v) => v ?? 0)),
        missing: a.missingCurrencies,
      };
    }
  }

  const attention = o.expenses.filter((e) => e.needsMyAttention);

  const balancesCard = solo ? null : (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4" aria-hidden /> Balances
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {o.mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">{o.expenses.length ? "You're all square." : "Nothing to settle yet."}</p>
        ) : (
          <ul className="space-y-3">
            {o.mine.map((l) => (
              <li key={`${l.currency}-${l.otherMemberId}`} className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {l.direction === "you_owe" ? `You owe ${l.otherName} ` : `${l.otherName} owes you `}
                  {fmt(l.amountMinor, l.currency)}
                </span>
                <RecordPayment
                  tripId={tripId}
                  fromId={l.direction === "you_owe" ? o.me.memberId : l.otherMemberId}
                  toId={l.direction === "you_owe" ? l.otherMemberId : o.me.memberId}
                  fromName={l.direction === "you_owe" ? "You" : l.otherName}
                  toName={l.direction === "you_owe" ? l.otherName : "you"}
                  currency={l.currency}
                  amountMinor={l.amountMinor}
                  label={l.direction === "you_owe" ? "I paid" : "They paid"}
                />
              </li>
            ))}
          </ul>
        )}
        {o.size === "group" && o.transfers.some((t) => t.fromId !== o.me.memberId && t.toId !== o.me.memberId) ? (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-muted-foreground">Everyone&apos;s settle-up</summary>
            <ul className="mt-2 space-y-1">
              {o.transfers.map((t) => (
                <li key={`${t.currency}-${t.fromId}-${t.toId}`}>
                  {t.fromName} → {t.toName}: {fmt(t.amountMinor, t.currency)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {o.payments.length ? (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-muted-foreground">Payments ({o.payments.length})</summary>
            <ul className="mt-2 space-y-1">
              {o.payments.map((p) => (
                <li key={p.id}>
                  {p.fromName} paid {p.toName} {fmt(p.amountMinor, p.currency)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );

  const breakdownCard =
    o.expenses.length === 0 ? null : (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{solo ? "Your spending" : "Where it went"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {Object.entries(o.categories).map(([cur, row]) => (
            <div key={cur} className="space-y-1">
              {o.currencies.length > 1 ? <p className="text-xs font-semibold text-muted-foreground">{cur}</p> : null}
              <ul className="space-y-1">
                {Object.entries(row).map(([cat, v]) => (
                  <li key={cat} className="flex justify-between">
                    <span>{CATEGORY_LABEL[cat as ExpenseCategory]}</span>
                    <span className="font-semibold tabular-nums">{fmt(v as number, cur)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {approx ? (
            <div className="space-y-1 border-t pt-3">
              <p className="flex items-center justify-between font-semibold">
                <span>About {fmt(approx.total, display)} in total</span>
                <DisplayCurrency value={display} options={o.currencies} />
              </p>
              <p className="text-xs text-muted-foreground">
                Approximate, at today&apos;s rates. Balances stay in each currency.
                {approx.missing.length ? ` No rate for ${approx.missing.join(", ")}.` : ""}
              </p>
            </div>
          ) : o.currencies.length > 0 ? (
            <DisplayCurrency value={display} options={o.currencies} />
          ) : null}
          {!solo ? (
            <div className="space-y-1 border-t pt-3">
              <p className="font-semibold">Spend per person</p>
              {Object.entries(o.spend).map(([cur, row]) => (
                <ul key={cur} className="space-y-1">
                  {Object.entries(row).map(([mid, v]) => (
                    <li key={mid} className="flex justify-between">
                      <span>{mid === o.me.memberId ? "You" : (o.members.find((m) => m.id === mid)?.displayName ?? "Former member")}</span>
                      <span className="tabular-nums">{fmt(v, cur)}</span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <main className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SnapReceipt tripId={tripId} className="sm:flex-1" />
          <Link href={`${base}/new`} className={buttonVariants({ variant: "outline", block: true, className: "sm:flex-1" })}>
            <PenLine aria-hidden /> Add without a receipt
          </Link>
        </div>

        {attention.length ? (
          <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground" role="status">
            {attention.length === 1 ? "One of your receipts has" : `${attention.length} of your receipts have`} unclaimed items.{" "}
            <Link className="font-semibold underline" href={`${base}/${attention[0]!.id}`}>
              Assign or cover them
            </Link>
          </p>
        ) : null}

        {reviews.length ? (
          <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground" role="status">
            {reviews.map((r) => `${r.name} ${r.kind === "late_join" ? "joined after" : "dropped out of"} ${r.pending} shared ${r.pending === 1 ? "expense" : "expenses"}`).join(" · ")}.{" "}
            <Link className="font-semibold underline" href={`${base}/people`}>
              Review
            </Link>
          </p>
        ) : null}

        <div className="lg:hidden">{balancesCard}</div>

        {o.expenses.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            <Receipt className="mx-auto mb-2 size-8" aria-hidden />
            <p className="font-display text-xl font-bold text-foreground">{solo ? "Track what you spend" : "Split costs without the spreadsheet"}</p>
            <p className="mt-1 text-sm">Snap a receipt. We read it and split it evenly with everyone at that Stop. You can change anything.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {o.expenses.map((e) => (
              <li key={e.id}>
                <Link href={`${base}/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.merchant}</span>
                    <span className="block text-xs text-muted-foreground">
                      {solo ? CATEGORY_LABEL[e.category] : `${e.payerName} paid`}
                      {e.spentOn ? ` · ${e.spentOn}` : ""}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {e.locked ? <Badge>Settled</Badge> : null}
                      {e.isRefund ? <Badge variant="secondary">Refund</Badge> : null}
                      {e.pendingClaims ? <Badge variant="accent">{e.pendingClaims} to claim</Badge> : null}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{fmt(e.totalMinor, e.currency)}</span>
                    {!solo ? (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {e.myShareMinor ? `Your share ${fmt(e.myShareMinor, e.currency)}` : "Not in it"}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="lg:hidden">{breakdownCard}</div>

        <nav aria-label="More money tools" className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-muted-foreground">
          {o.expenses.length ? (
            <a href={`${base}/export`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Download className="size-4" aria-hidden /> Export CSV
            </a>
          ) : null}
          {o.me.isOrganizer || o.budgetCheckIn ? (
            <Link href={`${base}/budget`} className="hover:text-foreground">
              Budget check-in
            </Link>
          ) : null}
          {o.me.isOrganizer && !solo ? (
            <Link href={`${base}/people`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Users className="size-4" aria-hidden /> Who shares what
            </Link>
          ) : null}
        </nav>
      </main>

      <aside className="hidden lg:block">
        <div className="sticky top-8 space-y-4">
          {balancesCard}
          {breakdownCard}
        </div>
      </aside>
    </div>
  );
}
