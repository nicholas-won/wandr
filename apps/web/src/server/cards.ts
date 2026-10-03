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
import { cardBlurb, cardPhoto, locationLabel, readCache, sourceThumb, type CardVisualFields } from "@/lib/idea-visual";

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
  createdByMemberId: string | null;
  candidates: unknown;
  /** Short-lived Google display cache (FR-31); only read for the card visual. */
  placeCache?: unknown;
  placeCachedAt?: Date | null;
  /** Surprise mode (FR-91). Hidden members never receive the row, so this is safe to show. */
  hiddenFrom: string[];
}

export interface SourceRow {
  /** Row id: addresses an uploaded screenshot (FR-20). */
  id?: string;
  ideaId: string;
  kind: string;
  /** Private screenshot object, served by /api/screenshot after an RLS check. */
  storagePath?: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  /** Untrusted source text; only its sanitized first line is shown (C-21). */
  caption?: string | null;
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

export interface IdeaCard extends CardVisualFields {
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
  /** FR-24: listicle places, shown only to the person who shared it. */
  listicle: { name: string; summary: string }[] | null;
  /** FR-91: who this idea is hidden from (e.g. the guest of honor). */
  hiddenFrom: string[];
  /** FR-46: live comments the viewer can see (RLS-filtered count). */
  commentCount: number;
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
  /** Stop names by id, for the "Filed under" line. */
  stopNames?: Map<string, string>;
  /** Visible comment counts by idea (FR-46). */
  commentCounts?: Map<string, number>;
  /** A Places key is configured (place photos available). */
  photosEnabled?: boolean;
  now?: Date;
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
    const cache = readCache(idea.placeCache);
    const caption = srcs.find((s) => s.kind !== "text" && s.caption)?.caption ?? null;
    const blurb = cardBlurb(idea.summary, caption);
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
      thumbnailUrl: sourceThumb("idea", srcs),
      ...cardPhoto({
        kind: "idea",
        id: idea.id,
        placeId: idea.placeId,
        placeCache: idea.placeCache,
        placeCachedAt: idea.placeCachedAt ?? null,
        enabled: !!args.photosEnabled,
        now: args.now,
      }),
      locationLabel:
        idea.extraction === "not_a_place"
          ? null
          : locationLabel({
              neighborhood: cache.neighborhood,
              city: idea.cityHint ?? cache.locality,
              stop: idea.stopId ? (args.stopNames?.get(idea.stopId) ?? null) : null,
              category: idea.category,
            }),
      blurb: blurb && blurb.toLocaleLowerCase() !== idea.title.toLocaleLowerCase() ? blurb : null,
      commentCount: args.commentCounts?.get(idea.id) ?? 0,
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
      listicle:
        idea.createdByMemberId === viewerMemberId && Array.isArray(idea.candidates)
          ? (idea.candidates as { name: string; summary?: string }[]).map((c) => ({
              name: c.name,
              summary: c.summary ?? "",
            }))
          : null,
      hiddenFrom: idea.hiddenFrom ?? [],
      _score: score,
      _createdAt: idea.createdAt,
    };
    return card;
  });

  const ordered = orderCards(size, viewerMemberId, cards);
  return ordered.map((c) => {
    const out: Partial<Internal> = { ...c };
    delete out._score;
    delete out._createdAt;
    return out as IdeaCard;
  });
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
