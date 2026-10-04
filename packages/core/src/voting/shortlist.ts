/**
 * Shortlist suggestions (FR-44 "the app suggests a shortlist from the ranking; organizers decide",
 * FR-45 "when a category gets crowded (about 12+ ideas), suggest the top 4–6").
 *
 * Suggestions only: changing status is an organizer action (FR-49). Nothing paid is an input
 * (§11 trust rules).
 */
import type { IdeaStatus } from "../domain";
import type { RankedIdea, RankableIdea } from "./ranking";

/** FR-45: "about 12+ ideas". */
export const CROWDED_CATEGORY_THRESHOLD = 12;
/** FR-45: "top 4–6". Default picks the middle; callers may pass 4..6. */
export const DEFAULT_SHORTLIST_SIZE = 5;

/** Statuses still in contention (dropped/done/planned ideas are not suggested or counted). */
const OPEN_STATUSES: ReadonlySet<IdeaStatus> = new Set<IdeaStatus>(["idea", "shortlisted"]);

export interface ShortlistableIdea extends RankableIdea {
  category: string;
  status: IdeaStatus;
}

/**
 * Top `n` ideas from an already-ranked list (one Stop), skipping closed ideas and ideas with no
 * eligible votes (no signal to suggest from).
 */
export function suggestShortlist<T extends ShortlistableIdea>(
  ranked: readonly RankedIdea<T>[],
  n: number = DEFAULT_SHORTLIST_SIZE,
): RankedIdea<T>[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`n must be a non-negative integer`);
  return ranked.filter((r) => OPEN_STATUSES.has(r.idea.status) && r.score.voters > 0).slice(0, n);
}

export interface CategoryShortlist<T extends ShortlistableIdea> {
  category: string;
  /** Open ideas in this category. */
  ideaCount: number;
  /** FR-45: ideaCount >= threshold. */
  crowded: boolean;
  /** Suggested top ideas; empty unless crowded. */
  suggested: RankedIdea<T>[];
}

/**
 * FR-45: per category (within one Stop's ranked list), flag crowded categories and suggest
 * their top ideas. Categories are returned in first-seen ranking order.
 */
export function crowdedCategoryShortlists<T extends ShortlistableIdea>(
  ranked: readonly RankedIdea<T>[],
  opts: { threshold?: number; n?: number } = {},
): CategoryShortlist<T>[] {
  const threshold = opts.threshold ?? CROWDED_CATEGORY_THRESHOLD;
  const groups = new Map<string, RankedIdea<T>[]>();
  for (const r of ranked) {
    if (!OPEN_STATUSES.has(r.idea.status)) continue;
    const list = groups.get(r.idea.category) ?? [];
    list.push(r);
    groups.set(r.idea.category, list);
  }
  return [...groups].map(([category, list]) => {
    const crowded = list.length >= threshold;
    return {
      category,
      ideaCount: list.length,
      crowded,
      suggested: crowded ? suggestShortlist(list, opts.n) : [],
    };
  });
}
