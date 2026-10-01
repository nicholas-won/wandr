/**
 * Vote visibility reference model (FR-40..43, FR-T3..T6, D3, D55, D56).
 *
 * This is the **spec** for what one member may see about the votes on one idea.
 * The database enforces the same rules in SQL (RLS / security-definer views); keep both in sync.
 *
 * Inputs are assumed to already exclude:
 * - votes from removed members (V-10), and
 * - ideas hidden from the viewer by surprise mode (FR-91) — those never reach this function.
 */
import type { MemberId, TripSize, VoteValue } from "../domain";

export interface VoteRecord {
  memberId: MemberId;
  value: VoteValue;
  /** Trip size when the vote was last cast/changed (votes.cast_in_size). */
  castInSize: TripSize;
  /** Members who may see this vote individually even if it is a Pass (votes.open_to). */
  openTo: readonly MemberId[];
}

export interface VoteTally {
  must: number;
  down: number;
  pass: number;
}

export interface NamedVote {
  memberId: MemberId;
  value: VoteValue;
}

export type VoteView =
  /** Solo (D55): the viewer's own personal priority only. No tallies, no reveal. */
  | { mode: "solo"; own: VoteValue | null }
  /** Group, viewer hasn't voted yet (FR-41): nothing — no counts, no names, not even "n voted". */
  | { mode: "blind"; own: null }
  /**
   * Group after voting (FR-42), or duo (FR-T4..T6, D56).
   * `tally` counts every vote that is visible as a count (own vote included).
   * `named` lists *other* members' votes the viewer may see individually.
   * Non-voters are never listed anywhere (FR-42).
   */
  | { mode: "group" | "duo"; own: VoteValue | null; tally: VoteTally; named: NamedVote[] };

export interface VoteViewInput {
  viewerId: MemberId;
  /** Current trip size (FR-T1: privacy rules follow the current size). */
  size: TripSize;
  /** All votes on this idea. */
  votes: readonly VoteRecord[];
}

/** UI labels. Solo shows the same buttons as Must-do / Maybe / Skip (D55). */
export function voteLabel(value: VoteValue, size: TripSize): string {
  if (size === "solo") return value === "must" ? "Must-do" : value === "down" ? "Maybe" : "Skip";
  return value === "must" ? "Must-do" : value === "down" ? "Down" : "Pass";
}

/**
 * `open_to` for a newly cast (or changed) vote.
 * - duo → both active members (the vote, including a Pass, is visible to the pair forever, FR-T4).
 * - solo / group → [] (no one may see it individually as a Pass).
 * Note FR-T3 solo→duo carry-over is handled by `openSoloVotesToDuo`.
 */
export function computeOpenTo(size: TripSize, activeMemberIds: readonly MemberId[]): MemberId[] {
  if (size !== "duo") return [];
  if (activeMemberIds.length !== 2) {
    throw new RangeError(`duo trip must have exactly 2 active members, got ${activeMemberIds.length}`);
  }
  return [...activeMemberIds];
}

/**
 * FR-T3: when a solo trip becomes a duo, "solo priorities carry over as that person's votes".
 * The owner was told beforehand that duo votes are visible to each other, so the carried-over
 * votes are opened to the new pair. Votes cast in a *group* are never re-opened (FR-T5).
 * Returns a new array; votes not cast in solo are returned unchanged.
 */
export function openSoloVotesToDuo(
  votes: readonly VoteRecord[],
  duoMemberIds: readonly MemberId[],
): VoteRecord[] {
  const openTo = computeOpenTo("duo", duoMemberIds);
  return votes.map((v) => (v.castInSize === "solo" ? { ...v, openTo } : v));
}

function emptyTally(): VoteTally {
  return { must: 0, down: 0, pass: 0 };
}

/**
 * What `viewerId` may see about the votes on one idea.
 *
 * SOLO: own vote only.
 * GROUP (blind, FR-41/42):
 *   - viewer hasn't voted → `blind` (nothing at all).
 *   - viewer has voted → counts of must/down/pass; names of Must-do and Down voters;
 *     a Pass is named only if the viewer is in that vote's `openTo` (the original duo pair
 *     after a duo → group change, FR-T4). Newcomers therefore see earlier duo Passes as counts only.
 * DUO (open from the start, D56):
 *   - no blind gate.
 *   - Must-do / Down: counted and named.
 *   - Pass: counted and named only if viewer ∈ openTo. A Pass not open to the viewer (cast while
 *     the trip was a group) is excluded from the counts entirely (FR-T5), so it can't be inferred.
 * The viewer's own vote is always visible to them and always counted.
 */
export function voteView(input: VoteViewInput): VoteView {
  const { viewerId, size, votes } = input;
  const ownVote = votes.find((v) => v.memberId === viewerId);
  const own = ownVote?.value ?? null;

  if (size === "solo") return { mode: "solo", own };
  if (size === "group" && !ownVote) return { mode: "blind", own: null };

  const tally = emptyTally();
  const named: NamedVote[] = [];

  for (const v of votes) {
    if (v.memberId === viewerId) {
      tally[v.value] += 1;
      continue;
    }
    const passOpen = v.openTo.includes(viewerId);
    if (v.value === "pass") {
      if (passOpen) {
        tally.pass += 1;
        named.push({ memberId: v.memberId, value: v.value });
      } else if (size === "group") {
        tally.pass += 1; // count only (FR-42)
      }
      // duo + not open: excluded entirely (FR-T5)
      continue;
    }
    tally[v.value] += 1;
    named.push({ memberId: v.memberId, value: v.value });
  }

  return { mode: size, own, tally, named };
}

/**
 * FR-42: organizers see turnout as a number only. Members see nothing about turnout
 * (only the person themselves gets a private nudge). Returns null for non-organizers.
 */
export function organizerTurnout(
  viewerRole: "owner" | "organizer" | "member",
  votedCount: number,
  eligibleCount: number,
): { voted: number; eligible: number } | null {
  if (viewerRole === "member") return null;
  return { voted: votedCount, eligible: eligibleCount };
}
