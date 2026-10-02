"use client";

/** Small client controls for the money pages: settle up, display currency, organizer toggles. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { money } from "@wandr/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  budgetAnswerAction,
  budgetToggleAction,
  displayCurrencyAction,
  guestOfHonorAction,
  recordPaymentAction,
  type MoneyResult,
} from "@/app/t/[tripId]/money/actions";

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const run = (fn: () => Promise<MoneyResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
        return;
      }
      if (r.message) toast({ title: r.message });
      after?.();
    });
  return { pending, run };
}

/**
 * FR-71: "Mark as paid" for a settle-up line. Recording is permanent (append-only) and locks
 * the related expenses (FR-69), so it asks once before saving (P7: nothing destructive without a preview).
 */
export function RecordPayment({
  tripId,
  fromId,
  toId,
  fromName,
  toName,
  currency,
  amountMinor,
  label = "Mark as paid",
}: {
  tripId: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  currency: string;
  amountMinor: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(money.minorToDecimalString(amountMinor, currency));
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRun();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Record a payment" description={`${fromName} paid ${toName}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            let minor: number;
            try {
              minor = money.parseMajorToMinor(amount, currency);
            } catch {
              return setError("That amount doesn't look right.");
            }
            if (minor <= 0) return setError("Enter a positive amount.");
            run(
              () => recordPaymentAction(tripId, { fromMemberId: fromId, toMemberId: toId, currency, amountMinor: minor }),
              () => setOpen(false),
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount ({currency})</Label>
            <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Payments can&apos;t be deleted. Expenses before this payment become settled; fixes to them are added as corrections.
          </p>
          <Button type="submit" block loading={pending}>
            Record {fromName === "You" ? "my" : "the"} payment
          </Button>
        </form>
      </Dialog>
    </>
  );
}

/** FR-66: the person's display currency for the approximate total. */
export function DisplayCurrency({ value, options }: { value: string; options: string[] }) {
  const { pending, run } = useRun();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      Show in
      <select
        value={value}
        disabled={pending}
        onChange={(e) => run(() => displayCurrencyAction(e.target.value))}
        className="rounded-md border border-input bg-card px-2 py-1 text-sm font-semibold text-foreground"
      >
        {[...new Set([value, ...options])].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}

/** FR-90: one tap excludes a guest of honor from every split. */
export function GuestOfHonorToggle({ tripId, memberId, name, on }: { tripId: string; memberId: string; name: string; on: boolean }) {
  const { pending, run } = useRun();
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm font-medium">
        {name}
        <span className="block text-xs text-muted-foreground">{on ? "Guest of honor: doesn't pay" : "Pays their share"}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="size-5"
        checked={on}
        disabled={pending}
        aria-label={`${name} is guest of honor`}
        onChange={(e) => run(() => guestOfHonorAction(tripId, memberId, e.target.checked))}
      />
    </label>
  );
}

/** D11: organizers switch the budget check-in on (opt-in, P2). */
export function BudgetToggle({ tripId, on }: { tripId: string; on: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button variant={on ? "outline" : "primary"} size="sm" loading={pending} onClick={() => run(() => budgetToggleAction(tripId, !on))}>
      {on ? "Turn off budget check-in" : "Turn on budget check-in"}
    </Button>
  );
}

/** FR-74 / FR-T9: a private range, with a heads-up in duo trips before entering. */
export function BudgetForm({
  tripId,
  duo,
  otherName,
  initial,
}: {
  tripId: string;
  duo: boolean;
  otherName: string | null;
  initial: { currency: string; minMinor: number; maxMinor: number } | null;
}) {
  const cur0 = initial?.currency ?? "USD";
  const [currency, setCurrency] = useState(cur0);
  const [min, setMin] = useState(initial ? money.minorToDecimalString(initial.minMinor, cur0) : "");
  const [max, setMax] = useState(initial ? money.minorToDecimalString(initial.maxMinor, cur0) : "");
  const [ack, setAck] = useState(!duo || !!initial);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRun();
  if (!ack) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          Heads-up: in a 2-person trip, {otherName ?? "the other person"} sees your range once you&apos;ve both answered.
        </p>
        <Button block onClick={() => setAck(true)}>
          OK, enter my budget
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        let a: number, b: number;
        try {
          a = money.parseMajorToMinor(min || "0", currency);
          b = money.parseMajorToMinor(max, currency);
        } catch {
          return setError("Enter amounts like 300 or 450.");
        }
        if (b < a) return setError("The top of the range must be at least the bottom.");
        setError(null);
        run(() => budgetAnswerAction(tripId, { currency, minMinor: a, maxMinor: b }));
      }}
    >
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="bmin">From</Label>
          <Input id="bmin" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="300" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bmax">Up to</Label>
          <Input id="bmax" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="600" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bcur" className="sr-only">
            Currency
          </Label>
          <select
            id="bcur"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-12 rounded-lg border border-input bg-card px-3 text-base font-semibold"
          >
            {["USD", "CAD", "EUR", "GBP", "MXN", "JPY", "AUD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" block loading={pending}>
        Save my range
      </Button>
    </form>
  );
}
