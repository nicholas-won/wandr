/**
 * Personal-link onboarding (FR-4, FR-5, Q1, Q37). Pure functions.
 *
 * - Q37: opening an invite link never joins by itself. The invitee sees a trip preview and taps
 *   "Accept invitation" (or "Not me"); accepting makes them active.
 * - Q1: on first open the person confirms their name ("You're Sam?", editable). A personal link
 *   stays view + vote only; after a little activity they're asked, kindly, to confirm their
 *   number to unlock adding ideas, comments and the rest. Dismissible; back at most once a day.
 */
import { toMs, type Instant, type MemberStatus } from "./domain";

const DAY = 24 * 60 * 60 * 1000;

export type LinkOpenStep =
  /** Invited, not yet a member: trip preview + "Accept invitation" / "Not me" (Q37). */
  | "accept_invite"
  /** Already a member, first open of this link: "You're Sam?" with an edit option (Q1). */
  | "confirm_name"
  /** Straight into the trip. */
  | "open"
  | "not_available";

/** What the person sees after the (POST-only) open of their personal link. */
export function linkOpenStep(m: { memberStatus: MemberStatus; nameConfirmedAt: Instant | null }): LinkOpenStep {
  switch (m.memberStatus) {
    case "invited":
      return "accept_invite";
    case "active":
    case "not_attending":
      return m.nameConfirmedAt == null ? "confirm_name" : "open";
    default:
      return "not_available";
  }
}

export const PHONE_PROMPT = {
  /** Votes a personal-link guest casts before the first prompt (Q1: "after their first 2–3"). */
  afterVotes: 2,
  /** A dismissed prompt comes back at most once per day. */
  snoozeMs: DAY,
} as const;

/**
 * Q1: show "Confirm your number to add ideas and comment" to a personal-link session once they've
 * voted a little, unless they dismissed it in the last day. Verified sessions never see it.
 */
export function shouldShowPhonePrompt(a: {
  scope: "link" | "full";
  votesCast: number;
  dismissedAt: Instant | null;
  now: Instant;
}): boolean {
  if (a.scope !== "link") return false;
  if (a.votesCast < PHONE_PROMPT.afterVotes) return false;
  if (a.dismissedAt == null) return true;
  return toMs(a.now) - toMs(a.dismissedAt) >= PHONE_PROMPT.snoozeMs;
}
