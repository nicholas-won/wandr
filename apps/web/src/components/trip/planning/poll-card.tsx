"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Check, Pause, Play } from "lucide-react";
import { STAGE_LABELS } from "@wandr/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { managePollAction, votePollAction } from "@/app/t/[tripId]/polls/actions";
import type { PollView } from "@/server/polls";
import { ClosesLabel } from "./local-time";

const STATUS: Record<PollView["status"], string> = {
  open: "Open",
  paused: "Paused",
  needs_decision: "Needs a decision",
  decided: "Decided",
};

/** FR-47: blind voting on a poll; FR-48 decisions for organizers; FR-92 image options. */
export function PollCard({ tripId, poll, detail = false }: { tripId: string; poll: PollView; detail?: boolean }) {
  const [busy, start] = useTransition();
  const [mine, setMine] = useOptimistic(poll.myOptionId);
  const { toast } = useToast();
  const router = useRouter();
  const open = poll.status === "open";
  const canVote = open && poll.eligible;
  const hasImages = poll.options.some((o) => o.imageUrl);

  const fail = (r: { error: string; signin?: string }) => (r.signin ? router.push(r.signin) : toast({ title: r.error, variant: "error" }));

  function vote(optionId: string) {
    const prev = mine;
    const next = mine === optionId ? null : optionId;
    start(async () => {
      setMine(next);
      const r = await votePollAction(tripId, poll.id, next);
      if (!r.ok) return fail(r);
      toast({
        title: next ? "Vote saved" : "Vote cleared",
        action: { label: "Undo", onClick: () => start(async () => void (await votePollAction(tripId, poll.id, prev))) },
      });
    });
  }

  function manage(action: Parameters<typeof managePollAction>[2], optionId?: string) {
    start(async () => {
      const r = await managePollAction(tripId, poll.id, action, optionId);
      if (!r.ok) return fail(r);
      if (action === "runoff" && r.pollId) router.push(`/t/${tripId}/polls/${r.pollId}`);
    });
  }

  const maxCount = Math.max(1, ...poll.options.map((o) => o.count ?? 0));

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {detail ? (
            <h2 className="font-display text-xl font-bold leading-tight">{poll.question}</h2>
          ) : (
            <h3 className="font-display text-lg font-bold leading-tight">
              <Link href={`/t/${tripId}/polls/${poll.id}`} className="hover:underline">
                {poll.question}
              </Link>
            </h3>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{STATUS[poll.status]}</span>
            {open && poll.closesAt ? <ClosesLabel at={poll.closesAt} /> : null}
            {poll.stopName ? <span>· {poll.stopName}</span> : null}
            {poll.stage ? <span>· {STAGE_LABELS[poll.stage]}</span> : null}
            {poll.turnout ? (
              <span>
                · {poll.turnout.voted} of {poll.turnout.eligible} voted
              </span>
            ) : null}
          </p>
        </div>
        {poll.status === "decided" ? <Badge variant="primary">Decided</Badge> : null}
      </div>

      <div role="group" aria-label="Options" className={cn("mt-3 gap-2", hasImages ? "grid grid-cols-2" : "flex flex-col")}>
        {poll.options.map((o) => {
          const on = mine === o.id;
          const won = poll.winningOptionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              disabled={!canVote || busy}
              onClick={() => vote(o.id)}
              className={cn(
                "relative overflow-hidden rounded-xl border text-left transition active:scale-[0.99] disabled:cursor-default",
                on ? "border-primary ring-2 ring-primary" : "border-input bg-card",
                canVote && "hover:bg-muted",
                won && "border-primary",
              )}
            >
              {o.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- organizer-supplied https image; no optimizer
                <img src={o.imageUrl} alt="" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
              ) : null}
              <span className="relative block px-3 py-2.5">
                {o.count != null ? (
                  <span aria-hidden className="absolute inset-y-0 left-0 bg-secondary" style={{ width: `${(o.count / maxCount) * 100}%` }} />
                ) : null}
                <span className="relative flex items-center justify-between gap-2 text-sm font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    {on ? <Check className="size-4 text-primary" aria-label="your vote" /> : null}
                    {won ? <span aria-label="winner">🏆</span> : null}
                    {o.label}
                  </span>
                  {o.count != null ? <span className="tabular-nums">{o.count}</span> : null}
                </span>
                {o.voters?.length ? <span className="relative block text-xs text-muted-foreground">{o.voters.join(", ")}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {open && !poll.eligible ? (
        <p className="mt-2 text-xs text-muted-foreground">Only people going to {poll.stopName ?? "this Stop"} vote here.</p>
      ) : open && !mine ? (
        <p className="mt-2 text-xs text-muted-foreground">Vote to see how it&apos;s going.</p>
      ) : null}
      {poll.resultText ? <p className="mt-3 text-sm font-semibold">{poll.resultText}</p> : null}
      {poll.runoffPollId ? (
        <Link href={`/t/${tripId}/polls/${poll.runoffPollId}`} className="mt-1 inline-block text-sm font-semibold text-primary hover:underline">
          Go to the run-off
        </Link>
      ) : null}

      {poll.decisionActions.length ? (
        <div className="mt-3 space-y-2 rounded-lg bg-muted p-3">
          <p className="text-sm font-semibold">No automatic winner. You decide:</p>
          <div className="flex flex-wrap gap-2">
            {poll.decisionActions.includes("pick")
              ? poll.options
                  .filter((o) => poll.pickable.includes(o.id))
                  .map((o) => (
                    <Button key={o.id} size="sm" variant="secondary" disabled={busy} onClick={() => manage("pick", o.id)}>
                      Pick {o.label}
                    </Button>
                  ))
              : null}
            {poll.decisionActions.includes("runoff") ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => manage("runoff")}>
                Run-off, 24h
              </Button>
            ) : null}
            {poll.decisionActions.includes("extend") ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => manage("extend")}>
                Extend 24h
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {detail && poll.canManage && (open || poll.status === "paused") ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
          {open ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => manage("pause")}>
              <Pause aria-hidden /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => manage("resume")}>
              <Play aria-hidden /> Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => manage("extend")}>
            Extend 24h
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => manage("close")}>
            Close now
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
