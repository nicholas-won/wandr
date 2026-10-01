/**
 * Idea ranking (FR-44, D41, V-7, §6.10 table).
 *
 * Group: approval % = (Must-do + Down) / voters, where voters = members who voted AND are
 * eligible (active and attending that Stop). Ties → more Must-do → earlier shared → id.
 * Duo: no percentages; both votes on the card; ideas both want rise to the top.
 * Solo: Must-do first, then Maybe.
 *
 * Nothing paid ever enters this module (§11 trust rules): inputs are votes and timestamps only.
 */
import { toMs, type Instant, type MemberId, type TripSize, type VoteValue } from "../domain";
import { voteLabel, voteView, type VoteRecord } from "./visibility";

export interface SimpleVote {
  memberId: MemberId;
  value: VoteValue;
}

export interface RankableIdea {
  id: string;
  /** When the idea was first shared (tie-break: earliest first, V-7). */
  createdAt: Instant;
  votes: readonly SimpleVote[];
  /** Members whose votes count: active and attending the idea's Stop (FR-44, FR-S7). */
  eligibleVoterIds: readonly MemberId[];
}

export interface IdeaScore {
  ideaId: string;
  /** Eligible members who voted (the denominator). Non-voters never drag an idea down. */
  voters: number;
  /** Must-do + Down. */
  inCount: number;
  must: number;
  down: number;
  pass: number;
  /** inCount / voters, or null when no one has voted. For display only; sorting uses integers. */
  approval: number | null;
}

/** FR-44: score one idea, counting only eligible voters. */
export function scoreIdea(idea: Pick<RankableIdea, "id" | "votes" | "eligibleVoterIds">): IdeaScore {
  const eligible = new Set(idea.eligibleVoterIds);
  let must = 0;
  let down = 0;
  let pass = 0;
  const seen = new Set<MemberId>();
  for (const v of idea.votes) {
    if (!eligible.has(v.memberId) || seen.has(v.memberId)) continue;
    seen.add(v.memberId);
    if (v.value === "must") must++;
    else if (v.value === "down") down++;
    else pass++;
  }
  const voters = must + down + pass;
  const inCount = must + down;
  return { ideaId: idea.id, voters, inCount, must, down, pass, approval: voters ? inCount / voters : null };
}

/**
 * Compare two scores for group ranking (negative = a ranks higher).
 * 1. approval desc (exact, via cross-multiplication; ideas with no voters rank last)
 * 2. Must-do count desc (FR-44 tie-break)
 * Caller then breaks remaining ties by createdAt asc, then id.
 */
export function compareApproval(a: IdeaScore, b: IdeaScore): number {
  if (a.voters === 0 || b.voters === 0) {
    if (a.voters === 0 && b.voters === 0) return 0;
    return a.voters === 0 ? 1 : -1;
  }
  const diff = b.inCount * a.voters - a.inCount * b.voters;
  if (diff !== 0) return diff;
  return b.must - a.must;
}

export interface RankedIdea<T extends RankableIdea = RankableIdea> {
  idea: T;
  score: IdeaScore;
  /** 1-based position. */
  rank: number;
}

type Sortable = Pick<RankableIdea, "id" | "createdAt">;

function stableTail(a: Sortable, b: Sortable): number {
  const t = toMs(a.createdAt) - toMs(b.createdAt);
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** FR-44 / D41: group ranking by approval %, then Must-do count, then earliest shared. */
export function rankIdeas<T extends RankableIdea>(ideas: readonly T[]): RankedIdea<T>[] {
  return ideas
    .map((idea) => ({ idea, score: scoreIdea(idea) }))
    .sort((a, b) => compareApproval(a.score, b.score) || stableTail(a.idea, b.idea))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * FR-44 card label, e.g. "5 of 6 are in · 2 Must-do 🔥".
 * The Must-do part is omitted when there are none. Only shown to viewers allowed to see
 * tallies (group: after they voted, FR-41).
 */
export function approvalLabel(score: IdeaScore): string {
  if (score.voters === 0) return "No votes yet";
  const base = `${score.inCount} of ${score.voters} are in`;
  return score.must > 0 ? `${base} · ${score.must} Must-do 🔥` : base;
}

// ---------------------------------------------------------------------------
// Duo (§6.10, FR-T7)
// ---------------------------------------------------------------------------

export interface DuoRankableIdea extends Omit<RankableIdea, "votes"> {
  votes: readonly VoteRecord[];
}

export interface DuoRankedIdea<T extends DuoRankableIdea = DuoRankableIdea> {
  idea: T;
  rank: number;
  /** Eligible Must-do + Down votes (both = 2). */
  inCount: number;
  must: number;
  /** e.g. "You: Must-do · Sam: Down". Only votes the viewer may see (FR-T5) are included. */
  label: string;
}

/**
 * Duo ranking for one viewer. No percentages. Order:
 * 1. number of eligible "in" votes (Must-do/Down) desc → ideas you both want rise to the top
 * 2. Must-do count desc
 * 3. earliest shared, then id.
 * Pass votes don't add to either key, so a hidden group-era Pass (FR-T5) can't change the order
 * relative to "not voted yet".
 */
export function rankIdeasDuo<T extends DuoRankableIdea>(
  viewerId: MemberId,
  ideas: readonly T[],
  names: Readonly<Record<MemberId, string>>,
): DuoRankedIdea<T>[] {
  return ideas
    .map((idea) => {
      const s = scoreIdea(idea);
      return { idea, inCount: s.inCount, must: s.must, label: duoVoteLabel(viewerId, idea, names) };
    })
    .sort((a, b) => b.inCount - a.inCount || b.must - a.must || stableTail(a.idea, b.idea))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Duo card label (§6.10 / FR-T7): "You: Must-do · Sam: Down". Votes the viewer may not see
 * (a Pass cast while the trip was a group, FR-T5) are left out exactly like "not voted yet".
 * Votes from ineligible members (not attending the Stop) are left out.
 */
export function duoVoteLabel(
  viewerId: MemberId,
  idea: Pick<DuoRankableIdea, "votes" | "eligibleVoterIds">,
  names: Readonly<Record<MemberId, string>>,
): string {
  const eligible = new Set(idea.eligibleVoterIds);
  const votes = idea.votes.filter((v) => eligible.has(v.memberId));
  const view = voteView({ viewerId, size: "duo", votes });
  if (view.mode !== "duo") return "";
  const parts: string[] = [];
  if (view.own) parts.push(`You: ${voteLabel(view.own, "duo")}`);
  for (const n of view.named) parts.push(`${names[n.memberId] ?? "Them"}: ${voteLabel(n.value, "duo")}`);
  return parts.length ? parts.join(" · ") : "No votes yet";
}

// ---------------------------------------------------------------------------
// Solo (§6.10, D55)
// ---------------------------------------------------------------------------

const SOLO_TIER: Record<VoteValue | "none", number> = { must: 0, down: 1, none: 2, pass: 3 };

/**
 * Solo ranking: Must-do first, then Maybe (§6.10). Un-prioritized ideas follow, Skip last.
 * Within a tier: earliest shared first.
 */
export function rankIdeasSolo<T extends Pick<RankableIdea, "id" | "createdAt" | "votes">>(
  ownerId: MemberId,
  ideas: readonly T[],
): { idea: T; rank: number; priority: VoteValue | null; label: string | null }[] {
  return ideas
    .map((idea) => {
      const priority = idea.votes.find((v) => v.memberId === ownerId)?.value ?? null;
      return { idea, priority, label: priority ? voteLabel(priority, "solo") : null };
    })
    .sort(
      (a, b) =>
        SOLO_TIER[a.priority ?? "none"] - SOLO_TIER[b.priority ?? "none"] ||
        stableTail(a.idea, b.idea),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Which ranking applies at a size (FR-T1). */
export function rankingMode(size: TripSize): "personal" | "duo" | "approval" {
  return size === "solo" ? "personal" : size === "duo" ? "duo" : "approval";
}
