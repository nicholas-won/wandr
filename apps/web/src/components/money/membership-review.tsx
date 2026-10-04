"use client";

/** FR-12 (late joiners, FR-T10) and FR-13 (drop-outs): organizer decides per past expense. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { money } from "@wandr/core";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { dropOutAction, lateJoinerAction } from "@/app/t/[tripId]/money/actions";
import type { ChecklistExpense } from "@/server/expenses";

const f = (e: ChecklistExpense, n: number) => money.formatMinor(n, e.currency);

export function LateJoinerChecklist({ tripId, memberId, name, items }: { tripId: string; memberId: string; name: string; items: ChecklistExpense[] }) {
  const [picked, setPicked] = useState<Record<string, "include" | "skip" | "replace">>(() =>
    Object.fromEntries(items.map((i) => [i.expenseId, i.replaces ? "replace" : "skip"])),
  );
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const ids = (k: string) => Object.entries(picked).filter(([, v]) => v === k).map(([id]) => id);
        start(async () => {
          const r = await lateJoinerAction(tripId, memberId, { include: ids("include"), skip: ids("skip"), replace: ids("replace") });
          if (!r.ok) return r.signin ? router.push(r.signin) : toast({ title: r.error, variant: "error" });
          toast({ title: `Saved ${name}'s shares.` });
        });
      }}
    >
      <p className="text-sm text-muted-foreground">Tick the past expenses {name} should share. Nothing changes until you save.</p>
      <ul className="divide-y rounded-xl border">
        {items.map((i) => (
          <li key={i.expenseId} className="space-y-2 px-4 py-3">
            <div className="flex justify-between gap-3">
              <span className="font-medium">
                {i.merchant}
                {i.locked ? <span className="text-xs text-muted-foreground"> · settled, added as a correction</span> : null}
              </span>
              <span className="tabular-nums">{f(i, i.totalMinor)}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm" role="radiogroup" aria-label={`${i.merchant}: ${name}`}>
              {i.replaces ? (
                <Radio name={i.expenseId} on={picked[i.expenseId] === "replace"} set={() => setPicked({ ...picked, [i.expenseId]: "replace" })}>
                  Takes {i.replaces.name}&apos;s share ({f(i, i.replaces.shareMinor)})
                </Radio>
              ) : null}
              <Radio name={i.expenseId} on={picked[i.expenseId] === "include"} set={() => setPicked({ ...picked, [i.expenseId]: "include" })}>
                {i.method === "just_me" ? "Make it shared" : "Shares it"}
              </Radio>
              <Radio name={i.expenseId} on={picked[i.expenseId] === "skip"} set={() => setPicked({ ...picked, [i.expenseId]: "skip" })}>
                Not in it
              </Radio>
            </div>
          </li>
        ))}
      </ul>
      <Button type="submit" block loading={pending}>
        Save
      </Button>
    </form>
  );
}

export function DropOutChecklist({ tripId, memberId, name, items }: { tripId: string; memberId: string; name: string; items: ChecklistExpense[] }) {
  const [picked, setPicked] = useState<Record<string, "keep" | "redistribute" | "refund_if_replaced">>(() =>
    Object.fromEntries(items.map((i) => [i.expenseId, "keep"])),
  );
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await dropOutAction(
            tripId,
            memberId,
            Object.entries(picked).map(([expenseId, decision]) => ({ expenseId, decision })),
          );
          if (!r.ok) return r.signin ? router.push(r.signin) : toast({ title: r.error, variant: "error" });
          toast({ title: "Saved." });
        });
      }}
    >
      <p className="text-sm text-muted-foreground">{name} dropped out. Decide what happens to each share.</p>
      <ul className="divide-y rounded-xl border">
        {items.map((i) => (
          <li key={i.expenseId} className="space-y-2 px-4 py-3">
            <div className="flex justify-between gap-3">
              <span className="font-medium">{i.merchant}</span>
              <span className="tabular-nums">
                {name}: {f(i, i.shareMinor ?? 0)}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm" role="radiogroup" aria-label={i.merchant}>
              <Radio name={i.expenseId} on={picked[i.expenseId] === "keep"} set={() => setPicked({ ...picked, [i.expenseId]: "keep" })}>
                Still owes it
              </Radio>
              <Radio name={i.expenseId} on={picked[i.expenseId] === "redistribute"} set={() => setPicked({ ...picked, [i.expenseId]: "redistribute" })}>
                Spread over the others
              </Radio>
              <Radio
                name={i.expenseId}
                on={picked[i.expenseId] === "refund_if_replaced"}
                set={() => setPicked({ ...picked, [i.expenseId]: "refund_if_replaced" })}
              >
                Refund if someone takes their place
              </Radio>
            </div>
          </li>
        ))}
      </ul>
      <Button type="submit" block loading={pending}>
        Save decisions
      </Button>
    </form>
  );
}

function Radio({ name, on, set, children }: { name: string; on: boolean; set: () => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="radio" name={name} checked={on} onChange={set} className="size-4" />
      {children}
    </label>
  );
}
