"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { ExternalLink, MapPin, Pencil } from "lucide-react";
import { voteLabel, type TripSize, type VoteValue } from "@wandr/core";
import { IdeaComments } from "@/components/ideas/comment-thread";
import { IdeaVisual } from "@/components/ideas/idea-visual";
import { SaveForNextTime } from "@/components/library/save-for-next-time";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fixIdeaAction, pickListicleAction, pickPlaceAction, searchPlacesAction, voteAction } from "@/app/t/[tripId]/actions";
import { PlacePicker } from "@/components/ideas/place-picker";
import { IdeaEditor } from "./idea-editor";
import { routes } from "@/lib/routes";
import type { IdeaCard as Card_ } from "@/server/cards";

const VOTES: VoteValue[] = ["must", "down", "pass"];
const VOTE_STYLE: Record<VoteValue, string> = {
  must: "bg-vote-must text-vote-foreground border-vote-must",
  down: "bg-vote-down text-vote-foreground border-vote-down",
  pass: "bg-vote-pass text-vote-foreground border-vote-pass",
};
const VOTE_EMOJI: Record<VoteValue, string> = { must: "🔥", down: "👍", pass: "🙅" };

export function IdeaCard({
  tripId,
  card,
  size,
  canEdit = true,
  extra,
  stops = [],
}: {
  tripId: string;
  card: Card_;
  size: TripSize;
  /** The trip's cities, for "move to another city" in the editor. */
  stops?: { id: string; name: string }[];
  /** Verified member (FR-5): may fix the place. Personal-link sessions are sent to sign in. */
  canEdit?: boolean;
  /** Optional footer (status, "Not my pick, but I'm in"; FR-49/50). */
  extra?: ReactNode;
}) {
  const candidates = card.listicle;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [myVote, setOptimistic] = useOptimistic(card.myVote);
  const [editing, setEditing] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);

  /** FR-23 "wrong place? fix": needs a verified number (FR-5). */
  function startFix() {
    if (!canEdit) router.push(routes.signin(routes.trip(tripId)));
    else setEditing(true);
  }

  function vote(v: VoteValue) {
    const next = myVote === v ? null : v;
    const prev = myVote;
    start(async () => {
      setOptimistic(next);
      const r = await voteAction(tripId, card.id, next);
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
        return;
      }
      // P7: undo on every action.
      toast({
        title: next ? `Voted ${voteLabel(next, size)}` : "Vote cleared",
        action: {
          label: "Undo",
          onClick: () => start(async () => void (await voteAction(tripId, card.id, prev))),
        },
      });
    });
  }

  if (card.processing) {
    return (
      <Card className="p-4" aria-busy>
        <div className="flex gap-3">
          <Skeleton className="size-16 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Finding the place…</p>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <IdeaVisual
        title={card.title}
        category={card.category}
        photo={card.photo}
        photoPrime={card.photoPrime}
        thumbnailUrl={card.thumbnailUrl}
      />
      <div className="p-4">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg font-bold leading-tight">{card.title}</h3>
            {card.rank && size !== "solo" ? (
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">#{card.rank}</span>
            ) : null}
          </div>
          {card.locationLabel ? (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate">
                <span className="sr-only">Filed under </span>
                {card.locationLabel}
              </span>
            </p>
          ) : null}
          {card.blurb ? <p className="mt-2 line-clamp-3 text-sm leading-snug">{card.blurb}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {card.permanentlyClosed ? <Badge variant="pass">Permanently closed</Badge> : null}
            {card.splitOpinions ? <Badge variant="accent">{card.splitOpinions}</Badge> : null}
            {card.sourceUrl ? (
              <a
                href={`/r/${card.id}?t=${tripId}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {card.creatorHandle ?? (card.sourceKind === "text" ? "note" : "source")}
              </a>
            ) : null}
            {card.sharedBy.length ? (
              <span className="text-muted-foreground">· shared by {card.sharedBy.join(", ")}</span>
            ) : null}
            {!editing && !editingDetails ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => (canEdit ? setEditingDetails(true) : router.push(routes.signin(routes.trip(tripId))))}
              >
                · <Pencil className="size-3" aria-hidden /> Edit
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {editingDetails ? (
        <div className="border-t bg-muted/40 px-4 py-3">
          <IdeaEditor
            tripId={tripId}
            idea={{ id: card.id, title: card.title, category: card.category, stopId: card.stopId }}
            stops={stops}
            onDone={(message) => {
              setEditingDetails(false);
              if (message) toast({ title: message });
            }}
            onWrongPlace={
              card.notAPlace
                ? undefined
                : () => {
                    setEditingDetails(false);
                    setEditing(true);
                  }
            }
            onError={(r) => (r.signin ? router.push(r.signin) : toast({ title: r.error, variant: "error" }))}
          />
        </div>
      ) : null}

      {card.needsReview && !editing ? (
        <div className="flex items-center justify-between gap-2 border-t bg-accent/60 px-4 py-2 text-sm text-accent-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden /> Is this the right place?
          </span>
          <button className="inline-flex items-center gap-1 font-semibold" onClick={startFix}>
            <Pencil className="size-3.5" aria-hidden /> Fix
          </button>
        </div>
      ) : null}

      {editing ? (
        <div className="border-t bg-accent/30 px-4 py-3">
          <p className="mb-2 text-sm font-semibold">Find the right place</p>
          <PlacePicker
            search={(q) => searchPlacesAction(tripId, q, card.id)}
            initialQuery={card.needsReview ? "" : card.title}
            onPick={async (placeId) => {
              const r = await pickPlaceAction(tripId, card.id, placeId);
              if (r.ok) {
                setEditing(false);
                toast({ title: "Place updated" });
              }
              return r;
            }}
            rename={{
              defaultValue: card.title,
              onRename: async (title) => {
                const r = await fixIdeaAction(tripId, card.id, title);
                if (r.ok) setEditing(false);
                return r;
              },
            }}
            onCancel={() => setEditing(false)}
            onError={(r) => (r.signin ? router.push(r.signin) : toast({ title: r.error, variant: "error" }))}
          />
        </div>
      ) : null}

      {candidates && candidates.length > 1 ? (
        <ListiclePicker tripId={tripId} ideaId={card.id} candidates={candidates} />
      ) : null}

      {card.notAPlace ? null : (
        <div className="border-t px-4 py-3">
          <div role="group" aria-label="Your vote" className="grid grid-cols-3 gap-2">
            {VOTES.map((v) => {
              const on = myVote === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  disabled={pending}
                  onClick={() => vote(v)}
                  className={cn(
                    "h-11 rounded-full border text-sm font-semibold transition active:scale-[0.97]",
                    on ? VOTE_STYLE[v] : "border-input bg-card hover:bg-muted",
                  )}
                >
                  <span aria-hidden>{VOTE_EMOJI[v]} </span>
                  {voteLabel(v, size)}
                </button>
              );
            })}
          </div>
          <VoteSummary card={card} size={size} />
        </div>
      )}
      <div className="border-t px-4 py-1.5">
        <IdeaComments
          tripId={tripId}
          ideaId={card.id}
          ideaTitle={card.title}
          count={card.commentCount}
          aside={card.notAPlace ? null : <SaveForNextTime tripId={tripId} ideaId={card.id} />}
        />
      </div>
      {extra}
    </Card>
  );
}

function VoteSummary({ card, size }: { card: Card_; size: TripSize }) {
  if (size === "solo") return null;
  if (size === "group" && !card.myVote) {
    return <p className="mt-2 text-xs text-muted-foreground">Vote to see what the group thinks.</p>;
  }
  const names = card.namedVotes.map((v) => `${v.name}: ${v.label}`).join(" · ");
  if (!card.tallyLabel && !names) return null;
  return (
    <p className="mt-2 text-sm">
      {card.tallyLabel ? <span className="font-semibold">{card.tallyLabel}</span> : null}
      {card.tallyLabel && names ? <span className="text-muted-foreground"> — </span> : null}
      {names ? <span className="text-muted-foreground">{names}</span> : null}
    </p>
  );
}

/** FR-24 / D26: "This video mentions 5 places. Add all, or pick which?" */
function ListiclePicker({
  tripId,
  ideaId,
  candidates,
}: {
  tripId: string;
  ideaId: string;
  candidates: { name: string; summary: string }[];
}) {
  const [picked, setPicked] = useState<number[]>(candidates.map((_, i) => i));
  const [pending, start] = useTransition();
  return (
    <div className="border-t px-4 py-3">
      <p className="text-sm font-semibold">This mentions {candidates.length} places. Add all, or pick which?</p>
      <ul className="mt-2 space-y-1">
        {candidates.map((c, i) => (
          <li key={i}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(i)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i] : p.filter((x) => x !== i)))}
                className="size-4 accent-[var(--primary)]"
              />
              {c.name}
            </label>
          </li>
        ))}
      </ul>
      <button
        disabled={pending}
        onClick={() => start(async () => void (await pickListicleAction(tripId, ideaId, picked)))}
        className="mt-2 text-sm font-semibold text-primary"
      >
        {picked.length === candidates.length ? "Add all" : `Add ${picked.length}`}
      </button>
    </div>
  );
}
