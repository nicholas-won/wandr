/**
 * Vote display helpers (FR-40–44, §6.10). Labels come from @wandr/core so web and app say the same
 * thing. Privacy is the server's job: we only render what the API returned (tallyLabel is null
 * while blind, namedVotes never contains a group Pass), and never infer anything from absences.
 */
import type { IdeaCard, TripDetail, TripSize, VoteValue } from "@wandr/api-contract";
import { voteLabel } from "@wandr/core/voting";

export const VOTE_ORDER: readonly VoteValue[] = ["must", "down", "pass"];

export interface VoteButtonModel {
  value: VoteValue;
  label: string;
  selected: boolean;
  accessibilityLabel: string;
  accessibilityHint: string;
}

export function voteButtons(size: TripSize, myVote: VoteValue | null, ideaTitle: string): VoteButtonModel[] {
  return VOTE_ORDER.map((value) => {
    const label = voteLabel(value, size);
    const selected = myVote === value;
    return {
      value,
      label,
      selected,
      accessibilityLabel: `${label}: ${ideaTitle}`,
      accessibilityHint: selected ? "Your vote. Tap again to clear it." : `Vote ${label}`,
    };
  });
}

/** Tapping your current vote again clears it (P7 forgiving); otherwise it becomes the new vote. */
export function nextVote(current: VoteValue | null, tapped: VoteValue): VoteValue | null {
  return current === tapped ? null : tapped;
}

/**
 * The line under the buttons:
 * - solo: nothing (votes are personal priority, no reveal).
 * - duo: "You: Must-do · Sam: Down" (open from the start, FR-T7).
 * - group: the tally once you've voted ("5 of 6 are in · 2 Must-do 🔥"), else a blind hint.
 */
export function voteSummary(idea: IdeaCard, size: TripSize): string | null {
  if (size === "solo") return null;
  if (size === "duo") {
    if (idea.namedVotes.length === 0) return null;
    const ordered = [...idea.namedVotes].sort((a, b) => Number(b.isMe) - Number(a.isMe));
    return ordered.map((v) => `${v.isMe ? "You" : v.name}: ${v.label}`).join(" · ");
  }
  if (!idea.myVote) return "Vote to see how the group voted";
  return idea.tallyLabel;
}

/** Group: names of Must-do / Down voters ("Must-do: You, Sam · Down: Ana"). Pass is a count only (FR-42). */
export function groupNames(idea: IdeaCard, size: TripSize): string | null {
  if (size !== "group" || !idea.myVote || idea.namedVotes.length === 0) return null;
  const byLabel = new Map<string, string[]>();
  for (const v of idea.namedVotes) {
    const list = byLabel.get(v.label) ?? [];
    list.push(v.isMe ? "You" : v.name);
    byLabel.set(v.label, list);
  }
  return [...byLabel.entries()].map(([label, names]) => `${label}: ${names.join(", ")}`).join(" · ");
}

/** FR-T6: in a duo, say plainly that the other person sees your vote. */
export function duoNotice(trip: Pick<TripDetail, "size" | "members" | "me">): string | null {
  if (trip.size !== "duo") return null;
  const other = trip.members.find((m) => m.id !== trip.me.memberId);
  return other ? `${other.displayName} sees your votes, and you see theirs.` : null;
}

/** Optimistic local update after a tap; the refetch fills in tallies and names from the server. */
export function withMyVote(idea: IdeaCard, value: VoteValue | null, size: TripSize, myName: string): IdeaCard {
  let namedVotes = idea.namedVotes.filter((v) => !v.isMe);
  if (value && (size === "duo" || (size === "group" && value !== "pass"))) {
    namedVotes = [{ name: myName, label: voteLabel(value, size), isMe: true }, ...namedVotes];
  }
  return { ...idea, myVote: value, namedVotes: size === "solo" ? [] : namedVotes };
}

/** Header subtitle for the trip ("Just you", "You and Sam", "4 people"). */
export function sizeLine(trip: Pick<TripDetail, "size" | "members" | "me">): string {
  if (trip.size === "solo") return "Just you";
  if (trip.size === "duo") {
    const other = trip.members.find((m) => m.id !== trip.me.memberId);
    return other ? `You and ${other.displayName}` : "Two of you";
  }
  return `${trip.members.length} people`;
}
