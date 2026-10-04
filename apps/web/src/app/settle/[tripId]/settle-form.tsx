"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settleUpAction, type SettleState } from "./actions";

const selectClass = "block h-12 w-full rounded-lg border border-input bg-card px-3 text-base";

export function SettleForm({
  tripId,
  people,
  currencies,
  suggestion,
}: {
  tripId: string;
  people: { id: string; name: string }[];
  currencies: string[];
  /** Prefill from the open balance: direction, currency and amount as a decimal string. */
  suggestion: { direction: "paid" | "received"; currency: string; amount: string } | null;
}) {
  const action = React.useMemo(() => settleUpAction.bind(null, tripId), [tripId]);
  const [state, formAction, pending] = useActionState(action, {} as SettleState);
  const errorId = React.useId();
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="settle-direction">What happened</Label>
          <select id="settle-direction" name="direction" defaultValue={suggestion?.direction ?? "paid"} className={selectClass}>
            <option value="paid">I paid them</option>
            <option value="received">They paid me</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="settle-who">Who</Label>
          <select id="settle-who" name="otherMemberId" className={selectClass} required>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="settle-amount">Amount</Label>
          <Input id="settle-amount" name="amount" inputMode="decimal" defaultValue={suggestion?.amount ?? ""} required aria-describedby={errorId} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="settle-currency">Currency</Label>
          <select id="settle-currency" name="currency" defaultValue={suggestion?.currency ?? currencies[0]} className={selectClass}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="settle-note">Note (optional)</Label>
        <Input id="settle-note" name="note" maxLength={200} placeholder="Venmo, cash…" />
      </div>
      <p id={errorId} role="alert" className="min-h-5 text-sm font-medium text-destructive">
        {state.error ?? ""}
      </p>
      {state.ok ? (
        <p role="status" className="text-sm text-muted-foreground">
          Payment recorded.
        </p>
      ) : null}
      <Button type="submit" block loading={pending}>
        Record payment
      </Button>
    </form>
  );
}
