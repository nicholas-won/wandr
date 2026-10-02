"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import { STAGE_LABELS, type StageKind } from "@wandr/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createPollAction } from "@/app/t/[tripId]/polls/actions";

type Opt = { label: string; imageUrl: string; showImage: boolean };
const DEADLINES = [
  { label: "24 hours", ms: 24 * 3_600_000 },
  { label: "2 days", ms: 2 * 86_400_000 },
  { label: "1 week", ms: 7 * 86_400_000 },
  { label: "No deadline", ms: 0 },
];

/** FR-47 / FR-S12 / FR-92: one screen, one primary action ("Start poll"). */
export function PollForm({
  tripId,
  ideas,
  stops,
  stages,
}: {
  tripId: string;
  ideas: { id: string; title: string; stopId: string | null }[];
  stops: { id: string; name: string }[];
  stages: StageKind[];
}) {
  const [kind, setKind] = useState<"custom" | "ideas">("custom");
  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState<Opt[]>([
    { label: "", imageUrl: "", showImage: false },
    { label: "", imageUrl: "", showImage: false },
  ]);
  const [picked, setPicked] = useState<string[]>([]);
  const [deadline, setDeadline] = useState(DEADLINES[0]!.ms);
  const [stopId, setStopId] = useState<string>("");
  const [stage, setStage] = useState<string>("");
  const [busy, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const set = (i: number, patch: Partial<Opt>) => setOpts((o) => o.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const visibleIdeas = stopId ? ideas.filter((i) => i.stopId === stopId) : ideas;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createPollAction(tripId, {
            question,
            kind,
            stopId: stopId || null,
            stage: (stage || null) as StageKind | null,
            closesAt: deadline ? new Date(Date.now() + deadline).toISOString() : null,
            options:
              kind === "ideas"
                ? picked.map((id) => ({ label: "", ideaId: id, imageUrl: null }))
                : opts.map((o) => ({ label: o.label, ideaId: null, imageUrl: o.imageUrl.trim() || null })),
          });
          if (!r.ok) {
            if (r.signin) router.push(r.signin);
            else toast({ title: r.error, variant: "error" });
            return;
          }
          router.push(`/t/${tripId}/polls/${r.pollId}`);
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="q">Question</Label>
        <Input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={140} required placeholder="Saturday night theme?" />
      </div>

      <div role="radiogroup" aria-label="Choose between" className="grid grid-cols-2 gap-2">
        {(["custom", "ideas"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "h-11 rounded-full border text-sm font-semibold",
              kind === k ? "border-foreground bg-foreground text-background" : "border-input bg-card hover:bg-muted",
            )}
          >
            {k === "custom" ? "Your own options" : "Ideas from the trip"}
          </button>
        ))}
      </div>

      {kind === "custom" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Options</legend>
          {opts.map((o, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border p-2">
              <div className="flex gap-2">
                <Input aria-label={`Option ${i + 1}`} value={o.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={80} placeholder={`Option ${i + 1}`} />
                <button type="button" aria-label="Add an image" onClick={() => set(i, { showImage: !o.showImage })} className="inline-flex size-12 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                  <ImagePlus className="size-5" />
                </button>
                {opts.length > 2 ? (
                  <button type="button" aria-label={`Remove option ${i + 1}`} onClick={() => setOpts((x) => x.filter((_, k) => k !== i))} className="inline-flex size-12 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                    <X className="size-5" />
                  </button>
                ) : null}
              </div>
              {o.showImage ? (
                <Input aria-label={`Image link for option ${i + 1}`} type="url" inputMode="url" value={o.imageUrl} onChange={(e) => set(i, { imageUrl: e.target.value })} placeholder="https://… (photo of the outfit or theme)" />
              ) : null}
            </div>
          ))}
          {opts.length < 10 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpts((o) => [...o, { label: "", imageUrl: "", showImage: false }])}>
              <Plus aria-hidden /> Add option
            </Button>
          ) : null}
        </fieldset>
      ) : (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">Pick 2 to 10 ideas</legend>
          {visibleIdeas.length < 2 ? <p className="text-sm text-muted-foreground">Add a few ideas to the trip first.</p> : null}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {visibleIdeas.map((i) => (
              <li key={i.id}>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={picked.includes(i.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))}
                  />
                  {i.title}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="deadline">Closes in</Label>
          <select id="deadline" value={deadline} onChange={(e) => setDeadline(Number(e.target.value))} className="h-12 w-full rounded-lg border border-input bg-card px-3">
            {DEADLINES.map((d) => (
              <option key={d.label} value={d.ms}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        {stops.length > 1 ? (
          <div className="space-y-1">
            <Label htmlFor="stop">Who votes</Label>
            <select id="stop" value={stopId} onChange={(e) => setStopId(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card px-3">
              <option value="">Everyone</option>
              {stops.map((s) => (
                <option key={s.id} value={s.id}>
                  People going to {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="stage">Decides (optional)</Label>
          <select id="stage" value={stage} onChange={(e) => setStage(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card px-3">
            <option value="">Something else</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Votes stay hidden until each person votes. People who don&apos;t vote don&apos;t count as yes.</p>
      <Button type="submit" block loading={busy}>
        Start poll
      </Button>
    </form>
  );
}
