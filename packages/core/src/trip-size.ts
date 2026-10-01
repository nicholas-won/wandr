/**
 * Trip size: solo / duo / group (REQUIREMENTS.md §6.10, FR-T1..T6).
 */
import type { MemberId, MemberStatus, TripSize } from "./domain";

/**
 * FR-T1: size is derived from the number of **active** members, counting managed members
 * (FR-11; a managed member is an ordinary `active` row with `managedByMemberId` set).
 * 0 or 1 → solo, 2 → duo, 3+ → group.
 */
export function tripSize(activeMemberCount: number): TripSize {
  if (!Number.isInteger(activeMemberCount) || activeMemberCount < 0) {
    throw new RangeError(`activeMemberCount must be a non-negative integer, got ${activeMemberCount}`);
  }
  if (activeMemberCount <= 1) return "solo";
  if (activeMemberCount === 2) return "duo";
  return "group";
}

/**
 * Whether a member with this status counts toward trip size (FR-T1).
 * Only `active` counts. invited/pending have not joined; removed has left.
 * `not_attending` (M-9 drop-out) does NOT count — see open question in the report.
 */
export function countsTowardSize(status: MemberStatus): boolean {
  return status === "active";
}

/** FR-T1 convenience: size from a member list. */
export function tripSizeOf(members: readonly { status: MemberStatus }[]): TripSize {
  return tripSize(members.filter((m) => countsTowardSize(m.status)).length);
}

/** Ids of members counting toward size, in input order. */
export function activeMemberIds(
  members: readonly { memberId: MemberId; status: MemberStatus }[],
): MemberId[] {
  return members.filter((m) => countsTowardSize(m.status)).map((m) => m.memberId);
}

/**
 * One-time notice ids. Persisted in `members.notices_seen` so each shows once per member.
 * - `solo_to_duo`: FR-T3, shown to the owner before a second person joins:
 *   "In 2-person trips, you'll see each other's votes."
 * - `duo_votes_visible`: FR-T6, shown before a member casts their first duo vote.
 * - `duo_to_group`: FR-T4, voting switches to blind for votes cast from now on.
 * - `group_to_duo`: FR-T5, earlier group votes stay anonymous; new votes follow duo rules.
 */
export type SizeNoticeId = "solo_to_duo" | "duo_votes_visible" | "duo_to_group" | "group_to_duo";

export type NoticeAudience =
  /** The trip owner only. */
  | "owner"
  /** Every active member who was in the trip before the change. */
  | "existing_members";

export interface SizeNotice {
  id: SizeNoticeId;
  audience: NoticeAudience;
  /** Requirement that mandates it. */
  fr: "FR-T3" | "FR-T4" | "FR-T5" | "FR-T6";
}

/**
 * FR-T3: notice the owner must see before the trip goes from solo to 2+ people
 * (call this when the owner is about to invite / approve the second person).
 * Returns null if not applicable or already seen.
 */
export function noticeBeforeGrowingFromSolo(
  currentSize: TripSize,
  ownerNoticesSeen: readonly string[],
): SizeNotice | null {
  if (currentSize !== "solo") return null;
  if (ownerNoticesSeen.includes("solo_to_duo")) return null;
  return { id: "solo_to_duo", audience: "owner", fr: "FR-T3" };
}

/**
 * Notices raised by a size change (FR-T4, FR-T5). Pure function of the transition.
 * - duo → group: `duo_to_group` to the existing members (FR-T4).
 * - group → duo: `group_to_duo` to the remaining members (FR-T5 "after a one-time notice").
 * - solo → duo: none here; FR-T3 is shown *before* the join (see noticeBeforeGrowingFromSolo),
 *   and FR-T6 is shown before the first duo vote (see noticeBeforeVote).
 * - any other transition (incl. solo ↔ group, → solo): none specified.
 */
export function transitionNotices(from: TripSize, to: TripSize): SizeNotice[] {
  if (from === to) return [];
  if (from === "duo" && to === "group") {
    return [{ id: "duo_to_group", audience: "existing_members", fr: "FR-T4" }];
  }
  if (from === "group" && to === "duo") {
    return [{ id: "group_to_duo", audience: "existing_members", fr: "FR-T5" }];
  }
  return [];
}

/**
 * FR-T6 / FR-T5: notice a member must see before casting a vote at the current size.
 * In a duo, before the member's first duo vote: `duo_votes_visible`.
 * (If the trip shrank from a group and `group_to_duo` hasn't been seen, that one goes first.)
 */
export function noticeBeforeVote(
  currentSize: TripSize,
  memberNoticesSeen: readonly string[],
  opts: { shrankFromGroup?: boolean } = {},
): SizeNotice | null {
  if (currentSize !== "duo") return null;
  if (opts.shrankFromGroup && !memberNoticesSeen.includes("group_to_duo")) {
    return { id: "group_to_duo", audience: "existing_members", fr: "FR-T5" };
  }
  if (!memberNoticesSeen.includes("duo_votes_visible")) {
    return { id: "duo_votes_visible", audience: "existing_members", fr: "FR-T6" };
  }
  return null;
}
