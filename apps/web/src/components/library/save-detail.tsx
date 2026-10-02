"use client";

/**
 * One save: priority (FR-L9), note, "Is this right?" sort fix (FR-L3, §5 overrides), boards
 * (FR-L8), send to a trip (FR-L12), start a trip around it (FR-1a / FR-L11), delete.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";
import { LIBRARY_CATEGORIES } from "@wandr/core/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  createBoardAction,
  deleteSaveAction,
  noteAction,
  pickListicleAction,
  toggleBoardAction,
  updateSortAction,
  type LibraryResult,
} from "@/app/library/actions";
import { categoryLabel } from "./format";
import { SendToTripSheet, StartTripSheet } from "./trip-sheets";

type Priority = "must" | "down" | "pass";
const PRIORITIES: { v: Priority; label: string; on: string }[] = [
  { v: "must", label: "Must-do", on: "bg-vote-must text-vote-foreground border-vote-must" },
  { v: "down", label: "Maybe", on: "bg-vote-down text-vote-foreground border-vote-down" },
  { v: "pass", label: "Skip", on: "bg-vote-pass text-vote-foreground border-vote-pass" },
];

export interface SaveDetailProps {
  id: string;
  title: string;
  pending: boolean;
  selectable: boolean;
  needsReview: boolean;
  country: string | null;
  city: string | null;
  category: string;
  hasOverride: boolean;
  note: string | null;
  priority: Priority | null;
  listicle: { name: string; summary: string }[] | null;
  boards: { id: string; name: string; on: boolean; shared: boolean }[];
  trips: { id: string; name: string }[];
  suggestedName: string | null;
  suggestedCity: string | null;
  /** FR-1a: arrived from a paste on the home screen → "Start a trip around this?" leads. */
  fromHome: boolean;
}

export function SaveDetail(p: SaveDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(p.needsReview && !p.fromHome);
  const [startOpen, setStartOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (fn: () => Promise<LibraryResult | void>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
      } else if (ok) toast({ title: ok });
    });

  const startCta = (
    <Button size="lg" block={p.fromHome} disabled={!p.selectable} onClick={() => setStartOpen(true)}>
      {p.suggestedCity ? `Start a trip around ${p.suggestedCity}?` : "Start a trip around this?"} <ArrowRight aria-hidden />
    </Button>
  );

  return (
    <div className="space-y-6">
      {p.fromHome && !p.pending ? (
        <div className="space-y-2 rounded-2xl bg-secondary p-4 text-secondary-foreground">
          <p className="font-semibold">Saved to your library.</p>
          {startCta}
          <Button variant="link" onClick={() => router.replace(`/library/s/${p.id}`)}>
            Just keep it saved
          </Button>
        </div>
      ) : null}

      {p.listicle ? <ListiclePicker id={p.id} candidates={p.listicle} /> : null}

      {!p.pending && !p.listicle ? (
        <section aria-label="Someday priority" className="space-y-2">
          <div role="group" aria-label="Someday priority" className="grid grid-cols-3 gap-2">
            {PRIORITIES.map(({ v, label, on }) => {
              const active = p.priority === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  disabled={pending}
                  onClick={() => {
                    const prev = p.priority;
                    start(async () => {
                      await noteAction(p.id, { priority: active ? null : v });
                      toast({
                        title: active ? "Priority cleared" : `Marked ${label}`,
                        action: { label: "Undo", onClick: () => start(async () => void (await noteAction(p.id, { priority: prev }))) },
                      });
                    });
                  }}
                  className={cn(
                    "h-11 rounded-full border text-sm font-semibold transition active:scale-[0.97]",
                    active ? on : "border-input bg-card hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {!p.pending ? (
        <section className="space-y-2">
          {editing ? (
            <form
              className="space-y-3 rounded-xl border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  const r = await updateSortAction(p.id, {
                    title: String(f.get("title") ?? ""),
                    country: String(f.get("country") ?? "") || null,
                    city: String(f.get("city") ?? "") || null,
                    category: String(f.get("category") ?? "") || null,
                  });
                  if (r.ok) setEditing(false);
                  return r;
                }, "Updated");
              }}
            >
              <p className="text-sm font-semibold">Is this right? Fix anything that&apos;s off.</p>
              <div className="space-y-1">
                <Label htmlFor="s-title">Name</Label>
                <Input id="s-title" name="title" defaultValue={p.title} />
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div className="space-y-1">
                  <Label htmlFor="s-city">City or region</Label>
                  <Input id="s-city" name="city" defaultValue={p.city ?? ""} placeholder="Lisbon" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s-country">Country</Label>
                  <Input id="s-country" name="country" defaultValue={p.country ?? ""} placeholder="PT" maxLength={2} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="s-cat">Kind of place</Label>
                <select
                  id="s-cat"
                  name="category"
                  defaultValue={p.category}
                  className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base"
                >
                  {LIBRARY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={pending}>
                  Save
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" aria-hidden /> Fix name or place
            </button>
          )}
        </section>
      ) : null}

      {!p.pending ? (
        <section className="space-y-1">
          <Label htmlFor="s-note">Note (only you)</Label>
          <Textarea
            id="s-note"
            defaultValue={p.note ?? ""}
            placeholder="Go at sunset…"
            onBlur={(e) => {
              if ((e.target.value || null) !== p.note) run(() => noteAction(p.id, { note: e.target.value }), "Note saved");
            }}
          />
        </section>
      ) : null}

      {!p.pending ? (
        <section className="space-y-2" aria-labelledby="boards-h">
          <h2 id="boards-h" className="text-sm font-semibold">
            Boards
          </h2>
          <div className="flex flex-wrap gap-2">
            {p.boards.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={b.on}
                disabled={pending}
                onClick={() => run(() => toggleBoardAction(b.id, p.id, !b.on))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold",
                  b.on ? "border-foreground bg-foreground text-background" : "border-input hover:bg-muted",
                )}
              >
                {b.name}
                {b.shared ? <span className="sr-only"> (shared)</span> : null}
              </button>
            ))}
            <NewBoard savedIdeaId={p.id} />
          </div>
        </section>
      ) : null}

      {!p.fromHome || p.pending ? (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {p.selectable ? (
            <>
              {startCta}
              <Button variant="outline" size="lg" onClick={() => setSendOpen(true)}>
                Send to a trip
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <div>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Delete this save? Trips keep their copy.</span>
            <Button variant="destructive" size="sm" loading={pending} onClick={() => run(() => deleteSaveAction(p.id))}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden /> Delete save
          </button>
        )}
      </div>

      <StartTripSheet
        open={startOpen}
        onOpenChange={setStartOpen}
        savedIdeaIds={[p.id]}
        suggestedName={p.suggestedName ?? "New trip"}
        city={p.suggestedCity}
      />
      <SendToTripSheet open={sendOpen} onOpenChange={setSendOpen} savedIdeaIds={[p.id]} trips={p.trips} />
    </div>
  );
}

function NewBoard({ savedIdeaId }: { savedIdeaId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-input px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
      >
        + New board
      </button>
    );
  }
  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name") ?? "");
        start(async () => {
          const r = await createBoardAction(name, savedIdeaId);
          if (!r.ok) toast({ title: r.error, variant: "error" });
          else setOpen(false);
        });
      }}
    >
      <label htmlFor="nb" className="sr-only">
        Board name
      </label>
      <Input id="nb" name="name" autoFocus placeholder="Honeymoon someday" className="h-10" />
      <Button size="sm" loading={pending}>
        Add
      </Button>
    </form>
  );
}

/** FR-L4: "This mentions 5 places. Save all, or pick which?" */
function ListiclePicker({ id, candidates }: { id: string; candidates: { name: string; summary: string }[] }) {
  const [picked, setPicked] = useState<number[]>(candidates.map((_, i) => i));
  const [pending, start] = useTransition();
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm font-semibold">This mentions {candidates.length} places. Save all, or pick which?</p>
      <ul className="mt-2 space-y-1">
        {candidates.map((c, i) => (
          <li key={i}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(i)}
                onChange={(e) => setPicked((x) => (e.target.checked ? [...x, i] : x.filter((y) => y !== i)))}
                className="size-4 accent-[var(--primary)]"
              />
              {c.name}
            </label>
          </li>
        ))}
      </ul>
      <Button size="sm" className="mt-3" loading={pending} onClick={() => start(async () => void (await pickListicleAction(id, picked)))}>
        {picked.length === candidates.length ? "Save all" : `Save ${picked.length}`}
      </Button>
    </div>
  );
}
