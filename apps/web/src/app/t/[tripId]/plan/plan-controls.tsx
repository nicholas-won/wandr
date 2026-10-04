"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addToPlanAction, applyPlanAction, setTravelTimesAction, updatePlanItemAction } from "./actions";

export function ApplyPlan({ tripId, stopId, backHref }: { tripId: string; stopId: string | null; backHref: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <div className="flex gap-2">
      <Button
        block
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await applyPlanAction(tripId, stopId);
            if (!r.ok) {
              if (r.signin) router.push(r.signin);
              else toast({ title: r.error, variant: "error" });
              return;
            }
            toast({ title: r.message ?? "Applied" });
            router.push(backHref);
          })
        }
      >
        Apply this plan
      </Button>
      <Button variant="outline" onClick={() => router.push(backHref)}>
        Discard
      </Button>
    </div>
  );
}

export function ItemControls({
  tripId,
  planItemId,
  locked,
  dayIndex,
  dayCount,
}: {
  tripId: string;
  planItemId: string;
  locked: boolean;
  dayIndex: number;
  dayCount: number;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const run = (patch: { locked?: boolean; dayIndex?: number }) =>
    start(async () => {
      const r = await updatePlanItemAction(tripId, planItemId, patch);
      if (!r.ok) toast({ title: r.error, variant: "error" });
    });
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`day-${planItemId}`}>
        Move to day
      </label>
      <select
        id={`day-${planItemId}`}
        value={dayIndex}
        disabled={pending}
        onChange={(e) => run({ dayIndex: Number(e.target.value), locked: true })}
        className="rounded-md border border-input bg-card px-2 py-1 text-xs"
      >
        {Array.from({ length: dayCount }, (_, i) => (
          <option key={i} value={i}>
            Day {i + 1}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => run({ locked: !locked })}
        aria-pressed={locked}
        aria-label={locked ? "Unlock" : "Lock so re-arranging never moves it"}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted aria-pressed:text-primary"
      >
        {locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
      </button>
    </div>
  );
}

/**
 * FR-O8 / FR-O15: "We arrive Day 1 at 18:30" / "We leave the last day at 11:00". Tucked into a
 * disclosure so it stays out of the way until needed (§2a).
 */
export function TravelTimes({
  tripId,
  stopId,
  arrive,
  leave,
  zoneLabel,
}: {
  tripId: string;
  stopId: string;
  arrive: string;
  leave: string;
  zoneLabel: string | null;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const set = !!(arrive || leave);
  return (
    <details className="rounded-xl border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-semibold">
        {set ? "Arrival and departure times" : "Add arrival and departure times"}
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const r = await setTravelTimesAction(tripId, stopId, String(fd.get("arrive") || "") || null, String(fd.get("leave") || "") || null);
            if (!r.ok) {
              if (r.signin) router.push(r.signin);
              else toast({ title: r.error, variant: "error" });
              return;
            }
            toast({ title: r.message ?? "Saved" });
          });
        }}
      >
        <p className="text-muted-foreground">
          Travel days get shorter plans; a late arrival gets dinner only.{zoneLabel ? ` Local time (${zoneLabel}).` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`arrive-${stopId}`}>We arrive Day 1 at</label>
          <input id={`arrive-${stopId}`} name="arrive" type="time" defaultValue={arrive} className="rounded-md border border-input bg-card px-2 py-1" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`leave-${stopId}`}>We leave the last day at</label>
          <input id={`leave-${stopId}`} name="leave" type="time" defaultValue={leave} className="rounded-md border border-input bg-card px-2 py-1" />
        </div>
        <Button type="submit" size="sm" loading={pending}>
          Save times
        </Button>
      </form>
    </details>
  );
}

/** D70: build the plan by hand. Pick a day and, optionally, a time. */
export function AddToPlan({
  tripId,
  stopId,
  ideaId,
  dayLabels,
}: {
  tripId: string;
  stopId: string;
  ideaId: string;
  dayLabels: string[];
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await addToPlanAction(tripId, stopId, ideaId, Number(fd.get("day")), String(fd.get("time") || "") || null);
          if (!r.ok) {
            if (r.signin) router.push(r.signin);
            else toast({ title: r.error, variant: "error" });
          }
        });
      }}
    >
      <label className="sr-only" htmlFor={`add-day-${ideaId}`}>
        Day
      </label>
      <select id={`add-day-${ideaId}`} name="day" className="rounded-md border border-input bg-card px-2 py-1 text-xs">
        {dayLabels.map((l, i) => (
          <option key={i} value={i}>
            {l}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`add-time-${ideaId}`}>
        Time (optional)
      </label>
      <input id={`add-time-${ideaId}`} name="time" type="time" className="rounded-md border border-input bg-card px-2 py-1 text-xs" />
      <Button type="submit" size="sm" variant="outline" loading={pending}>
        Add
      </Button>
    </form>
  );
}
