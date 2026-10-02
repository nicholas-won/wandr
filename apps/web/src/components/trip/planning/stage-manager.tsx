"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STAGE_LABELS, type StageAction, type StageKind, type StageStatus } from "@wandr/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { moveStageAction, undoStageAction } from "@/app/t/[tripId]/stops/actions";
import type { ReopenPreview, StageView } from "@/server/planning";
import { ClosesLabel } from "./local-time";

const STATUS_TEXT: Record<StageStatus, string> = {
  collecting: "Collecting ideas",
  voting: "Voting",
  set: "Set",
  not_needed: "Not needed",
};

function actionLabel(a: StageAction, solo: boolean, status: StageStatus): string {
  switch (a) {
    case "start_voting":
      return "Start voting";
    case "set":
      return solo ? "Mark set" : status === "collecting" ? "Already decided" : "Lock it in";
    case "mark_not_needed":
      return "Not needed";
    case "reopen":
      return "Reopen";
    case "restore":
      return "Bring back";
  }
}

type Pending =
  | { kind: "no_votes"; stage: StageKind; action: StageAction }
  | { kind: "reopen"; stage: StageKind; preview: ReopenPreview };

/** FR-S1/S2/S4: organizers move stages; solo gets plain set toggles (§6.10). */
export function StageManager({
  tripId,
  stages,
  solo,
  isOrganizer,
}: {
  tripId: string;
  stages: StageView[];
  solo: boolean;
  isOrganizer: boolean;
}) {
  const [busy, start] = useTransition();
  const [pending, setPending] = useState<Pending | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  function run(stage: StageKind, action: StageAction, confirmed = false) {
    start(async () => {
      const r = await moveStageAction(tripId, stage, action, confirmed);
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
        return;
      }
      const res = r.result;
      if (res.ok) {
        setPending(null);
        toast({
          title: `${STAGE_LABELS[stage]}: ${STATUS_TEXT[res.to].toLowerCase()}`,
          action: {
            label: "Undo",
            onClick: () => start(async () => void (await undoStageAction(tripId, stage, res.from, res.to))),
          },
        });
      } else if (res.reason === "confirm_no_votes") setPending({ kind: "no_votes", stage, action });
      else if (res.reason === "confirm_reopen") setPending({ kind: "reopen", stage, preview: res.preview });
      else toast({ title: "That step isn't available here.", variant: "error" });
    });
  }

  return (
    <>
      <ol className="divide-y rounded-xl border bg-card">
        {stages.map((s) => (
          <li key={s.kind} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{STAGE_LABELS[s.kind]}</p>
              <p className="text-sm text-muted-foreground">
                {STATUS_TEXT[s.status]}
                {s.status === "voting" && s.closesAt ? (
                  <>
                    {" · "}
                    <ClosesLabel at={s.closesAt} />
                  </>
                ) : null}
              </p>
            </div>
            {isOrganizer ? (
              <div className="flex flex-wrap gap-2">
                {s.actions.map((a) => (
                  <Button key={a} size="sm" variant={a === "set" ? "secondary" : "ghost"} disabled={busy} onClick={() => run(s.kind, a)}>
                    {actionLabel(a, solo, s.status)}
                  </Button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <Dialog
        open={pending?.kind === "no_votes"}
        onOpenChange={(o) => !o && setPending(null)}
        title="No one has voted yet. Set anyway?"
        description="Organizers decide. You can reopen it later."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => pending && pending.kind === "no_votes" && run(pending.stage, pending.action, true)}>
            Set anyway
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={pending?.kind === "reopen"}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === "reopen" ? `Reopen ${STAGE_LABELS[pending.stage]}?` : "Reopen?"}
        description="Here's what this touches. Nothing is deleted; open polls are paused until you resume them."
      >
        {pending?.kind === "reopen" ? <ImpactList preview={pending.preview} /> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => pending && run(pending.stage, "reopen", true)}>
            Reopen
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function ImpactList({ preview }: { preview: ReopenPreview }) {
  const empty =
    !preview.downstreamSetStages.length && !preview.pollsToPause.length && !preview.plannedItems.length && !preview.ideas.length;
  if (empty) return <p className="text-sm text-muted-foreground">Nothing later in the plan depends on it.</p>;
  return (
    <div className="space-y-3 text-sm">
      {preview.downstreamSetStages.length ? (
        <p>
          <span className="font-semibold">Set stages that may need another look:</span>{" "}
          {preview.downstreamSetStages.map((k) => STAGE_LABELS[k]).join(", ")}
        </p>
      ) : null}
      <Group title="Polls to pause" items={preview.pollsToPause.map((p) => p.question)} />
      <Group title="Planned items to review" items={preview.plannedItems.map((p) => p.title)} />
      <Group title="Shortlisted or planned ideas" items={preview.ideas.map((p) => p.title)} />
    </div>
  );
}

function Group({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-semibold">
        {title} ({items.length})
      </p>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {items.slice(0, 8).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
        {items.length > 8 ? <li>and {items.length - 8} more</li> : null}
      </ul>
    </div>
  );
}
