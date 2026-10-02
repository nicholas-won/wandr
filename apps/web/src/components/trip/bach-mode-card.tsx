"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { setBachModeAction, setGuestOfHonorAction } from "@/app/t/[tripId]/surprise-actions";

type Person = { id: string; displayName: string; isGuestOfHonor: boolean };

/** §6.7: opt-in bachelor/bachelorette mode (groups only) with guest-of-honor picks (FR-90). */
export function BachModeCard({
  tripId,
  on,
  people,
}: {
  tripId: string;
  on: boolean;
  people: Person[];
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; signin?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error ?? "Something went wrong", variant: "error" });
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bachelor / bachelorette mode</CardTitle>
        <p className="text-sm text-muted-foreground">
          Mark the guest of honor: they don&apos;t pay, and you can hide surprises from them.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-3 font-medium">
          Turn on for this trip
          <input
            type="checkbox"
            role="switch"
            className="size-5 accent-[var(--primary)]"
            checked={on}
            disabled={pending}
            onChange={(e) => run(() => setBachModeAction(tripId, e.target.checked))}
          />
        </label>
        {on ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Guest of honor</legend>
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={p.isGuestOfHonor}
                  disabled={pending}
                  onChange={(e) => run(() => setGuestOfHonorAction(tripId, p.id, e.target.checked))}
                />
                {p.displayName}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Their share of new splits is spread across everyone else. Use &ldquo;Make it a surprise&rdquo; on any idea to
              hide it from them.
            </p>
          </fieldset>
        ) : null}
      </CardContent>
    </Card>
  );
}
