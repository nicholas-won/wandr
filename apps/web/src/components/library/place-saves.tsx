"use client";

/**
 * A city's (or board's) saves grouped by category (FR-L6), with optional multi-select to send
 * to a trip (FR-L12) or start one (FR-L11; Must-do saves preselected).
 */
import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { libraryRoutes } from "@/lib/library-routes";
import { categoryLabel } from "./format";
import { RemoveItem } from "./board-forms";
import { SaveCard, type SaveCardData } from "./save-card";
import { SendToTripSheet, StartTripSheet } from "./trip-sheets";

export interface PlaceSavesProps {
  groups: { category: string; saves: (SaveCardData & { selectable: boolean; mine: boolean; removable?: boolean })[] }[];
  preselected: string[];
  trips: { id: string; name: string }[];
  suggestedName: string;
  city: string | null;
  /** Open the start sheet right away (trip-ready nudge, ?start=1). */
  startOpen?: boolean;
  boardId?: string;
  sharedBoard?: boolean;
}

export function PlaceSaves({ groups, preselected, trips, suggestedName, city, startOpen, boardId, sharedBoard }: PlaceSavesProps) {
  const [selecting, setSelecting] = useState(!!startOpen);
  const [selected, setSelected] = useState<string[]>(preselected);
  const [startSheet, setStartSheet] = useState(!!startOpen);
  const [sendSheet, setSendSheet] = useState(false);
  const any = groups.some((g) => g.saves.some((s) => s.selectable));

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="space-y-6 pb-24">
      {any ? (
        <div className="flex flex-wrap items-center gap-2">
          {!selecting ? (
            <>
              <Button onClick={() => { setSelecting(true); setStartSheet(true); }}>Start a trip</Button>
              <Button variant="outline" onClick={() => setSelecting(true)}>
                Select
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setSelecting(false)}>
              Done selecting
            </Button>
          )}
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.category} aria-labelledby={`cat-${g.category}`} className="space-y-2">
          <h2 id={`cat-${g.category}`} className="font-display text-lg font-bold">
            {categoryLabel(g.category)} <span className="text-muted-foreground">· {g.saves.length}</span>
          </h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {g.saves.map((s) => {
              const on = selected.includes(s.id);
              return (
                <li key={s.id} className="relative">
                  {selecting && s.selectable ? (
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${on ? "Deselect" : "Select"} ${s.title}`}
                      onClick={() => toggle(s.id)}
                      className={cn(
                        "absolute right-3 top-3 z-20 grid size-8 place-items-center rounded-full border-2 bg-card",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {on ? <Check className="size-4" aria-hidden /> : null}
                    </button>
                  ) : null}
                  <SaveCard save={s} href={s.mine && !selecting ? libraryRoutes.save(s.id) : undefined} />
                  {boardId && s.removable && !selecting ? (
                    <div className="mt-1 text-right">
                      <RemoveItem boardId={boardId} savedIdeaId={s.id} title={s.title} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {selecting ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <span className="flex-1 text-sm font-semibold">{selected.length} selected</span>
            <Button variant="outline" size="sm" disabled={!selected.length} onClick={() => setSendSheet(true)}>
              Send to trip
            </Button>
            <Button size="sm" disabled={!selected.length} onClick={() => setStartSheet(true)}>
              Start a trip
            </Button>
          </div>
        </div>
      ) : null}

      <StartTripSheet
        open={startSheet}
        onOpenChange={setStartSheet}
        savedIdeaIds={selected}
        suggestedName={suggestedName}
        city={city}
        boardId={boardId}
        sharedBoard={sharedBoard}
      />
      <SendToTripSheet
        open={sendSheet}
        onOpenChange={setSendSheet}
        savedIdeaIds={selected}
        trips={trips}
        onSent={() => setSelecting(false)}
      />
    </div>
  );
}
