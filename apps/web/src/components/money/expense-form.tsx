"use client";

/**
 * Add an expense (FR-60–FR-64, FR-67, FR-90, FR-T10). One primary action: Save (P3).
 * Defaults do the work (P5): paid by me, split evenly among people at the Stop, AI-read amounts.
 * The uploader confirms the total by saving (E-7); live checks catch items that don't add up
 * and auto-gratuity plus a tip (FR-61, E-4/6/7).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { money } from "@wandr/core";
import type { Receipt, ReceiptValidation } from "@wandr/ai";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createExpenseAction, type CreateExpenseForm } from "@/app/t/[tripId]/money/actions";
import type { DuplicateInfo, ExpenseFormContext } from "@/server/expenses";

const CATEGORIES = [
  ["food_drink", "Food & drink"],
  ["lodging", "Lodging"],
  ["transport", "Transport"],
  ["activities", "Activities"],
  ["shopping", "Shopping"],
  ["other", "Other"],
] as const;

const COMMON_CURRENCIES = ["USD", "CAD", "EUR", "GBP", "MXN", "JPY", "AUD", "CHF", "THB", "KRW"];

type Item = { key: number; label: string; amount: string; quantity: number };

function toMajor(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  try {
    return money.minorToDecimalString(minor, currency);
  } catch {
    return "";
  }
}

function parse(v: string, currency: string): number | null {
  if (!v.trim()) return null;
  try {
    return money.parseMajorToMinor(v.replace(/[^\d.,-]/g, ""), currency);
  } catch {
    return null;
  }
}

export function ExpenseForm({
  tripId,
  ctx,
  receiptUploadId,
  reading,
  duplicateOfExpenseId,
}: {
  tripId: string;
  ctx: ExpenseFormContext;
  receiptUploadId: string | null;
  reading: { receipt: Receipt; validation: ReceiptValidation } | null;
  duplicateOfExpenseId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const r = reading?.receipt;
  const solo = ctx.size === "solo";

  const [currency, setCurrency] = useState(r?.currency ?? ctx.defaultCurrency);
  const [total, setTotal] = useState(toMajor(r?.totalMinor, r?.currency ?? ctx.defaultCurrency));
  const [merchant, setMerchant] = useState(r?.merchant ?? "");
  const [spentOn, setSpentOn] = useState(r?.date ?? "");
  const [category, setCategory] = useState<string>(r?.category ?? "food_drink");
  const [payer, setPayer] = useState(ctx.me.memberId);
  const realStops = ctx.stops.filter((s) => !s.isDefault);
  const defaultStop = ctx.stops.length === 1 ? ctx.stops[0]!.id : "";
  const [stopId, setStopId] = useState(defaultStop);
  const [ideaId, setIdeaId] = useState("");
  const attendance = (sid: string) => ctx.stops.find((s) => s.id === sid)?.attending ?? ctx.everyone;
  const [people, setPeople] = useState<string[]>(() => attendance(defaultStop));
  const [method, setMethod] = useState<"even" | "itemized">("even");
  const [items, setItems] = useState<Item[]>(() =>
    (r?.items ?? []).map((it, i) => ({
      key: i,
      label: it.label,
      amount: toMajor(it.amountMinor - it.discountMinor, r?.currency ?? ctx.defaultCurrency),
      quantity: it.quantity,
    })),
  );
  const [tax, setTax] = useState(toMajor(r?.taxMinor || null, currency));
  const [taxIncluded, setTaxIncluded] = useState(!!r?.taxIncluded);
  const [tip, setTip] = useState(toMajor(r?.tipMinor || null, currency));
  const [service, setService] = useState(toMajor(r?.serviceChargeMinor || null, currency));
  const [fees, setFees] = useState(toMajor(r?.feesMinor || null, currency));
  const [discount, setDiscount] = useState(toMajor(r?.discountMinor || null, currency));
  const [difference, setDifference] = useState<"" | "even" | "payer">("");
  const [more, setMore] = useState(false);
  const [dups, setDups] = useState<DuplicateInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalMinor = parse(total, currency);
  const charges = (() => {
    const out: money.ReceiptCharge[] = [];
    const add = (kind: money.ChargeKind, v: string, extra: Partial<money.ReceiptCharge> = {}) => {
      const n = parse(v, currency);
      if (n && n !== 0) out.push({ kind, amountMinor: kind === "discount" ? -Math.abs(n) : Math.abs(n), ...extra });
    };
    add("tax", tax, taxIncluded ? { includedInItems: true } : {});
    add("tip", tip);
    add("service_charge", service, r?.serviceChargeLabel ? { label: r.serviceChargeLabel } : {});
    add("fee", fees);
    add("discount", discount);
    return out;
  })();

  const itemMinor = items.map((i) => parse(i.amount, currency));
  const check = (() => {
    if (method !== "itemized" || totalMinor === null || itemMinor.some((x) => x === null)) return null;
    try {
      return money.validateReceipt({
        totalMinor,
        currency,
        items: items.map((i, k) => ({ amountMinor: itemMinor[k]!, label: i.label })),
        charges,
      });
    } catch {
      return null;
    }
  })();

  const fmt = (n: number) => {
    try {
      return money.formatMinor(n, currency);
    } catch {
      return String(n);
    }
  };

  function submit(confirmDuplicate = false) {
    setError(null);
    if (totalMinor === null || totalMinor <= 0) {
      setError(`Enter the amount you paid${currency === "JPY" || currency === "KRW" ? "" : ", like 42.50"}.`);
      return;
    }
    if (!solo && method === "even" && people.length === 0) {
      setError("Pick at least one person to split with.");
      return;
    }
    if (method === "itemized") {
      if (items.length === 0) return setError("Add the items, or split evenly.");
      if (itemMinor.some((x) => x === null)) return setError("Check the item amounts.");
      if (check && !check.balanced && !difference) return setError("Choose what to do with the difference.");
    }
    const form: CreateExpenseForm = {
      merchant,
      currency,
      totalMinor,
      spentOn: spentOn || null,
      category: category as CreateExpenseForm["category"],
      paidByMemberId: payer,
      stopId: stopId || null,
      ideaId: ideaId || null,
      method: solo ? "just_me" : method,
      participantIds: solo ? [] : people,
      receiptUploadId,
      confirmDuplicate,
      ...(method === "itemized"
        ? {
            items: items.map((i, k) => ({ label: i.label, amountMinor: itemMinor[k]!, quantity: i.quantity })),
            charges,
            difference:
              check && !check.balanced
                ? difference === "payer"
                  ? { assignTo: payer }
                  : { splitEvenlyAmong: people }
                : null,
          }
        : {}),
    };
    start(async () => {
      const res = await createExpenseAction(tripId, form);
      if (res.ok) {
        toast({ title: res.message ?? "Expense added." });
        router.push(`/t/${tripId}/money${res.expenseId && method === "itemized" ? `/${res.expenseId}` : ""}`);
        return;
      }
      if (res.signin) return router.push(res.signin);
      if (res.duplicates) return setDups(res.duplicates);
      setError(res.error);
    });
  }

  const warnings: string[] = [];
  if (reading) {
    for (const i of reading.validation.issues) {
      if (["auto_gratuity_and_tip", "tip_already_included", "handwritten_tip", "currency_ambiguous", "currency_unknown", "total_missing"].includes(i.code)) {
        warnings.push(i.message);
      }
    }
  }
  if (check) for (const w of check.warnings) if (w.code !== "DISCREPANCY" && !warnings.includes(w.message)) warnings.push(w.message);

  const toggle = (id: string) => setPeople((ps) => (ps.includes(id) ? ps.filter((p) => p !== id) : [...ps, id]));
  const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.displayName ?? "";
  const goh = ctx.members.filter((m) => m.isGuestOfHonor);
  const paying = people.filter((p) => !goh.some((g) => g.id === p));
  // Preview comes from core (largest-remainder), never ad-hoc division (NFR-4).
  const each =
    totalMinor && totalMinor > 0 && paying.length
      ? money.splitEven({ totalMinor, currency, participantIds: paying }).shares[0]!.shareMinor
      : null;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      {duplicateOfExpenseId ? (
        <Notice>
          This photo is already on an expense.{" "}
          <a className="font-semibold underline" href={`/t/${tripId}/money/${duplicateOfExpenseId}`}>
            See it
          </a>
        </Notice>
      ) : null}
      {warnings.map((w) => (
        <Notice key={w}>{w}</Notice>
      ))}

      <div className="space-y-2">
        <Label htmlFor="amount">Amount paid</Label>
        <div className="flex gap-2">
          <Input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="0.00"
            className="h-14 text-2xl font-bold"
            aria-invalid={error !== null && totalMinor === null ? true : undefined}
            autoFocus={!reading}
          />
          <label htmlFor="currency" className="sr-only">
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-14 rounded-lg border border-input bg-card px-3 text-base font-semibold"
          >
            {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="merchant">What for</Label>
        <Input id="merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Dinner at Taberna" maxLength={120} />
      </div>

      {!solo ? (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Paid by</legend>
            <div className="flex flex-wrap gap-2">
              {ctx.members.map((m) => (
                <Chip key={m.id} on={payer === m.id} onClick={() => setPayer(m.id)} role="radio">
                  {m.displayName}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Split</legend>
            <div className="flex gap-2" role="radiogroup" aria-label="Split method">
              <Chip on={method === "even"} onClick={() => setMethod("even")} role="radio">
                Evenly
              </Chip>
              <Chip on={method === "itemized"} onClick={() => setMethod("itemized")} role="radio">
                By item
              </Chip>
            </div>
            <div className="flex flex-wrap gap-2 pt-1" aria-label="People in this split">
              {ctx.members.map((m) => (
                <Chip key={m.id} on={people.includes(m.id)} onClick={() => toggle(m.id)} role="checkbox">
                  {m.displayName}
                  {m.isGuestOfHonor ? <span className="text-xs font-normal"> · guest of honor</span> : null}
                </Chip>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {method === "even"
                ? each !== null
                  ? `About ${fmt(each)} each${goh.some((g) => people.includes(g.id)) ? `; ${goh.map((g) => g.displayName).join(", ")} doesn't pay` : ""}.`
                  : "Everyone picked pays an equal share."
                : "Everyone claims what they had. Tax and tip split in proportion. Unclaimed items count evenly for now."}
              {!people.includes(payer) ? ` ${nameOf(payer)} paid but isn't in the split.` : ""}
            </p>
          </fieldset>
        </>
      ) : null}

      {method === "itemized" && !solo ? (
        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Items</legend>
          <ul className="space-y-2">
            {items.map((it, k) => (
              <li key={it.key} className="flex items-center gap-2">
                <Input
                  aria-label={`Item ${k + 1} name`}
                  value={it.label}
                  onChange={(e) => setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, label: e.target.value } : x)))}
                  placeholder="Item"
                  className="h-10 flex-1"
                />
                <Input
                  aria-label={`Item ${k + 1} amount`}
                  inputMode="decimal"
                  value={it.amount}
                  onChange={(e) => setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, amount: e.target.value } : x)))}
                  placeholder="0.00"
                  className="h-10 w-28 text-right"
                  aria-invalid={itemMinor[k] === null && it.amount !== "" ? true : undefined}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-10"
                  aria-label={`Remove ${it.label || "item"}`}
                  onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
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
            onClick={() => setItems((xs) => [...xs, { key: Date.now(), label: "", amount: "", quantity: 1 }])}
          >
            <Plus aria-hidden /> Add item
          </Button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SmallMoney id="tax" label="Tax" value={tax} onChange={setTax} />
            <SmallMoney id="tip" label="Tip" value={tip} onChange={setTip} />
            <SmallMoney id="service" label="Service charge" value={service} onChange={setService} />
            <SmallMoney id="fees" label="Fees" value={fees} onChange={setFees} />
            <SmallMoney id="discount" label="Discount" value={discount} onChange={setDiscount} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={taxIncluded} onChange={(e) => setTaxIncluded(e.target.checked)} className="size-4" />
            Prices already include tax (VAT)
          </label>
          {check && !check.balanced ? (
            <div className="space-y-2 rounded-lg bg-secondary p-3 text-sm text-secondary-foreground" role="status">
              <p className="font-semibold">
                Unassigned difference: {fmt(check.discrepancyMinor)} (items {fmt(check.computedTotalMinor)}, total {fmt(totalMinor!)})
              </p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Handle the difference">
                <Chip on={difference === "even"} onClick={() => setDifference("even")} role="radio">
                  Split it evenly
                </Chip>
                <Chip on={difference === "payer"} onClick={() => setDifference("payer")} role="radio">
                  {payer === ctx.me.memberId ? "I'll cover it" : `${nameOf(payer)} covers it`}
                </Chip>
              </div>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div>
        <button type="button" className="text-sm font-semibold text-primary" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? "Fewer details" : "Date, category and more"}
        </button>
        {more ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="spentOn">Date</Label>
              <Input id="spentOn" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base"
              >
                {CATEGORIES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {realStops.length > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="stop">Stop</Label>
                <select
                  id="stop"
                  value={stopId}
                  onChange={(e) => {
                    setStopId(e.target.value);
                    setPeople(attendance(e.target.value));
                  }}
                  className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base"
                >
                  <option value="">Whole trip</option>
                  {realStops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {ctx.ideas.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="idea">Linked idea (optional)</Label>
                <select
                  id="idea"
                  value={ideaId}
                  onChange={(e) => setIdeaId(e.target.value)}
                  className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base"
                >
                  <option value="">None</option>
                  {ctx.ideas.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" block size="lg" loading={pending}>
        {solo ? "Save" : method === "itemized" ? "Save and ask for claims" : "Split it"}
      </Button>

      <Dialog open={dups !== null} onOpenChange={(o) => !o && setDups(null)} title="Same expense?">
        <div className="space-y-4">
          {dups?.map((d) => (
            <p key={d.expenseId} className="text-sm">
              Looks like {d.uploadedBy === "You" ? "you" : d.uploadedBy} already added this ({money.formatMinor(d.totalMinor, d.currency)} at{" "}
              {d.merchant}
              {d.spentOn ? `, ${d.spentOn}` : ""}).
            </p>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" block onClick={() => router.push(`/t/${tripId}/money/${dups?.[0]?.expenseId ?? ""}`)}>
              It&apos;s the same
            </Button>
            <Button
              type="button"
              block
              onClick={() => {
                setDups(null);
                submit(true);
              }}
            >
              Add anyway
            </Button>
          </div>
        </div>
      </Dialog>
    </form>
  );
}

function Chip({ on, onClick, children, role }: { on: boolean; onClick: () => void; children: React.ReactNode; role: "radio" | "checkbox" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
        on ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function SmallMoney({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" className="h-10" />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
