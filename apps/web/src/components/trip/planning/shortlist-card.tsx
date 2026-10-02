"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { shortlistAction } from "@/app/t/[tripId]/stops/actions";
import type { ShortlistSuggestion } from "@/server/planning";

const CATEGORY: Record<string, string> = {
  food: "food",
  drink: "drinks",
  nightlife: "nightlife",
  activity: "activity",
  sight: "sightseeing",
  shopping: "shopping",
  stay: "places to stay",
  transit: "transport",
  other: "other",
};

/** FR-45: crowded category → suggested top picks with a plain comparison. Organizers decide (FR-49). */
export function ShortlistCard({ tripId, s, showStop }: { tripId: string; s: ShortlistSuggestion; showStop: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const what = CATEGORY[s.category] ?? s.category;
  const toShortlist = s.suggested.filter((r) => r.status === "idea");

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold">
        <ListChecks className="size-5 text-primary" aria-hidden />
        {s.ideaCount} {what} ideas{showStop ? ` in ${s.stopName}` : ""}. Narrow it down?
      </p>
      {s.suggested.length ? (
        <p className="mt-1 text-sm text-muted-foreground">Top picks so far: {s.suggested.map((r) => r.title).join(", ")}.</p>
      ) : null}
      {s.blindCount ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Vote on the other {s.blindCount} to include them (you see results only after voting).
        </p>
      ) : null}
      {s.suggested.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Compare
          </Button>
          {toShortlist.length ? (
            <Button
              size="sm"
              loading={busy}
              onClick={() =>
                start(async () => {
                  const r = await shortlistAction(tripId, toShortlist.map((x) => x.id));
                  if (!r.ok) {
                    if (r.signin) router.push(r.signin);
                    else toast({ title: r.error, variant: "error" });
                  } else toast({ title: r.message ?? "Shortlisted" });
                })
              }
            >
              Shortlist these {toShortlist.length}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen} title={`Top ${what} picks`} className="max-w-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-semibold">Place</th>
                <th scope="col" className="py-2 pr-3 font-semibold">In</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Must-do</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Price</th>
                <th scope="col" className="py-2 font-semibold">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {s.suggested.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">{r.title}</th>
                  <td className="py-2 pr-3 tabular-nums">
                    {r.inCount} of {r.voters}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{r.must}</td>
                  <td className="py-2 pr-3">{r.priceLevel == null ? "—" : r.priceLevel === 0 ? "Free" : "$".repeat(r.priceLevel)}</td>
                  <td className="py-2 tabular-nums">{r.rating == null ? "—" : r.rating.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>
    </div>
  );
}
