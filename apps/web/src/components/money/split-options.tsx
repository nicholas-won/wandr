"use client";

/**
 * Split options from the founder money decisions (2026-10-02):
 * - PayersEditor: one bill, several payers (Q23a); the parts must add up to the total.
 * - CoversEditor: "covered by" (Q23b).
 * - GuestOfHonorPolicy: what happens to a guest of honor's items (Q19).
 * - EditItems: edit an itemized receipt before anyone has paid (MT6, Q17 manual entry).
 * Every amount is parsed to integer minor units by @wandr/core; nothing is computed in floats.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { money } from "@wandr/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { editReceiptAction, updateExpenseAction, type MoneyResult } from "@/app/t/[tripId]/money/actions";
import type { ExpenseDetail } from "@/server/expenses";

export const parseMinor = (v: string, currency: string): number | null => {
  if (!v.trim()) return null;
  try {
    return money.parseMajorToMinor(v.replace(/[^\d.,-]/g, ""), currency);
  } catch {
    return null;
  }
};

const fmt = (n: number, c: string) => {
  try {
    return money.formatMinor(n, c);
  } catch {
    return String(n);
  }
};

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

/** Amount text per member id. Returns the parsed parts and how far they are from the total. */
export function payerParts(amounts: Record<string, string>, currency: string, totalMinor: number | null) {
  const parts: { memberId: string; paidMinor: number }[] = [];
  let bad = false;
  for (const [memberId, v] of Object.entries(amounts)) {
    if (!v.trim()) continue;
    const n = parseMinor(v, currency);
    if (n === null || n <= 0) bad = true;
    else parts.push({ memberId, paidMinor: n });
  }
  const paid = money.sumMinor(parts.map((p) => p.paidMinor));
  const left = totalMinor === null ? null : money.sumMinor([totalMinor, -paid]);
  return { parts, bad, left };
}

/** Q23a: what each person paid. */
export function PayersEditor({
  people,
  currency,
  totalMinor,
  amounts,
  onChange,
}: {
  people: { id: string; displayName: string }[];
  currency: string;
  totalMinor: number | null;
  amounts: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const { left, bad } = payerParts(amounts, currency, totalMinor);
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {people.map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <label htmlFor={`paid-${m.id}`} className="flex-1 text-sm">
              {m.displayName}
            </label>
            <Input
              id={`paid-${m.id}`}
              inputMode="decimal"
              placeholder="0.00"
              className="h-10 w-28 text-right"
              value={amounts[m.id] ?? ""}
              onChange={(e) => onChange({ ...amounts, [m.id]: e.target.value })}
            />
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground" role="status">
        {bad
          ? "Check the amounts."
          : left === null
            ? "Enter the total first."
            : left === 0
              ? "Adds up."
              : left > 0
                ? `${fmt(left, currency)} still to account for.`
                : `${fmt(-left, currency)} more than the total.`}
      </p>
    </div>
  );
}

/** Q23b: for each person on the expense, optionally who covers their share. */
export function CoversEditor({
  people,
  covers,
  onChange,
}: {
  people: { id: string; displayName: string }[];
  covers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <ul className="space-y-2">
      {people.map((m) => (
        <li key={m.id} className="flex items-center gap-2 text-sm">
          <label htmlFor={`cover-${m.id}`} className="flex-1">
            {m.displayName}&apos;s share
          </label>
          <select
            id={`cover-${m.id}`}
            value={covers[m.id] ?? ""}
            onChange={(e) => onChange({ ...covers, [m.id]: e.target.value })}
            className="h-10 rounded-lg border border-input bg-card px-2"
          >
            <option value="">Pays their own</option>
            {people
              .filter((p) => p.id !== m.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Covered by {p.displayName}
                </option>
              ))}
          </select>
        </li>
      ))}
    </ul>
  );
}

export const coversList = (covers: Record<string, string>) =>
  Object.entries(covers)
    .filter(([, by]) => by)
    .map(([memberId, coveredBy]) => ({ memberId, coveredBy }));

const GOH_LABEL: Record<"sharers" | "even" | "proportional", string> = {
  sharers: "Only the people who shared it with them",
  even: "Split evenly among everyone else",
  proportional: "In proportion to what everyone else had",
};

/** Q19: asked at split time when a guest of honor has items on the receipt. */
export function GuestOfHonorPolicy({ d }: { d: ExpenseDetail }) {
  const { pending, run } = useRun();
  const g = d.guestOfHonorItems;
  if (!g) return null;
  const editable = d.canManage && !d.locked && !d.deleted;
  return (
    <fieldset className="space-y-2 rounded-xl border p-4">
      <legend className="px-1 text-sm font-semibold">Who covers {g.names.join(" and ")}&apos;s items?</legend>
      <div className="flex flex-col gap-2" role="radiogroup">
        {(["sharers", "even", "proportional"] as const).map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="goh-policy"
              className="size-4"
              checked={g.policy === p}
              disabled={!editable || pending}
              onChange={() => run(() => updateExpenseAction(d.tripId, d.id, { gohPolicy: p }))}
            />
            {GOH_LABEL[p]}
          </label>
        ))}
      </div>
      {g.policy === "sharers" && g.fallbackItems ? (
        <p className="text-xs text-muted-foreground">
          {g.fallbackItems === 1 ? "One item" : `${g.fallbackItems} items`} only they had, so {g.fallbackItems === 1 ? "it's" : "they're"} split evenly
          among everyone else.
        </p>
      ) : null}
    </fieldset>
  );
}

type Line = { key: string; id: string | null; label: string; amount: string; quantity: number };

/** MT6: edit an itemized receipt's lines and total before anyone has paid (also Q17 manual entry). */
export function EditItems({ d, open, onOpenChange }: { d: ExpenseDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { pending, run } = useRun();
  const cur = d.currency;
  const [total, setTotal] = useState(money.minorToDecimalString(d.totalMinor, cur));
  const [lines, setLines] = useState<Line[]>(() =>
    d.items.map((i) => ({ key: i.id, id: i.id, label: i.label, amount: money.minorToDecimalString(i.amountMinor, cur), quantity: i.quantity })),
  );
  const [error, setError] = useState<string | null>(null);
  const totalMinor = parseMinor(total, cur);
  const amounts = lines.map((l) => parseMinor(l.amount, cur));
  const check =
    totalMinor !== null && amounts.every((a) => a !== null)
      ? money.validateReceipt({ totalMinor, currency: cur, items: lines.map((l, k) => ({ amountMinor: amounts[k]!, label: l.label })), charges: d.charges })
      : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Edit items" description="Fix what the receipt reading got wrong. Claims on kept items stay.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (totalMinor === null || totalMinor <= 0) return setError("Enter the amount paid.");
          if (amounts.some((a) => a === null)) return setError("Check the item amounts.");
          setError(null);
          run(
            () =>
              editReceiptAction(d.tripId, d.id, {
                totalMinor,
                items: lines.map((l, k) => ({ id: l.id, label: l.label, amountMinor: amounts[k]!, quantity: l.quantity })),
                charges: d.charges,
              }),
            () => onOpenChange(false),
          );
        }}
      >
        <ul className="space-y-2">
          {lines.map((l, k) => (
            <li key={l.key} className="flex items-center gap-2">
              <Input
                aria-label={`Item ${k + 1} name`}
                value={l.label}
                onChange={(e) => setLines((xs) => xs.map((x) => (x.key === l.key ? { ...x, label: e.target.value } : x)))}
                className="h-10 flex-1"
              />
              <Input
                aria-label={`Item ${k + 1} amount`}
                inputMode="decimal"
                value={l.amount}
                onChange={(e) => setLines((xs) => xs.map((x) => (x.key === l.key ? { ...x, amount: e.target.value } : x)))}
                className="h-10 w-28 text-right"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10"
                aria-label={`Remove ${l.label || "item"}`}
                onClick={() => setLines((xs) => xs.filter((x) => x.key !== l.key))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setLines((xs) => [...xs, { key: `new-${Date.now()}`, id: null, label: "", amount: "", quantity: 1 }])}
        >
          <Plus aria-hidden /> Add item
        </Button>
        <div className="space-y-2">
          <Label htmlFor="items-total">Total paid ({cur})</Label>
          <Input id="items-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        {check && !check.balanced ? (
          <p className="text-sm text-muted-foreground" role="status">
            Items, tax and tip come to {fmt(check.computedTotalMinor, cur)}. If you save like this, the payer covers the{" "}
            {fmt(Math.abs(check.discrepancyMinor), cur)} difference.{" "}
            <button type="button" className="font-semibold underline" onClick={() => setTotal(money.minorToDecimalString(check.computedTotalMinor, cur))}>
              Use {fmt(check.computedTotalMinor, cur)} as the total
            </button>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" block loading={pending}>
          Save items
        </Button>
      </form>
    </Dialog>
  );
}
