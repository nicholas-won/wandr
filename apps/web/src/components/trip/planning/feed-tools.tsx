import type { ReactNode } from "react";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { IdeaCard } from "@/server/cards";
import { shortlistSuggestions, type PlanningView } from "@/server/planning";
import { tripContext } from "@/server/context";
import { NewCityPrompt } from "./new-city";
import { ShortlistCard } from "./shortlist-card";

export interface FeedFilter {
  /** Stop id, "unsorted", or null = whole trip (FR-S9). */
  stop: string | null;
  /** FR-121 "you haven't voted" / dropped ideas. */
  only: "unvoted" | "dropped" | null;
}

/** FR-S9: lists open on the current or next Stop; `?stop=all` is the whole-trip toggle. */
export function parseFeedFilter(sp: Record<string, string | string[] | undefined>, plan: PlanningView | null): FeedFilter {
  const raw = typeof sp.stop === "string" ? sp.stop : undefined;
  const only = sp.only === "unvoted" || sp.only === "dropped" ? sp.only : null;
  if (!plan?.showStops) return { stop: raw === "unsorted" ? "unsorted" : null, only };
  if (raw === "all") return { stop: null, only };
  if (raw && (raw === "unsorted" || plan.stops.some((s) => s.id === raw))) return { stop: raw, only };
  return { stop: plan.defaultStopId, only };
}

/** Dropped ideas leave the main feed (restorable from the "Dropped" filter, P7). */
export function filterFeed(cards: IdeaCard[], f: FeedFilter): IdeaCard[] {
  return cards.filter((c) => {
    if (f.stop === "unsorted" ? c.stopId !== null : f.stop && c.stopId !== f.stop) return false;
    if (f.only === "dropped") return c.status === "dropped";
    if (c.status === "dropped") return false;
    if (f.only === "unvoted") return !c.myVote && !c.processing && !c.notAPlace;
    return true;
  });
}

function href(tripId: string, f: FeedFilter) {
  const q = new URLSearchParams();
  q.set("stop", f.stop ?? "all");
  if (f.only) q.set("only", f.only);
  return `${routes.trip(tripId)}?${q.toString()}`;
}

/** FR-121 filter chips: Stops (only once there are 2+, P2), "Not voted", "Dropped". */
export function FeedFilters({
  tripId,
  cards,
  plan,
  filter,
  showUnvoted,
}: {
  tripId: string;
  cards: IdeaCard[];
  plan: PlanningView | null;
  filter: FeedFilter;
  showUnvoted: boolean;
}) {
  const inStop = filterFeed(cards, { stop: filter.stop, only: null });
  const unvoted = inStop.filter((c) => !c.myVote && !c.processing && !c.notAPlace).length;
  const dropped = filterFeed(cards, { stop: filter.stop, only: "dropped" }).length;
  const unsorted = cards.some((c) => c.stopId === null && c.status !== "dropped");
  const stops = plan?.showStops ? plan.stops : [];
  if (!stops.length && !dropped && !(showUnvoted && unvoted) && !(filter.stop === "unsorted")) return null;

  return (
    <nav aria-label="Filter ideas" className="-mx-1 flex gap-1.5 overflow-x-auto pb-1">
      {stops.length ? (
        <>
          <Chip href={href(tripId, { stop: null, only: filter.only })} active={filter.stop === null}>
            Whole trip
          </Chip>
          {stops.map((s) => (
            <Chip key={s.id} href={href(tripId, { stop: s.id, only: filter.only })} active={filter.stop === s.id}>
              {s.name || "First stop"}
            </Chip>
          ))}
          {unsorted ? (
            <Chip href={href(tripId, { stop: "unsorted", only: filter.only })} active={filter.stop === "unsorted"}>
              Unsorted
            </Chip>
          ) : null}
          <span aria-hidden className="mx-1 w-px shrink-0 bg-border" />
        </>
      ) : filter.stop === "unsorted" ? (
        <Chip href={href(tripId, { stop: null, only: filter.only })} active={false}>
          All ideas
        </Chip>
      ) : null}
      {showUnvoted && (unvoted || filter.only === "unvoted") ? (
        <Chip
          href={href(tripId, { stop: filter.stop, only: filter.only === "unvoted" ? null : "unvoted" })}
          active={filter.only === "unvoted"}
        >
          Not voted <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{unvoted}</span>
        </Chip>
      ) : null}
      {dropped || filter.only === "dropped" ? (
        <Chip
          href={href(tripId, { stop: filter.stop, only: filter.only === "dropped" ? null : "dropped" })}
          active={filter.only === "dropped"}
        >
          Dropped ({dropped})
        </Chip>
      ) : null}
    </nav>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold",
        active ? "bg-foreground text-background" : "border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

/** Organizer prompts above the feed: "New city?" (FR-S6) and crowded-category shortlists (FR-45). */
export async function FeedPrompts({ tripId, plan }: { tripId: string; plan: PlanningView | null }) {
  if (!plan?.me.isOrganizer) return null;
  const { db, claims } = await tripContext(tripId);
  const shortlists = await shortlistSuggestions(db, claims, tripId);
  const stops = plan.stops.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }));
  if (!plan.newCities.length && !shortlists.length) return null;
  return (
    <div className="space-y-3">
      {plan.newCities.slice(0, 2).map((c) => (
        <NewCityPrompt key={c.city} tripId={tripId} city={c.city} count={c.ideaIds.length} stops={stops} />
      ))}
      {shortlists.slice(0, 2).map((s) => (
        <ShortlistCard key={`${s.stopId}-${s.category}`} tripId={tripId} s={s} showStop={plan.showStops} />
      ))}
    </div>
  );
}
