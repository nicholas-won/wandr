"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editIdeaAction } from "@/app/t/[tripId]/actions";

const CATEGORY_LABEL: Record<string, string> = {
  food: "Food",
  drink: "Drinks",
  nightlife: "Nightlife",
  activity: "Activity",
  sight: "Sight",
  shopping: "Shopping",
  stay: "Stay",
  transit: "Getting around",
  city: "City",
  other: "Other",
};

/** One place to rename an idea, change its category, or move it to another city (founder feedback). */
export function IdeaEditor({
  tripId,
  idea,
  stops,
  onDone,
  onWrongPlace,
  onError,
}: {
  tripId: string;
  idea: { id: string; title: string; category: string; stopId: string | null };
  stops: { id: string; name: string }[];
  onDone: (message?: string) => void;
  onWrongPlace?: () => void;
  onError: (r: { error: string; signin?: string }) => void;
}) {
  const [pending, start] = useTransition();
  const named = stops.filter((s) => s.name.trim());
  const id = (k: string) => `edit-${k}-${idea.id}`;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const stop = String(f.get("stop") ?? "__keep");
        start(async () => {
          const r = await editIdeaAction(tripId, idea.id, {
            title: String(f.get("title") ?? ""),
            category: String(f.get("category") ?? ""),
            ...(stop === "__keep" ? {} : { stopId: stop === "__unsorted" ? null : stop }),
          });
          if (r.ok) onDone(r.message);
          else onError(r);
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={id("title")}>Name</Label>
        <Input id={id("title")} name="title" defaultValue={idea.title} maxLength={120} required />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={id("category")}>Category</Label>
          <select
            id={id("category")}
            name="category"
            defaultValue={idea.category}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
          >
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {named.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor={id("stop")}>City</Label>
            <select
              id={id("stop")}
              name="stop"
              defaultValue={idea.stopId ?? "__unsorted"}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
            >
              {named.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__unsorted">Unsorted</option>
            </select>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onWrongPlace ? (
          <button type="button" onClick={onWrongPlace} className="text-sm font-semibold text-primary hover:underline">
            Wrong place? Search for it
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onDone()}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={pending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
