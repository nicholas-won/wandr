"use client";

/** Expense detail controls: claim items (FR-62), absorb, edit (FR-68), correct (FR-69), refund (FR-72), delete + undo (P7). */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { money } from "@wandr/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  absorbItemAction,
  claimItemAction,
  correctExpenseAction,
  deleteExpenseAction,
  refundAction,
  restoreExpenseAction,
  updateExpenseAction,
  type MoneyResult,
} from "@/app/t/[tripId]/money/actions";
import type { ExpenseDetail } from "@/server/expenses";

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const run = (fn: () => Promise<MoneyResult>, after?: (r: MoneyResult) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
        return;
      }
      after?.(r);
    });
  return { pending, run, toast, router };
}

const parse = (v: string, c: string) => {
  try {
    return money.parseMajorToMinor(v, c);
  } catch {
    return null;
  }
};

/** One item row: "Mine" toggles my claim; the uploader can assign anyone or have the payer cover it. */
export function ItemClaims({ d, item }: { d: ExpenseDetail; item: ExpenseDetail["items"][number] }) {
  const { pending, run } = useRun();
  const mine = item.claims.find((c) => c.memberId === d.me.memberId);
  const editable = !d.locked && !d.deleted;
  const [assign, setAssign] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {item.label}
            {item.quantity > 1 ? <span className="text-muted-foreground"> × {item.quantity}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.claims.length
              ? item.claims.map((c) => (c.weight > 1 ? `${c.name} (${c.weight})` : c.name)).join(", ")
              : item.absorbed
                ? "Covered by the payer"
                : "Not claimed yet"}
          </p>
        </div>
        <span className="font-semibold tabular-nums">{money.formatMinor(item.amountMinor, d.currency)}</span>
      </div>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          {item.quantity > 1 ? (
            <label className="inline-flex items-center gap-2 text-sm">
              I had
              <select
                className="rounded-md border border-input bg-card px-2 py-1"
                value={mine?.weight ?? 0}
                disabled={pending}
                onChange={(e) => {
                  const w = Number(e.target.value);
                  run(() => claimItemAction(d.tripId, d.id, item.id, d.me.memberId, w === 0 ? null : w));
                }}
              >
                {Array.from({ length: item.quantity + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? "none" : `${i} of ${item.quantity}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Button
              size="sm"
              variant={mine ? "primary" : "outline"}
              aria-pressed={!!mine}
              loading={pending}
              onClick={() => run(() => claimItemAction(d.tripId, d.id, item.id, d.me.memberId, mine ? null : 1))}
            >
              {mine ? "Mine ✓" : "Mine"}
            </Button>
          )}
          {d.canManage ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setAssign(!assign)} aria-expanded={assign}>
                Assign
              </Button>
              {item.claims.length === 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() => run(() => absorbItemAction(d.tripId, d.id, item.id, !item.absorbed))}
                >
                  {item.absorbed ? "Don't cover" : "Payer covers it"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {assign ? (
        <div className="flex flex-wrap gap-2">
          {d.members
            .filter((m) => m.status === "active")
            .map((m) => {
              const on = item.claims.some((c) => c.memberId === m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  disabled={pending}
                  onClick={() => run(() => claimItemAction(d.tripId, d.id, item.id, m.id, on ? null : 1))}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-semibold",
                    on ? "border-foreground bg-foreground text-background" : "border-input bg-card",
                  )}
                >
                  {m.displayName}
                </button>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}

export function ManageExpense({ d }: { d: ExpenseDetail }) {
  const { pending, run, toast, router } = useRun();
  const [mode, setMode] = useState<null | "edit" | "correct" | "refund">(null);
  const cur = d.currency;
  const [total, setTotal] = useState(money.minorToDecimalString(Math.abs(d.totalMinor), cur));
  const [merchant, setMerchant] = useState(d.merchant);
  const [payer, setPayer] = useState(d.payerId);
  const [people, setPeople] = useState(d.participants);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(money.minorToDecimalString(d.refundableMinor, cur));
  const [error, setError] = useState<string | null>(null);
  const isRefund = !!d.refundOf;
  const canEditPeople = d.method === "even" && d.size !== "solo";
  const canEditTotal = (d.method === "even" || d.method === "just_me") && !isRefund;
  const active = d.members.filter((m) => m.status === "active" || d.participants.includes(m.id));

  const del = () =>
    run(
      () => deleteExpenseAction(d.tripId, d.id),
      () => {
        toast({
          title: "Expense deleted.",
          action: { label: "Undo", onClick: () => void restoreExpenseAction(d.tripId, d.id).then(() => router.refresh()) },
        });
        router.push(`/t/${d.tripId}/money`);
      },
    );

  const peoplePicker = canEditPeople ? (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Split evenly with</legend>
      <div className="flex flex-wrap gap-2">
        {active.map((m) => {
          const on = people.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => setPeople((ps) => (on ? ps.filter((p) => p !== m.id) : [...ps, m.id]))}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-semibold",
                on ? "border-foreground bg-foreground text-background" : "border-input bg-card",
              )}
            >
              {m.displayName}
            </button>
          );
        })}
      </div>
    </fieldset>
  ) : null;

  const payerPicker =
    d.size !== "solo" ? (
      <div className="space-y-2">
        <Label htmlFor="payer">Paid by</Label>
        <select id="payer" value={payer} onChange={(e) => setPayer(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card px-3">
          {active.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>
    ) : null;

  return (
    <div className="flex flex-wrap gap-2">
      {d.canManage && !d.locked && !d.deleted ? (
        <>
          <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" loading={pending} onClick={del}>
            Delete
          </Button>
        </>
      ) : null}
      {d.canManage && d.locked && !isRefund ? (
        <Button size="sm" variant="outline" onClick={() => setMode("correct")}>
          Add a correction
        </Button>
      ) : null}
      {d.refundableMinor > 0 && !d.deleted ? (
        <Button size="sm" variant="ghost" onClick={() => setMode("refund")}>
          Record a refund
        </Button>
      ) : null}

      <Dialog open={mode === "edit"} onOpenChange={(o) => !o && setMode(null)} title="Edit expense">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = canEditTotal ? parse(total, cur) : undefined;
            if (canEditTotal && (t === null || t === undefined || t <= 0)) return setError("Enter the amount paid.");
            setError(null);
            run(
              () =>
                updateExpenseAction(d.tripId, d.id, {
                  merchant,
                  paidByMemberId: payer,
                  ...(canEditTotal ? { totalMinor: t! } : {}),
                  ...(canEditPeople ? { participantIds: people } : {}),
                }),
              (r) => {
                if (r.ok && r.message) toast({ title: r.message });
                setMode(null);
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="edit-merchant">What for</Label>
            <Input id="edit-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </div>
          {canEditTotal ? (
            <div className="space-y-2">
              <Label htmlFor="edit-total">Amount ({cur})</Label>
              <Input id="edit-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
          ) : null}
          {payerPicker}
          {peoplePicker}
          {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
          <p className="text-xs text-muted-foreground">Everyone on it sees the change; edits are logged.</p>
          <Button type="submit" block loading={pending}>
            Save changes
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={mode === "correct"}
        onOpenChange={(o) => !o && setMode(null)}
        title="Correct a settled expense"
        description="Someone already paid against this, so it can't be edited. A correction adjusts balances instead."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = parse(total, cur);
            if (t === null || t < 0) return setError("Enter the right amount.");
            if (!reason.trim()) return setError("Say what changed.");
            setError(null);
            run(
              () =>
                correctExpenseAction(d.tripId, d.id, {
                  totalMinor: t,
                  paidByMemberId: payer,
                  ...(canEditPeople ? { participantIds: people } : {}),
                  reason,
                }),
              (r) => {
                if (r.ok && r.message) toast({ title: r.message });
                setMode(null);
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="fix-total">Correct amount ({cur})</Label>
            <Input id="fix-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          {payerPicker}
          {peoplePicker}
          <div className="space-y-2">
            <Label htmlFor="fix-reason">What changed</Label>
            <Textarea id="fix-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Card was charged $8 more" />
          </div>
          {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
          <Button type="submit" block loading={pending}>
            Add correction
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={mode === "refund"}
        onOpenChange={(o) => !o && setMode(null)}
        title="Record a refund"
        description="Money came back to the payer. It's split the same way as the original."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = parse(refund, cur);
            if (t === null || t <= 0) return setError("Enter the amount refunded.");
            if (t > d.refundableMinor) return setError(`At most ${money.formatMinor(d.refundableMinor, cur)}.`);
            setError(null);
            run(
              () => refundAction(d.tripId, d.id, t),
              (r) => {
                if (r.ok && r.message) toast({ title: r.message });
                setMode(null);
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="refund">Amount refunded ({cur})</Label>
            <Input id="refund" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} />
          </div>
          {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
          <Button type="submit" block loading={pending}>
            Record refund
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
