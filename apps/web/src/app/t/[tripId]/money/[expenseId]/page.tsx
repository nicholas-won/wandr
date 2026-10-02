/** Expense detail (FR-62 claims, FR-68/69 edit or correct, FR-72 refunds, E-31 receipt photo). */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { money } from "@wandr/core";
import { ItemClaims, ManageExpense } from "@/components/money/expense-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { CATEGORY_LABEL, getExpenseDetail } from "@/server/expenses";

const CHARGE_LABEL: Record<string, string> = {
  tax: "Tax",
  tip: "Tip",
  service_charge: "Service charge",
  fee: "Fees",
  discount: "Discount",
};

export default async function ExpensePage({ params }: PageProps<"/t/[tripId]/money/[expenseId]">) {
  const { tripId, expenseId } = await params;
  const base = `${routes.trip(tripId)}/money`;
  await requireFullOrRedirect(`${base}/${expenseId}`);
  if (!/^[0-9a-f-]{36}$/.test(expenseId)) notFound();
  const { db, claims } = await tripContext(tripId);
  const d = await getExpenseDetail(db, claims, tripId, expenseId);
  if (!d) notFound();
  const f = (n: number) => money.formatMinor(n, d.currency);
  const unclaimed = d.items.filter((i) => i.claims.length === 0 && !i.absorbed).length;
  const payerName = d.members.find((m) => m.id === d.payerId)?.displayName ?? "Former member";

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <main className="space-y-4">
        <Link href={base} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Money
        </Link>
        <header className="space-y-1">
          <h2 className="font-display text-2xl font-bold">{d.merchant}</h2>
          <p className="text-3xl font-extrabold tabular-nums">{f(d.totalMinor)}</p>
          <p className="text-sm text-muted-foreground">
            {d.size === "solo" ? CATEGORY_LABEL[d.category] : `${payerName} paid · ${CATEGORY_LABEL[d.category]}`}
            {d.spentOn ? ` · ${d.spentOn}` : ""}
            {d.ideaTitle ? ` · ${d.ideaTitle}` : ""}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {d.locked ? <Badge>Settled</Badge> : null}
            {d.deleted ? <Badge variant="outline">Deleted</Badge> : null}
            {d.refundOf ? (
              <Badge variant="secondary">
                <Link href={`${base}/${d.refundOf.id}`}>Refund of {d.refundOf.merchant}</Link>
              </Badge>
            ) : null}
          </div>
        </header>

        <ManageExpense d={d} />

        {d.method === "itemized" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What did you have?</CardTitle>
              {unclaimed && !d.locked ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {unclaimed} {unclaimed === 1 ? "item isn't" : "items aren't"} claimed yet; until then {unclaimed === 1 ? "it's" : "they're"} split
                  evenly.
                  {d.uploaderId === d.me.memberId ? " Assign them, or have the payer cover them." : ""}
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {d.items.map((item) => (
                  <li key={item.id} className="py-3">
                    <ItemClaims d={d} item={item} />
                  </li>
                ))}
              </ul>
              {d.charges.length ? (
                <ul className="space-y-1 border-t pt-3 text-sm">
                  {d.charges.map((c, i) => (
                    <li key={i} className="flex justify-between text-muted-foreground">
                      <span>
                        {c.label ?? CHARGE_LABEL[c.kind]}
                        {c.includedInItems ? " (included)" : ""}
                      </span>
                      <span className="tabular-nums">{f(c.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.validation?.warnings.length ? (
                <ul className="mt-3 space-y-1">
                  {d.validation.warnings.map((w) => (
                    <li key={w.code} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {w.code === "DISCREPANCY" ? `Difference of ${f(w.amountMinor ?? 0)} handled as chosen when saved.` : w.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {d.adjustments.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Corrections</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {d.adjustments.map((a, i) => (
                  <li key={i}>
                    {a.name}: balance {a.deltaMinor > 0 ? "+" : "−"}
                    {f(Math.abs(a.deltaMinor))} · {a.reason}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </main>

      <aside className="mt-4 space-y-4 lg:mt-0">
        {d.size !== "solo" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shares</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {d.shares.map((s) => (
                  <li key={s.memberId} className="flex justify-between">
                    <span>{s.name}</span>
                    <span className="font-semibold tabular-nums">{f(s.shareMinor)}</span>
                  </li>
                ))}
              </ul>
              {d.members.some((m) => m.isGuestOfHonor && d.participants.includes(m.id)) ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {d.members
                    .filter((m) => m.isGuestOfHonor && d.participants.includes(m.id))
                    .map((m) => m.displayName)
                    .join(", ")}{" "}
                  (guest of honor) doesn&apos;t pay.
                </p>
              ) : null}
              {!d.participants.includes(d.payerId) && d.method === "even" ? (
                <p className="mt-2 text-xs text-muted-foreground">{payerName} paid but isn&apos;t included.</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {d.receiptUploadId ? (
          <a href={`${base}/receipts/${d.receiptUploadId}`} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image route */}
            <img src={`${base}/receipts/${d.receiptUploadId}`} alt={`Receipt for ${d.merchant}`} className="w-full rounded-xl border object-contain" />
          </a>
        ) : null}
        {d.refunds.length ? (
          <ul className="text-sm text-muted-foreground">
            {d.refunds.map((r) => (
              <li key={r.id}>
                <Link className="underline" href={`${base}/${r.id}`}>
                  Refund {f(Math.abs(r.totalMinor))}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    </div>
  );
}
