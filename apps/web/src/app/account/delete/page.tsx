/**
 * Delete account (FR-3, J-11, NFR-5, NFR-7): a preview of exactly what happens to each trip, the
 * successor picks for trips you own, and a typed confirmation.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@wandr/db";
import { money } from "@wandr/core";
import { AppHeader } from "@/components/app/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { accountDeletionPreview } from "@/server/account";
import { DeleteAccountForm } from "../account-forms";

export const metadata: Metadata = { title: "Delete account" };

function balanceLine(b: { currency: string; balanceMinor: number }) {
  const amount = money.formatMinor(Math.abs(b.balanceMinor), b.currency);
  return b.balanceMinor < 0 ? `You still owe ${amount}` : `You're still owed ${amount}`;
}

export default async function DeleteAccountPage() {
  const user = await requireFullOrRedirect(routes.accountDelete);
  const preview = await accountDeletionPreview(await getDb(), user.userId);
  const plans = preview.plans.filter((p) => p.kind !== "leave" || !p.alreadyFormer);
  const { saves, boards } = preview.library;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 pb-16 pt-8">
        <Link href={routes.account} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          ← Account
        </Link>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Delete your account?</h1>
        <p className="text-muted-foreground">Here&apos;s exactly what happens. This can&apos;t be undone.</p>

        <Card>
          <CardContent className="pt-5">
            <DeleteAccountForm>
              {plans.length ? (
                <section aria-labelledby="trips-h" className="space-y-3">
                  <h2 id="trips-h" className="font-display text-lg font-bold">
                    Your trips
                  </h2>
                  <ul className="divide-y rounded-xl border">
                    {plans.map((p) => (
                      <li key={p.tripId} className="space-y-2 px-4 py-3">
                        <p className="font-medium">{p.tripName}</p>
                        {p.kind === "hand_over" ? (
                          <div className="space-y-1 text-sm">
                            <label htmlFor={`pick-${p.tripId}`} className="text-muted-foreground">
                              You own this trip. It goes to:
                            </label>
                            <select
                              id={`pick-${p.tripId}`}
                              name={`pick:${p.tripId}`}
                              defaultValue={p.successorMemberId}
                              className="block h-10 w-full rounded-lg border border-input bg-card px-3"
                            >
                              {p.candidates.map((c, i) => (
                                <option key={c.memberId} value={c.memberId}>
                                  {c.name}
                                  {i === 0 ? " (suggested)" : ""}
                                </option>
                              ))}
                            </select>
                            <p className="text-muted-foreground">Then you leave it.</p>
                          </div>
                        ) : p.kind === "delete_trip" ? (
                          <p className="text-sm text-muted-foreground">You&apos;re the only one on it, so the trip is deleted.</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">You leave this trip.</p>
                        )}
                        {(preview.balances[p.tripId] ?? []).map((b) => (
                          <p key={b.currency} className="text-sm font-medium text-destructive">
                            {balanceLine(b)} here. It stays on the trip under &ldquo;Former member&rdquo;; settle up first if you can.
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-labelledby="else-h" className="space-y-2 text-sm">
                <h2 id="else-h" className="font-display text-lg font-bold">
                  Everything else
                </h2>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Your phone number, email and name are erased. You&apos;re signed out on every device.</li>
                  <li>
                    Your name on past expenses, votes and comments becomes &ldquo;Former member&rdquo;. Expenses and payments stay so
                    everyone else&apos;s balances still add up.
                  </li>
                  {saves || boards ? (
                    <li>
                      Your library is deleted: {saves} saved {saves === 1 ? "idea" : "ideas"}
                      {boards ? ` and ${boards} ${boards === 1 ? "board" : "boards"}` : ""}.
                    </li>
                  ) : null}
                </ul>
              </section>
            </DeleteAccountForm>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
