/**
 * Pure view-model builder for the ideas feed (FR-41/42/44/44a, FR-121, §6.10).
 * Input is what the DB is allowed to reveal to this viewer (app.idea_reveals), so nothing
 * here can leak more than RLS already permits.
 */
import {
  approvalLabel,
  compareApproval,
  isSplitOpinions,
  SPLIT_OPINIONS_LABEL,
  shuffleForViewer,
  voteLabel,
  type IdeaScore,
  type TripSize,
  type VoteValue,
} from "@wandr/core";

export interface IdeaRow {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  status: string;
  extraction: string;
  confidence: number | null;
  stopId: string | null;
  cityHint: string | null;
  permanentlyClosed: boolean;
  createdAt: Date;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SourceRow {
  ideaId: string;
  kind: string;
  url: string | null;
  thumbnailUrl: string | null;
  creatorHandle: string | null;
  sharedByMemberId: string | null;
  createdAt: Date;
}

export interface RevealRow {
  ideaId: string;
  viewerVoted: boolean;
  mustCount: number | null;
  downCount: number | null;
  passCount: number | null;
  voterCount: number | null;
  voters: { member_id: string; display_name: string; value: VoteValue }[] | null;
}

export interface IdeaCard {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  status: string;
  stopId: string | null;
  processing: boolean;
  /** FR-23: low confidence → "Is this right?" */
  needsReview: boolean;
  notAPlace: boolean;
  permanentlyClosed: boolean;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  sourceKind: string | null;
  creatorHandle: string | null;
  sharedBy: string[];
  myVote: VoteValue | null;
  /** Null while blind. */
  tallyLabel: string | null;
  /** Names the viewer may see, e.g. "Sam: Must-do". */
  namedVotes: { name: string; label: string; isMe: boolean }[];
  splitOpinions: string | null;
  rank: number | null;
}

export const REVIEW_THRESHOLD = 0.6;

export function buildIdeaCards(args: {
  size: TripSize;
  viewerMemberId: string;
  ideas: IdeaRow[];
  sources: SourceRow[];
  reveals: RevealRow[];
  myVotes: Map<string, VoteValue>;
  memberNames: Map<string, string>;
}): IdeaCard[] {
  const { size, viewerMemberId, ideas, sources, reveals, myVotes, memberNames } = args;
  const revealById = new Map(reveals.map((r) => [r.ideaId, r]));
  const sourcesById = new Map<string, SourceRow[]>();
  for (const s of [...sources].sort((a, b) => +a.createdAt - +b.createdAt)) {
    const list = sourcesById.get(s.ideaId) ?? [];
    list.push(s);
    sourcesById.set(s.ideaId, list);
  }

  const cards = ideas.map((idea) => {
    const r = revealById.get(idea.id);
    const srcs = sourcesById.get(idea.id) ?? [];
    const first = srcs[0];
    const myVote = myVotes.get(idea.id) ?? null;
    const score: IdeaScore | null =
      r && r.voterCount !== null
        ? {
            ideaId: idea.id,
            voters: r.voterCount,
            inCount: (r.mustCount ?? 0) + (r.downCount ?? 0),
            must: r.mustCount ?? 0,
            down: r.downCount ?? 0,
            pass: r.passCount ?? 0,
            approval: r.voterCount ? ((r.mustCount ?? 0) + (r.downCount ?? 0)) / r.voterCount : null,
          }
        : null;
    const namedVotes =
      size === "solo"
        ? []
        : (r?.voters ?? [])
            .map((v) => ({
              name: v.member_id === viewerMemberId ? "You" : v.display_name,
              label: voteLabel(v.value, size),
              isMe: v.member_id === viewerMemberId,
            }))
            .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
    const card: IdeaCard & { _score: IdeaScore | null; _createdAt: Date } = {
      id: idea.id,
      title: idea.title,
      category: idea.category,
      summary: idea.summary,
      status: idea.status,
      stopId: idea.stopId,
      processing: idea.extraction === "processing" || idea.extraction === "queued",
      needsReview:
        idea.extraction === "needs_review" ||
        (idea.extraction === "resolved" && (idea.confidence ?? 1) < REVIEW_THRESHOLD),
      notAPlace: idea.extraction === "not_a_place",
      permanentlyClosed: idea.permanentlyClosed,
      thumbnailUrl: first?.thumbnailUrl ?? null,
      sourceUrl: first?.url ?? null,
      sourceKind: first?.kind ?? null,
      creatorHandle: first?.creatorHandle ?? null,
      sharedBy: unique(
        srcs.map((s) =>
          s.sharedByMemberId === viewerMemberId
            ? "You"
            : (memberNames.get(s.sharedByMemberId ?? "") ?? "Former member"),
        ),
      ),
      myVote,
      tallyLabel:
        size === "group" && score ? approvalLabel(score) : null,
      namedVotes,
      splitOpinions: score && isSplitOpinions(score, size) ? SPLIT_OPINIONS_LABEL : null,
      rank: null,
      _score: score,
      _createdAt: idea.createdAt,
    };
    return card;
  });

  const ordered = orderCards(size, viewerMemberId, cards);
  return ordered.map(({ _score, _createdAt, ...c }) => c);
}

type Internal = IdeaCard & { _score: IdeaScore | null; _createdAt: Date };

/**
 * Group: un-voted cards first, in a per-viewer shuffle (FR-41); then voted cards by approval
 * (FR-44). Duo: both-want first. Solo: Must-do, Maybe, none, Skip.
 */
function orderCards(size: TripSize, viewerId: string, cards: Internal[]): Internal[] {
  const tail = (a: Internal, b: Internal) => +a._createdAt - +b._createdAt || (a.id < b.id ? -1 : 1);
  if (size === "solo") {
    const tier = { must: 0, down: 1, none: 2, pass: 3 } as const;
    return [...cards]
      .sort((a, b) => tier[a.myVote ?? "none"] - tier[b.myVote ?? "none"] || tail(a, b))
      .map((c, i) => ({ ...c, rank: i + 1 }));
  }
  if (size === "duo") {
    const inCount = (c: Internal) => (c._score ? c._score.inCount : 0);
    const must = (c: Internal) => (c._score ? c._score.must : 0);
    return [...cards]
      .sort((a, b) => inCount(b) - inCount(a) || must(b) - must(a) || tail(a, b))
      .map((c, i) => ({ ...c, rank: c._score?.voters ? i + 1 : null }));
  }
  const unvoted = shuffleForViewer(
    viewerId,
    cards.filter((c) => !c.myVote),
  );
  const voted = cards
    .filter((c) => c.myVote)
    .sort((a, b) => compareApproval(a._score ?? EMPTY, b._score ?? EMPTY) || tail(a, b))
    .map((c, i) => ({ ...c, rank: i + 1 }));
  return [...unvoted, ...voted];
}

const EMPTY: IdeaScore = { ideaId: "", voters: 0, inCount: 0, must: 0, down: 0, pass: 0, approval: null };

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
