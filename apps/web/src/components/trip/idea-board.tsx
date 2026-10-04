"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { GripVertical, MessageCircle } from "lucide-react";
import { voteLabel, type TripSize, type VoteValue } from "@wandr/core";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { boardColumns, type BoardColumn, type BoardGroup } from "@/lib/board";
import { cn } from "@/lib/utils";
import { editIdeaAction, voteAction } from "@/app/t/[tripId]/actions";
import { setIdeaStatusAction } from "@/app/t/[tripId]/stops/actions";
import type { IdeaCard as CardModel } from "@/server/cards";
import { IdeaCard } from "./idea-card";

const VOTES: VoteValue[] = ["must", "down", "pass"];
const VOTE_ON: Record<VoteValue, string> = {
  must: "bg-vote-must text-vote-foreground border-vote-must",
  down: "bg-vote-down text-vote-foreground border-vote-down",
  pass: "bg-vote-pass text-vote-foreground border-vote-pass",
};

type Drop = NonNullable<BoardColumn<CardModel>["drop"]>;

/**
 * Board view (founder request): columns by city or by status. Drag a card to move it; every card
 * also has a "Move to…" menu so keyboards, screen readers and touch screens can do the same.
 * Moving between cities: any verified member (FR-23). Changing status: organizers only (FR-49).
 */
export function IdeaBoard({
  tripId,
  cards,
  group,
  stops,
  size,
  canEdit,
  canMoveStatus,
}: {
  tripId: string;
  cards: CardModel[];
  group: BoardGroup;
  stops: { id: string; name: string }[];
  size: TripSize;
  canEdit: boolean;
  canMoveStatus: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  /** Optimistic moves until the server refresh lands. */
  const [moved, setMoved] = useState<Record<string, Partial<Pick<CardModel, "stopId" | "status">>>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const live = useMemo(() => cards.map((c) => ({ ...c, ...moved[c.id] })), [cards, moved]);
  const columns = boardColumns(live, group, stops, { canMoveStatus });
  const canDrag = group === "city" ? canEdit : canMoveStatus;
  const openCard = live.find((c) => c.id === openId) ?? null;

  function fail(r: { error: string; signin?: string }) {
    if (r.signin) router.push(r.signin);
    else toast({ title: r.error, variant: "error" });
  }

  function move(card: CardModel, drop: Drop, title: string) {
    const before = { stopId: card.stopId, status: card.status };
    if ("stopId" in drop ? drop.stopId === card.stopId : drop.status === card.status) return;
    setMoved((m) => ({ ...m, [card.id]: { ...m[card.id], ...drop } }));
    start(async () => {
      const r =
        "stopId" in drop
          ? await editIdeaAction(tripId, card.id, { stopId: drop.stopId })
          : await setIdeaStatusAction(tripId, card.id, drop.status);
      if (!r.ok) {
        setMoved((m) => ({ ...m, [card.id]: before }));
        return fail(r);
      }
      toast({
        title: `Moved “${card.title}” to ${title}`,
        action: {
          label: "Undo",
          onClick: () =>
            start(async () => {
              setMoved((m) => ({ ...m, [card.id]: before }));
              await ("stopId" in drop
                ? editIdeaAction(tripId, card.id, { stopId: before.stopId })
                : setIdeaStatusAction(tripId, card.id, before.status));
            }),
        },
      });
    });
  }

  function vote(card: CardModel, v: VoteValue) {
    const next = card.myVote === v ? null : v;
    start(async () => {
      const r = await voteAction(tripId, card.id, next);
      if (!r.ok) fail(r);
    });
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        <div className="flex min-w-full gap-3" role="list" aria-label="Idea board">
          {columns.map((col) => (
            <section
              key={col.key}
              role="listitem"
              aria-labelledby={`col-${col.key}`}
              onDragOver={(e) => {
                if (!dragId || !col.drop) return;
                e.preventDefault();
                setOverKey(col.key);
              }}
              onDragLeave={() => setOverKey((k) => (k === col.key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setOverKey(null);
                const card = live.find((c) => c.id === dragId);
                setDragId(null);
                if (card && col.drop) move(card, col.drop, col.title);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/40 p-2 transition-colors",
                overKey === col.key && "border-primary bg-accent/50",
              )}
            >
              <h3 id={`col-${col.key}`} className="flex items-center justify-between px-2 py-1.5 text-sm font-bold">
                {col.title}
                <span className="rounded-full bg-card px-2 text-xs font-semibold text-muted-foreground tabular-nums">
                  <span className="sr-only">, </span>
                  {col.cards.length}
                  <span className="sr-only"> {col.cards.length === 1 ? "idea" : "ideas"}</span>
                </span>
              </h3>
              <ul className="flex min-h-16 flex-col gap-2">
                {col.cards.map((card) => (
                  <li
                    key={card.id}
                    draggable={canDrag && !card.processing}
                    onDragStart={(e) => {
                      setDragId(card.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverKey(null);
                    }}
                    className={cn(
                      "rounded-xl border bg-card p-3 shadow-sm",
                      canDrag && "cursor-grab active:cursor-grabbing",
                      dragId === card.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {canDrag ? <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setOpenId(card.id)}
                          className="text-left font-semibold leading-tight hover:underline"
                        >
                          {card.processing ? "Finding the place…" : card.title}
                        </button>
                        {card.summary ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{card.summary}</p> : null}
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {card.tallyLabel ? <span className="font-semibold text-foreground">{card.tallyLabel}</span> : null}
                          {card.commentCount ? (
                            <span className="inline-flex items-center gap-0.5">
                              <MessageCircle className="size-3" aria-hidden /> {card.commentCount}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {card.notAPlace || card.processing ? null : (
                      <div role="group" aria-label={`Your vote on ${card.title}`} className="mt-2 grid grid-cols-3 gap-1">
                        {VOTES.map((v) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={card.myVote === v}
                            disabled={pending}
                            onClick={() => vote(card, v)}
                            className={cn(
                              "h-8 rounded-full border text-xs font-semibold",
                              card.myVote === v ? VOTE_ON[v] : "border-input bg-card hover:bg-muted",
                            )}
                          >
                            {voteLabel(v, size)}
                          </button>
                        ))}
                      </div>
                    )}
                    {canDrag ? (
                      <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="shrink-0">Move to</span>
                        <select
                          value={col.key}
                          onChange={(e) => {
                            const to = columns.find((c) => c.key === e.target.value);
                            if (to?.drop) move(card, to.drop, to.title);
                          }}
                          className="min-w-0 flex-1 rounded-md border border-input bg-card px-1.5 py-1 text-xs"
                        >
                          {columns
                            .filter((c) => c.drop)
                            .map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                  </li>
                ))}
                {col.cards.length === 0 ? (
                  <li className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    {col.drop && canDrag ? "Drag ideas here" : "Nothing here yet"}
                  </li>
                ) : null}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <Dialog open={!!openCard} onOpenChange={(o) => !o && setOpenId(null)} title={openCard?.title ?? "Idea"} hideTitle>
        {openCard ? <IdeaCard tripId={tripId} card={openCard} size={size} stops={stops} canEdit={canEdit} /> : null}
      </Dialog>
    </>
  );
}
