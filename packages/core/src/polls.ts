/**
 * Organizer polls (FR-47, FR-48, FR-S12, FR-T7, D8, D33, DN-16).
 *
 * - Eligible voters are the people attending the poll's Stop (FR-47); the caller computes them
 *   (see `attendingMemberIds` in stops.ts) and excludes anyone the poll is hidden from (FR-91).
 * - Non-voters abstain; they never count as yes (FR-47, D8).
 * - Ties or turnout under 50% → no automatic winner; the organizer picks, runs a run-off or
 *   extends the deadline (FR-48, D33).
 * - Duo: a 1–1 tie goes to the owner (FR-T7).
 * - Solo: polls are hidden (§6.10).
 */
import { toMs, type Instant, type MemberId, type TripSize } from "./domain";

export interface PollBallot {
  memberId: MemberId;
  optionId: string;
}

export interface PollOutcomeInput {
  size: TripSize;
  optionIds: readonly string[];
  ballots: readonly PollBallot[];
  /** Active members attending the poll's Stop, minus anyone it is hidden from. */
  eligibleVoterIds: readonly MemberId[];
}

export interface PollTurnout {
  voted: number;
  eligible: number;
}

export type PollOutcome =
  | { kind: "hidden" }
  | {
      kind: "winner";
      optionId: string;
      tally: Record<string, number>;
      turnout: PollTurnout;
    }
  | {
      kind: "needs_organizer";
      reason: "tie" | "low_turnout";
      /** Who decides: duo ties go to the owner (FR-T7); otherwise owner/organizers (FR-48). */
      decider: "owner" | "organizers";
      /** Options tied for first (empty for low_turnout). */
      tiedOptionIds: string[];
      tally: Record<string, number>;
      turnout: PollTurnout;
    };

/** FR-48 / DN-16: minimum turnout is 50% of eligible voters (exactly 50% passes). */
export function meetsTurnout(voted: number, eligible: number): boolean {
  if (eligible <= 0) return false;
  return voted * 2 >= eligible;
}

/**
 * Outcome of a poll at close (or a live preview of it).
 * Ballots from ineligible members or for unknown options are ignored; one ballot per member
 * (the last one in the list wins, matching "votes can be changed while open", FR-43).
 * Low turnout is checked before ties.
 */
export function pollOutcome(input: PollOutcomeInput): PollOutcome {
  if (input.size === "solo") return { kind: "hidden" };

  const eligible = new Set(input.eligibleVoterIds);
  const options = new Set(input.optionIds);
  const latest = new Map<MemberId, string>();
  for (const b of input.ballots) {
    if (eligible.has(b.memberId) && options.has(b.optionId)) latest.set(b.memberId, b.optionId);
  }

  const tally: Record<string, number> = {};
  for (const id of input.optionIds) tally[id] = 0;
  for (const optionId of latest.values()) tally[optionId] = (tally[optionId] ?? 0) + 1;

  const turnout: PollTurnout = { voted: latest.size, eligible: eligible.size };
  const decider = input.size === "duo" ? "owner" : "organizers";

  if (!meetsTurnout(turnout.voted, turnout.eligible)) {
    return { kind: "needs_organizer", reason: "low_turnout", decider: "organizers", tiedOptionIds: [], tally, turnout };
  }

  const max = Math.max(...input.optionIds.map((id) => tally[id] ?? 0));
  const top = input.optionIds.filter((id) => tally[id] === max);
  if (top.length !== 1) {
    return { kind: "needs_organizer", reason: "tie", decider, tiedOptionIds: top, tally, turnout };
  }
  return { kind: "winner", optionId: top[0]!, tally, turnout };
}

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

export interface PollTiming {
  /** Deadline; null = no deadline (open until an organizer closes it). */
  closesAt: Instant | null;
  /** Set when an organizer closed it (possibly early, V-12). */
  closedAt: Instant | null;
}

/** Open = not closed by an organizer and deadline (if any) not yet reached. */
export function isPollOpen(poll: PollTiming, now: Instant): boolean {
  if (poll.closedAt != null) return false;
  if (poll.closesAt == null) return true;
  return toMs(now) < toMs(poll.closesAt);
}

/** Milliseconds left before the deadline (0 if past or closed; null if no deadline). */
export function msUntilClose(poll: PollTiming, now: Instant): number | null {
  if (poll.closedAt != null) return 0;
  if (poll.closesAt == null) return null;
  return Math.max(0, toMs(poll.closesAt) - toMs(now));
}

/**
 * FR-48: extend the deadline. The new deadline is `byMs` after the later of the current deadline
 * and `now` (so extending an already-expired poll gives a real window). Re-opens a poll closed by
 * its deadline; the caller clears `closedAt` if it had been set.
 */
export function extendDeadline(closesAt: Instant | null, now: Instant, byMs: number): Date {
  if (!(byMs > 0)) throw new RangeError("byMs must be positive");
  const base = Math.max(closesAt == null ? 0 : toMs(closesAt), toMs(now));
  return new Date(base + byMs);
}

/**
 * Short deadline text for chips (FR-120 "closes Fri"), in the viewer's time zone (S-14).
 * Uses the weekday name; callers can add time if needed.
 */
export function closesLabel(closesAt: Instant, timeZone: string, locale = "en-US"): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(
    new Date(toMs(closesAt)),
  );
  return `closes ${weekday}`;
}
