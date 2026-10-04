"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { sendToTripAction, startTripFromSavesAction } from "@/app/library/actions";
import { routes } from "@/lib/routes";

/** FR-L11 / FR-1a: name the trip (suggested) and go. The city becomes its Stop. */
export function StartTripSheet({
  open,
  onOpenChange,
  savedIdeaIds,
  suggestedName,
  city,
  boardId,
  sharedBoard,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  savedIdeaIds: string[];
  suggestedName: string;
  city: string | null;
  boardId?: string;
  sharedBoard?: boolean;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Start a trip"
      description={`${savedIdeaIds.length} ${savedIdeaIds.length === 1 ? "idea" : "ideas"} will be copied in${city ? `, with ${city} as your first stop` : ""}.`}
    >
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name") ?? "");
          start(async () => {
            const r = await startTripFromSavesAction({ name, city, savedIdeaIds, boardId: boardId ?? null });
            if (r && !r.ok) {
              if (r.signin) router.push(r.signin);
              else toast({ title: r.error, variant: "error" });
            }
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="trip-name">Trip name</Label>
          <Input id="trip-name" name="name" defaultValue={suggestedName} autoComplete="off" />
        </div>
        {sharedBoard ? (
          <p className="text-sm text-muted-foreground">
            Everyone on this board with a phone number gets a text invite to the trip.
          </p>
        ) : null}
        <Button type="submit" block size="lg" loading={pending}>
          Start the trip <ArrowRight aria-hidden />
        </Button>
      </form>
    </Sheet>
  );
}

/** FR-L12: send one or more saves to a trip you're in. */
export function SendToTripSheet({
  open,
  onOpenChange,
  savedIdeaIds,
  trips,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  savedIdeaIds: string[];
  trips: { id: string; name: string }[];
  onSent?: () => void;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Send to a trip" description="The trip gets its own copy to vote on.">
      {trips.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">You&apos;re not in any trips yet.</p>
      ) : (
        <ul className="mt-4 divide-y rounded-xl border">
          {trips.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={pending}
                className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold hover:bg-muted disabled:opacity-50"
                onClick={() =>
                  start(async () => {
                    const r = await sendToTripAction(t.id, savedIdeaIds);
                    if (!r.ok) {
                      if (r.signin) router.push(r.signin);
                      else toast({ title: r.error, variant: "error" });
                      return;
                    }
                    onOpenChange(false);
                    onSent?.();
                    toast({
                      title: r.message ?? "Sent",
                      action: { label: "Open trip", onClick: () => router.push(routes.trip(t.id)) },
                    });
                  })
                }
              >
                {t.name}
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
