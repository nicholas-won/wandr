"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { editIdeaAction } from "../actions";

/** Give a decided idea a city so it can go on that city's plan. */
export function PutInCity({ tripId, ideaId, stops }: { tripId: string; ideaId: string; stops: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const stopId = String(new FormData(e.currentTarget).get("stop") ?? "");
        const name = stops.find((s) => s.id === stopId)?.name ?? "that city";
        start(async () => {
          const r = await editIdeaAction(tripId, ideaId, { stopId });
          if (!r.ok) return r.signin ? router.push(r.signin) : toast({ title: r.error, variant: "error" });
          toast({ title: `Moved to ${name}` });
        });
      }}
    >
      <label className="sr-only" htmlFor={`city-${ideaId}`}>
        City
      </label>
      <select id={`city-${ideaId}`} name="stop" className="rounded-md border border-input bg-card px-2 py-1 text-sm">
        {stops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" loading={pending}>
        Put it here
      </Button>
    </form>
  );
}
