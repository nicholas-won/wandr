/**
 * Messaging rules (REQUIREMENTS §6.6 FR-80–FR-87, §6.10 messaging rows, FR-L2; edge cases N-5,
 * N-12, LB-7). Pure functions: the web app gathers rows and sends through the throttled sender.
 */
import { toMs, type Instant, type MemberId, type TripSize } from "./domain";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Channels (FR-80, FR-87, D49)
// ---------------------------------------------------------------------------

/** Push is Phase 2 (native app). In the POC nobody has push, so the no-app column applies. */
export const PUSH_AVAILABLE = false;

export type MessageTopic =
  | "invite"
  | "join_request"
  | "expense"
  | "poll_closing"
  | "new_poll"
  | "decision"
  | "digest"
  | "trip_update"
  | "vote_question";

/** Group news goes through the organizer's own phone (FR-80a); personal things are texted. */
export type Channel = "push" | "sms" | "group_share" | "email";

/** FR-80 table: which channel a topic uses for a member. */
export function channelFor(topic: MessageTopic, opts: { hasApp: boolean; size: TripSize }): Channel[] {
  if (opts.hasApp && PUSH_AVAILABLE) return ["push"];
  if (opts.size === "solo") return []; // §6.10: no texts except sign-in in solo trips
  switch (topic) {
    case "invite":
    case "join_request":
    case "expense":
    case "poll_closing":
    case "vote_question":
      return ["sms"];
    case "new_poll":
    case "decision":
    case "trip_update":
      return ["group_share"];
    case "digest":
      return opts.hasApp ? ["email"] : ["group_share"];
  }
}

/** §6.10: daily digest is on for groups, off by default for duos, off for solo. */
export function digestEnabled(size: TripSize): boolean {
  return size === "group";
}

/** §6.10: group-chat share prompts in duo trips read "Send to Sam" (the user's own phone). */
export function sharePromptLabel(size: TripSize, otherNames: readonly string[]): string {
  if (size === "duo" && otherNames.length === 1) {
    const first = (otherNames[0] ?? "").trim().split(/\s+/)[0];
    return first ? `Send to ${first}` : "Send it";
  }
  return "Share to the group chat";
}

// ---------------------------------------------------------------------------
// Routing texted-in links and receipts (FR-83, FR-L2, LB-7, §14 open question)
// ---------------------------------------------------------------------------

/**
 * "Active trip" for routing texts (FR-83). OPEN in §14; we use the suggested default:
 * activity in the last 14 days, or dates (any Stop) within the next 60 days or happening now.
 */
export const ACTIVE_TRIP_RULE = { activityDays: 14, upcomingDays: 60 } as const;

export interface RoutableTrip {
  tripId: string;
  lastActivityAt: Instant;
  /** ISO dates (YYYY-MM-DD) of each Stop, null when unset. */
  stopDates: readonly { start: string | null; end: string | null }[];
}

export function isActiveTrip(t: RoutableTrip, now: Instant, rule = ACTIVE_TRIP_RULE): boolean {
  const n = toMs(now);
  if (n - toMs(t.lastActivityAt) <= rule.activityDays * DAY) return true;
  const horizon = n + rule.upcomingDays * DAY;
  return t.stopDates.some((d) => {
    const start = d.start ? Date.parse(`${d.start}T00:00:00Z`) : null;
    const end = d.end ? Date.parse(`${d.end}T23:59:59Z`) : start;
    if (start == null) return false;
    // Upcoming within the horizon, or happening now (not over yet).
    return start <= horizon && (end ?? start) >= n - DAY;
  });
}

/** Most recently active trip that passes the rule, or null → the person's library (FR-L2). */
export function pickActiveTrip(trips: readonly RoutableTrip[], now: Instant, rule = ACTIVE_TRIP_RULE): string | null {
  const active = trips.filter((t) => isActiveTrip(t, now, rule));
  active.sort((a, b) => toMs(b.lastActivityAt) - toMs(a.lastActivityAt) || a.tripId.localeCompare(b.tripId));
  return active[0]?.tripId ?? null;
}

// ---------------------------------------------------------------------------
// Polls: closing nudges (FR-47, FR-80, N-5) and the share fallback (FR-80c)
// ---------------------------------------------------------------------------

/** N-5: "poll closing within 3h" is time-sensitive (P0) and bypasses the daily cap. */
export const POLL_NUDGE_WINDOW_MS = 3 * HOUR;
/** FR-80c: a poll not shared within ~12h falls back to personal texts. */
export const POLL_SHARE_FALLBACK_MS = 12 * HOUR;

export interface PollTimingRow {
  createdAt: Instant;
  closesAt: Instant | null;
  closedAt: Instant | null;
  sharedAt: Instant | null;
  hiddenFrom: readonly MemberId[];
}

function isOpen(p: PollTimingRow, now: number): boolean {
  if (p.closedAt != null) return false;
  return p.closesAt == null || now < toMs(p.closesAt);
}

/** Nudge window: open, has a deadline, and closes within the window. */
export function pollNudgeDue(p: PollTimingRow, now: Instant, windowMs = POLL_NUDGE_WINDOW_MS): boolean {
  const n = toMs(now);
  if (!isOpen(p, n) || p.closesAt == null) return false;
  return toMs(p.closesAt) - n <= windowMs;
}

/**
 * FR-80c / FR-80d: personal texts instead of a group-chat share.
 * - Surprise polls (hidden from someone) never go to the group chat: text right away.
 * - Otherwise, only if nobody shared it within ~12h.
 */
export function pollFallbackDue(p: PollTimingRow, now: Instant, afterMs = POLL_SHARE_FALLBACK_MS): boolean {
  const n = toMs(now);
  if (!isOpen(p, n)) return false;
  if (p.hiddenFrom.length > 0) return true;
  if (p.sharedAt != null) return false;
  return n - toMs(p.createdAt) >= afterMs;
}

/**
 * Who gets a personal poll text: eligible voters (attending, not hidden; caller computes) who
 * haven't voted and haven't already been texted about it. Non-voter identities never leave the
 * server (FR-42): the result is used only to address private texts.
 */
export function pollTextRecipients(args: {
  eligible: readonly MemberId[];
  voted: readonly MemberId[];
  alreadyTexted: readonly MemberId[];
  exclude?: readonly MemberId[];
}): MemberId[] {
  const skip = new Set([...args.voted, ...args.alreadyTexted, ...(args.exclude ?? [])]);
  return args.eligible.filter((m) => !skip.has(m));
}

// ---------------------------------------------------------------------------
// Money texts (FR-80 "you owe / are owed")
// ---------------------------------------------------------------------------

export type BalanceDirection = "owes" | "owed" | "settled";

/** Direction per currency for one member (positive = owed). Amounts never go in the text. */
export function balanceDirections(
  balances: Readonly<Record<string, Readonly<Record<MemberId, number>>>>,
  memberId: MemberId,
): { currency: string; direction: BalanceDirection }[] {
  return Object.keys(balances)
    .sort()
    .map((currency) => {
      const v = balances[currency]?.[memberId] ?? 0;
      return { currency, direction: v > 0 ? "owed" : v < 0 ? "owes" : "settled" } as const;
    });
}

// ---------------------------------------------------------------------------
// Digest (D43, FR-80)
// ---------------------------------------------------------------------------

/** UTC calendar day key for "one digest per trip per day". */
export function digestDay(now: Instant): string {
  return new Date(toMs(now)).toISOString().slice(0, 10);
}

export const DIGEST_LOOKBACK_MS = DAY;

// ---------------------------------------------------------------------------
// Group-chat share cards (FR-80a/b/d/e)
// ---------------------------------------------------------------------------

export type ShareKind = "idea" | "poll" | "decision" | "digest";
export const SHARE_KINDS: readonly ShareKind[] = ["idea", "poll", "decision", "digest"];

/**
 * What a share card may contain. By construction there is no field for money, votes, Pass
 * counts, turnout, non-voters or phone numbers (FR-80e). Previews are snapshots (FR-80b).
 */
export type ShareSnapshot =
  | { kind: "idea"; tripName: string; title: string; category: string | null; city: string | null; summary: string | null; imageUrl: string | null }
  | { kind: "poll"; tripName: string; question: string; options: string[]; closesAt: string | null }
  | { kind: "decision"; tripName: string; question: string; choice: string }
  | { kind: "digest"; tripName: string; day: string; count: number; titles: string[] };

export class ShareRefusedError extends Error {
  constructor(public readonly reason: "surprise" | "empty" | "not_decided") {
    super(`share refused: ${reason}`);
    this.name = "ShareRefusedError";
  }
}

const PHONE_LIKE = /\+?\d[\d\s().-]{6,}\d/g;
const EMAIL_LIKE = /\S+@\S+\.\S+/g;

/** Strip phone numbers / emails from user text and cap length (FR-80e). */
export function scrubShareText(raw: string | null | undefined, max: number): string {
  if (!raw) return "";
  let s = raw.normalize("NFKC").replace(EMAIL_LIKE, "").replace(PHONE_LIKE, "").replace(/\s+/g, " ").trim();
  const chars = Array.from(s);
  if (chars.length > max) s = `${chars.slice(0, max - 1).join("").trimEnd()}…`;
  return s;
}

const MAX = { trip: 60, title: 80, summary: 160, option: 60, digestTitles: 6 } as const;

interface Hideable {
  hiddenFrom: readonly MemberId[];
}

export type ShareInput =
  | { kind: "idea"; tripName: string; idea: Hideable & { title: string; category: string | null; city: string | null; summary: string | null; imageUrl: string | null } }
  | { kind: "poll"; tripName: string; poll: Hideable & { question: string; closesAt: Instant | null; options: string[] } }
  | { kind: "decision"; tripName: string; poll: Hideable & { question: string; winner: string | null } }
  | { kind: "digest"; tripName: string; day: string; ideas: (Hideable & { title: string })[] };

function safeImage(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Build the frozen card. Surprise items are refused outright (FR-80d / FR-91); a digest silently
 * drops them, including from its count.
 */
export function buildShareSnapshot(input: ShareInput): ShareSnapshot {
  const tripName = scrubShareText(input.tripName, MAX.trip) || "Our trip";
  switch (input.kind) {
    case "idea": {
      if (input.idea.hiddenFrom.length > 0) throw new ShareRefusedError("surprise");
      return {
        kind: "idea",
        tripName,
        title: scrubShareText(input.idea.title, MAX.title) || "An idea",
        category: input.idea.category,
        city: scrubShareText(input.idea.city, MAX.trip) || null,
        summary: scrubShareText(input.idea.summary, MAX.summary) || null,
        imageUrl: safeImage(input.idea.imageUrl),
      };
    }
    case "poll": {
      if (input.poll.hiddenFrom.length > 0) throw new ShareRefusedError("surprise");
      const options = input.poll.options.map((o) => scrubShareText(o, MAX.option)).filter(Boolean);
      if (options.length === 0) throw new ShareRefusedError("empty");
      return {
        kind: "poll",
        tripName,
        question: scrubShareText(input.poll.question, MAX.title) || "Quick vote",
        options: options.slice(0, 8),
        closesAt: input.poll.closesAt == null ? null : new Date(toMs(input.poll.closesAt)).toISOString(),
      };
    }
    case "decision": {
      if (input.poll.hiddenFrom.length > 0) throw new ShareRefusedError("surprise");
      const choice = scrubShareText(input.poll.winner, MAX.option);
      if (!choice) throw new ShareRefusedError("not_decided");
      return { kind: "decision", tripName, question: scrubShareText(input.poll.question, MAX.title), choice };
    }
    case "digest": {
      const visible = input.ideas.filter((i) => i.hiddenFrom.length === 0);
      if (visible.length === 0) throw new ShareRefusedError("empty");
      return {
        kind: "digest",
        tripName,
        day: input.day,
        count: visible.length,
        titles: visible
          .slice(0, MAX.digestTitles)
          .map((i) => scrubShareText(i.title, MAX.option))
          .filter(Boolean),
      };
    }
  }
}

/** Headline + call to action. Snapshot wording: never a live tally (FR-80b). */
export function shareCopy(s: ShareSnapshot): { headline: string; detail: string; cta: string } {
  switch (s.kind) {
    case "idea":
      return { headline: s.title, detail: [s.city, s.summary].filter(Boolean).join(" · "), cta: "Tap to vote" };
    case "poll":
      return { headline: s.question, detail: s.options.join(" · "), cta: "Tap to vote" };
    case "decision":
      return { headline: `Decided: ${s.choice}`, detail: s.question, cta: "Tap to see" };
    case "digest":
      return {
        headline: `${s.count} new idea${s.count === 1 ? "" : "s"} for ${s.tripName}`,
        detail: s.titles.join(" · "),
        cta: "Tap to vote",
      };
  }
}

/** Prefilled message for the share sheet (the organizer's own phone sends it, FR-80a). */
export function shareMessage(s: ShareSnapshot, url: string): string {
  const c = shareCopy(s);
  const lead =
    s.kind === "idea"
      ? `${c.headline} for ${s.tripName}?`
      : s.kind === "poll"
        ? `Vote: ${c.headline}`
        : s.kind === "decision"
          ? `${c.headline} (${s.tripName})`
          : c.headline;
  return `${lead} ${c.cta}: ${url}`;
}
