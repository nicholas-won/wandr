/**
 * Poll lifecycle on top of polls.ts (FR-47, FR-48, FR-S12, FR-92, FR-T7, S-4, S-6, V-7, V-8,
 * V-12). Pure: drafts, status, outcome from the tallies the DB may reveal, and what the
 * organizer can do next.
 */
import { pollOutcome, type PollOutcome } from "./polls";
import { toMs, type Instant, type MemberId, type TripSize } from "./domain";

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;
export const POLL_QUESTION_MAX = 140;
export const POLL_LABEL_MAX = 80;
/** Deadlines are at least 10 minutes out and at most 60 days. */
export const POLL_MIN_DEADLINE_MS = 10 * 60_000;
export const POLL_MAX_DEADLINE_MS = 60 * 86_400_000;
/** Default "Run-off between A and B, 24h" (V-7) and "extend 24h" (V-8). */
export const DEFAULT_EXTENSION_MS = 24 * 3_600_000;

export interface PollOptionDraft {
  label: string;
  ideaId?: string | null;
  /** FR-92 theme/outfit polls. https only (no data:/javascript: URLs). */
  imageUrl?: string | null;
}

export interface PollDraft {
  question: string;
  options: readonly PollOptionDraft[];
  closesAt: Instant | null;
}

export type PollDraftError =
  | "question_required"
  | "question_too_long"
  | "too_few_options"
  | "too_many_options"
  | "option_label_required"
  | "option_label_too_long"
  | "duplicate_options"
  | "bad_image_url"
  | "deadline_too_soon"
  | "deadline_too_far";

/** Safe image URL for an option: absolute https, no credentials. */
export function isSafeImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && raw.length <= 2048;
  } catch {
    return false;
  }
}

/** Validate and normalize a new poll (trimmed labels, empty image URLs dropped). */
export function validatePollDraft(
  draft: PollDraft,
  now: Instant,
): { ok: true; draft: PollDraft } | { ok: false; error: PollDraftError } {
  const question = draft.question.trim();
  if (!question) return { ok: false, error: "question_required" };
  if (question.length > POLL_QUESTION_MAX) return { ok: false, error: "question_too_long" };
  const options = draft.options
    .map((o) => ({ label: o.label.trim(), ideaId: o.ideaId ?? null, imageUrl: o.imageUrl?.trim() || null }))
    .filter((o) => o.label || o.imageUrl || o.ideaId);
  if (options.length < POLL_MIN_OPTIONS) return { ok: false, error: "too_few_options" };
  if (options.length > POLL_MAX_OPTIONS) return { ok: false, error: "too_many_options" };
  if (options.some((o) => !o.label)) return { ok: false, error: "option_label_required" };
  if (options.some((o) => o.label.length > POLL_LABEL_MAX)) return { ok: false, error: "option_label_too_long" };
  const keys = options.map((o) => o.ideaId ?? o.label.toLowerCase());
  if (new Set(keys).size !== keys.length) return { ok: false, error: "duplicate_options" };
  if (options.some((o) => o.imageUrl && !isSafeImageUrl(o.imageUrl))) return { ok: false, error: "bad_image_url" };
  if (draft.closesAt != null) {
    const dt = toMs(draft.closesAt) - toMs(now);
    if (dt < POLL_MIN_DEADLINE_MS) return { ok: false, error: "deadline_too_soon" };
    if (dt > POLL_MAX_DEADLINE_MS) return { ok: false, error: "deadline_too_far" };
  }
  return { ok: true, draft: { question, options, closesAt: draft.closesAt } };
}

export interface PollState {
  closesAt: Instant | null;
  closedAt: Instant | null;
  pausedAt: Instant | null;
  winningOptionId: string | null;
}

export type PollStatus = "open" | "paused" | "needs_decision" | "decided";

/**
 * - paused: an organizer (or a reopened stage / date change, S-4/S-6) paused it; the deadline
 *   doesn't run out while paused.
 * - open: accepting votes.
 * - decided: closed with a winner (by vote or by an organizer's pick).
 * - needs_decision: closed without a winner (tie or low turnout, FR-48).
 */
export function pollStatus(p: PollState, now: Instant): PollStatus {
  const closed = p.closedAt != null || (p.pausedAt == null && p.closesAt != null && toMs(p.closesAt) <= toMs(now));
  if (closed) return p.winningOptionId ? "decided" : "needs_decision";
  if (p.pausedAt != null) return "paused";
  return "open";
}

/** A deadline-closed poll the job (or a lazy read) should finalize. */
export function isDueForClose(p: PollState, now: Instant): boolean {
  return p.closedAt == null && p.pausedAt == null && p.closesAt != null && toMs(p.closesAt) <= toMs(now);
}

/** Resume keeps the time that was left when it was paused (deadline += paused duration). */
export function resumedDeadline(p: { closesAt: Instant | null; pausedAt: Instant }, now: Instant): Date | null {
  if (p.closesAt == null) return null;
  return new Date(toMs(p.closesAt) + Math.max(0, toMs(now) - toMs(p.pausedAt)));
}

/**
 * FR-48 outcome from per-option counts (what `app.poll_results` reveals once a poll is closed)
 * and the eligible count. Same rules as pollOutcome: under 50% turnout or a tie → no winner.
 */
export function pollOutcomeFromTally(
  size: TripSize,
  options: readonly { optionId: string; count: number }[],
  eligibleCount: number,
): PollOutcome {
  // Synthesize anonymous ballots so the one rule set in polls.ts decides.
  const ballots: { memberId: MemberId; optionId: string }[] = [];
  let n = 0;
  for (const o of options) for (let k = 0; k < o.count; k++) ballots.push({ memberId: `b${n++}`, optionId: o.optionId });
  // Eligible can't be fewer than the counted ballots (the DB only counts eligible voters).
  const eligible = Array.from({ length: Math.max(eligibleCount, n) }, (_, i) => `b${i}`);
  return pollOutcome({
    size,
    optionIds: options.map((o) => o.optionId),
    ballots,
    eligibleVoterIds: eligible,
  });
}

export type OrganizerPollAction = "pick" | "runoff" | "extend";

/**
 * FR-48 / V-7 / V-8: what the organizer may do when there's no automatic winner.
 * - tie: pick one of the tied options, run a run-off between them, or extend.
 * - low turnout: pick any option, or extend (no run-off: there's nothing to narrow).
 * Duo ties go to the owner only (FR-T7).
 */
export function organizerPollActions(
  outcome: PollOutcome,
  actor: { role: "owner" | "organizer" | "member" },
): { actions: OrganizerPollAction[]; pickable: string[] | "any" } {
  if (outcome.kind !== "needs_organizer") return { actions: [], pickable: [] };
  if (actor.role === "member") return { actions: [], pickable: [] };
  if (outcome.decider === "owner" && actor.role !== "owner") return { actions: [], pickable: [] };
  if (outcome.reason === "tie") {
    return { actions: ["pick", "runoff", "extend"], pickable: outcome.tiedOptionIds };
  }
  return { actions: ["pick", "extend"], pickable: "any" };
}

/** Can this pick be applied for this outcome? */
export function canPick(outcome: PollOutcome, actorRole: "owner" | "organizer" | "member", optionId: string, optionIds: readonly string[]): boolean {
  const { actions, pickable } = organizerPollActions(outcome, { role: actorRole });
  if (!actions.includes("pick")) return false;
  return pickable === "any" ? optionIds.includes(optionId) : pickable.includes(optionId);
}

/** Result line shown to everyone after close (V-8, V-12). */
export function outcomeText(
  outcome: PollOutcome,
  labels: Readonly<Record<string, string>>,
  opts: { winningOptionId?: string | null; closedEarlyBy?: string | null } = {},
): string {
  if (outcome.kind === "hidden") return "";
  const t = outcome.turnout;
  const turnout = `${t.voted} of ${t.eligible} voted`;
  const early = opts.closedEarlyBy ? `Closed early by ${opts.closedEarlyBy}, ` : "";
  if (opts.winningOptionId) {
    const byVote = outcome.kind === "winner" && outcome.optionId === opts.winningOptionId;
    const w = labels[opts.winningOptionId] ?? "an option";
    return byVote ? `${w} won. ${early}${turnout}.` : `Decided: ${w}. ${early}${turnout}.`;
  }
  if (outcome.kind === "winner") return `${labels[outcome.optionId] ?? "An option"} won. ${early}${turnout}.`;
  if (outcome.reason === "low_turnout") return `No decision, too few votes. ${early}${turnout}.`;
  const names = outcome.tiedOptionIds.map((id) => labels[id] ?? "?").join(" and ");
  return `Tie between ${names}. ${early}${turnout}.`;
}
