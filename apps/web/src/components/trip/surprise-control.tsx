"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Gift } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { setIdeaSurpriseAction } from "@/app/t/[tripId]/surprise-actions";

type Person = { id: string; displayName: string; isGuestOfHonor: boolean };

/**
 * FR-91 surprise mode on an idea card. Organizers pick who must not see it; one tap targets the
 * guests of honor. Everyone else sees a "Surprise for …" label so nobody spoils it.
 */
export function SurpriseControl({
  tripId,
  ideaId,
  hiddenFrom,
  people,
  canEdit,
}: {
  tripId: string;
  ideaId: string;
  hiddenFrom: string[];
  /** Other active members (never the viewer). */
  people: Person[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(hiddenFrom);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const names = people.filter((p) => hiddenFrom.includes(p.id)).map((p) => p.displayName);
  const guests = people.filter((p) => p.isGuestOfHonor).map((p) => p.id);

  const save = (ids: string[]) =>
    start(async () => {
      const prev = hiddenFrom;
      const r = await setIdeaSurpriseAction(tripId, ideaId, ids);
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
        return;
      }
      setOpen(false);
      toast({
        title: r.message ?? "Saved",
        action: { label: "Undo", onClick: () => start(async () => void (await setIdeaSurpriseAction(tripId, ideaId, prev))) },
      });
    });

  if (!canEdit && names.length === 0) return null;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        {names.length ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
            <Gift className="size-4" aria-hidden /> Surprise for {names.join(", ")}
          </span>
        ) : (
          <span />
        )}
        {canEdit ? (
          <button
            type="button"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {names.length ? "Change" : "🎁 Make it a surprise"}
          </button>
        ) : null}
      </div>
      {open ? (
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold">Hide from</legend>
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={picked.includes(p.id)}
                onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, p.id] : xs.filter((x) => x !== p.id)))}
              />
              {p.displayName}
              {p.isGuestOfHonor ? <span className="text-xs text-muted-foreground">(guest of honor)</span> : null}
            </label>
          ))}
          <div className="flex flex-wrap gap-3 pt-1">
            <button type="button" disabled={pending} onClick={() => save(picked)} className="font-semibold text-primary">
              Save
            </button>
            {guests.length ? (
              <button type="button" disabled={pending} onClick={() => save(guests)} className="font-semibold">
                Hide from guest of honor
              </button>
            ) : null}
            {hiddenFrom.length ? (
              <button type="button" disabled={pending} onClick={() => save([])} className="text-muted-foreground">
                Show to everyone
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            They won&apos;t see it in the app, texts, previews or counts. Polls and plan items for it are hidden too.
          </p>
        </fieldset>
      ) : null}
    </div>
  );
}
