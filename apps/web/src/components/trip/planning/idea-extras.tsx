"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { notMyPickAction, setIdeaStatusAction } from "@/app/t/[tripId]/stops/actions";

/**
 * Founder feedback: "Shortlist" and "Plan it" read as the same thing. Same statuses (FR-49), clearer
 * words: a Top pick is still being decided; Decided means it's happening and goes on the plan.
 */
const STATUS_LABEL: Record<string, string> = { shortlisted: "⭐ Top pick", planned: "✓ Decided", dropped: "Dropped", done: "Done" };
const NEXT: { status: "shortlisted" | "planned" | "dropped" | "idea"; label: string; hint: string }[] = [
  { status: "shortlisted", label: "⭐ Top pick", hint: "A top contender. The group is still deciding." },
  { status: "planned", label: "✓ Decided", hint: "It's happening. It goes on the day-by-day plan." },
  { status: "dropped", label: "Drop", hint: "Not doing it. It moves out of the feed." },
];
const BACK = { status: "idea" as const, label: "Undecide", hint: "Back to a regular idea." };

/**
 * Card footer: status for everyone; organizers change it (FR-49, with undo, P7);
 * "Not my pick, but I'm in" (FR-50) for people who passed on a decided idea.
 */
export function IdeaExtras({
  tripId,
  ideaId,
  status,
  isOrganizer,
  showNotMyPick,
  notMyPick,
}: {
  tripId: string;
  ideaId: string;
  status: string;
  isOrganizer: boolean;
  showNotMyPick: boolean;
  notMyPick: boolean;
}) {
  const [busy, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  if (!isOrganizer && !showNotMyPick && !STATUS_LABEL[status]) return null;

  function setStatus(next: string) {
    start(async () => {
      const r = await setIdeaStatusAction(tripId, ideaId, next);
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
        return;
      }
      const prev = r.previous;
      toast({
        title: next === "idea" ? "Back to a regular idea" : next === "planned" ? "✓ Decided: it's on the plan" : `${STATUS_LABEL[next]}`,
        action: prev ? { label: "Undo", onClick: () => start(async () => void (await setIdeaStatusAction(tripId, ideaId, prev))) } : undefined,
      });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-sm">
      {STATUS_LABEL[status] ? <Badge variant={status === "dropped" ? "default" : "secondary"}>{STATUS_LABEL[status]}</Badge> : null}
      {showNotMyPick ? (
        <button
          type="button"
          aria-pressed={notMyPick}
          disabled={busy}
          onClick={() => start(async () => void (await notMyPickAction(tripId, ideaId, !notMyPick)))}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold",
            notMyPick ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted",
          )}
        >
          {notMyPick ? "You're in ✓" : "Not my pick, but I'm in"}
        </button>
      ) : null}
      {isOrganizer ? (
        <div role="group" aria-label="Organizer: set status" className="ml-auto flex flex-wrap gap-1">
          {(status === "idea" ? NEXT : [BACK, ...NEXT.filter((n) => n.status !== status)]).map((n) => (
            <button
              key={n.status}
              type="button"
              disabled={busy}
              title={n.hint}
              onClick={() => setStatus(n.status)}
              className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {n.label}
            </button>
          ))}
        </div>
      ) : null}
      {isOrganizer && status !== "dropped" ? (
        <p className="basis-full text-xs text-muted-foreground">
          Top pick = still deciding · Decided = it&apos;s happening and goes on the plan
        </p>
      ) : null}
    </div>
  );
}
