/**
 * Inbound text parsing and routing (FR-82, FR-83, FR-85, FR-16; N-1, N-6, N-7, J-4). Pure.
 *
 * `parseInbound` turns a raw text into an intent; `routeInbound` picks the action given the
 * person's single open question (DN-23) and undo state. The webhook executes the action.
 */

export type VoteValue = "must" | "down" | "pass";

export type InboundIntent =
  | { type: "stop"; informal: boolean }
  | { type: "start" }
  | { type: "help" }
  | { type: "wrong" }
  | { type: "undo" }
  | { type: "vote"; value: VoteValue }
  | { type: "yes" }
  | { type: "no" }
  | { type: "url"; url: string }
  | { type: "media"; mediaUrls: string[] }
  | { type: "tapback" }
  | { type: "empty" }
  | { type: "unknown" };

/** Carrier/CTIA opt-out keywords; must be honored when sent alone (NFR-7). */
export const STOP_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout", "opt out", "opt-out"];
export const START_KEYWORDS = ["start", "unstop", "subscribe"];
export const HELP_KEYWORDS = ["help", "info"];

/** Informal opt-outs honored "by any reasonable means" (FCC 2024 TCPA rules; N-1, FR-85). */
const INFORMAL_STOP_PATTERNS: RegExp[] = [
  /\bstop\s+(?:texting|messaging|sending|contacting|txting|texing)\b/,
  /\b(?:don'?t|do not|dont|never)\s+(?:text|message|txt|contact)\s+me\b/,
  /\bleave me alone\b/,
  /\b(?:unsubscribe|remove|take)\s+me\b/,
  /\btake me off\b/,
  /\bopt\s*me\s*out\b/,
  /\bno more (?:texts|messages|txts)\b/,
  /\bstop it\b/,
  /\bplease stop\b/,
  /\bstop please\b/,
];

/** Reassigned / wrong number signals (J-4). */
const WRONG_PATTERNS: RegExp[] = [
  /^wrong$/,
  /\bwrong (?:number|person|#|num)\b/,
  /^wrong\b/,
  /\bwho(?: is|'s|s) this\b/,
  /\bwhos this\b/,
  /\bwho dis\b/,
  /^(?:this is )?not me$/,
  /\bnew number\b/,
];

/** iMessage/Android reactions that arrive as text (N-6). */
const TAPBACK_RE =
  /^(?:liked|loved|disliked|laughed at|emphasi[sz]ed|questioned|reacted\s+.{1,8}\s+to)\s+["“”'‘]/iu;

const URL_RE = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/iu;

const KEYCAP: Record<string, string> = { "1️⃣": "1", "2️⃣": "2", "3️⃣": "3", "1⃣": "1", "2⃣": "2", "3⃣": "3" };

function normalize(body: string): string {
  let s = body.normalize("NFKC").trim();
  for (const [k, v] of Object.entries(KEYCAP)) s = s.split(k).join(v);
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^["“”'(\[]+|["“”')\].!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const VOTE_WORDS: Record<string, VoteValue> = {
  "1": "must",
  "2": "down",
  "3": "pass",
  must: "must",
  "must do": "must",
  "must-do": "must",
  mustdo: "must",
  down: "down",
  pass: "pass",
};
const YES_WORDS = new Set(["y", "yes", "yeah", "yep", "yup", "approve", "approved", "accept", "ok", "okay"]);
const NO_WORDS = new Set(["n", "no", "nope", "nah", "deny", "denied", "decline", "reject"]);

export function parseInbound(input: { body: string | null | undefined; mediaUrls?: string[] }): InboundIntent {
  const raw = input.body ?? "";
  const s = normalize(raw);

  // Opt-outs come first so they're never misread as answers (NFR-7).
  if (STOP_KEYWORDS.includes(s)) return { type: "stop", informal: false };
  if (START_KEYWORDS.includes(s)) return { type: "start" };
  if (HELP_KEYWORDS.includes(s)) return { type: "help" };
  if (TAPBACK_RE.test(raw.trim())) return { type: "tapback" };
  if (INFORMAL_STOP_PATTERNS.some((re) => re.test(s))) return { type: "stop", informal: true };
  if (WRONG_PATTERNS.some((re) => re.test(s))) return { type: "wrong" };
  if (s === "undo") return { type: "undo" };

  if (input.mediaUrls && input.mediaUrls.length > 0) return { type: "media", mediaUrls: input.mediaUrls };
  const url = raw.match(URL_RE)?.[0];
  if (url) return { type: "url", url: url.replace(/[.,!?)]+$/, "") };

  const voteKey = s.replace(/^#/, "");
  const vote = VOTE_WORDS[voteKey];
  if (vote) return { type: "vote", value: vote };
  if (YES_WORDS.has(s)) return { type: "yes" };
  if (NO_WORDS.has(s)) return { type: "no" };

  if (!s) return { type: "empty" };
  return { type: "unknown" };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type OpenQuestionKind = "vote" | "approve_join";

export type RouteContext = {
  openQuestion: { kind: OpenQuestionKind; expired: boolean } | null;
  hasUndo: boolean;
  optedOut: boolean;
};

export type InboundAction =
  | { action: "opt_out"; informal: boolean }
  | { action: "opt_in" }
  | { action: "help" }
  | { action: "wrong_number" }
  | { action: "undo" }
  | { action: "nothing_to_undo" }
  | { action: "cast_vote"; value: VoteValue }
  | { action: "decide_join"; approve: boolean }
  | { action: "question_closed" }
  | { action: "no_open_question" }
  | { action: "hint"; expected: "vote" | "yes_no" }
  | { action: "texted_idea"; url: string }
  | { action: "texted_receipt"; mediaUrls: string[] }
  | { action: "tapback" }
  | { action: "unrecognized" };

export function routeInbound(intent: InboundIntent, ctx: RouteContext): InboundAction {
  const q = ctx.openQuestion;
  switch (intent.type) {
    case "stop":
      return { action: "opt_out", informal: intent.informal };
    case "start":
      return { action: "opt_in" };
    case "help":
      return { action: "help" };
    case "wrong":
      return { action: "wrong_number" };
    case "undo":
      return ctx.hasUndo ? { action: "undo" } : { action: "nothing_to_undo" };
    case "tapback":
      return { action: "tapback" };
    case "media":
      return { action: "texted_receipt", mediaUrls: intent.mediaUrls };
    case "url":
      return { action: "texted_idea", url: intent.url };
    case "vote":
      if (!q) return { action: "no_open_question" };
      if (q.expired) return { action: "question_closed" };
      if (q.kind !== "vote") return { action: "hint", expected: "yes_no" };
      return { action: "cast_vote", value: intent.value };
    case "yes":
    case "no":
      // Carriers treat YES as an opt-in keyword for opted-out numbers.
      if (intent.type === "yes" && ctx.optedOut && !q) return { action: "opt_in" };
      if (!q) return { action: "no_open_question" };
      if (q.expired) return { action: "question_closed" };
      if (q.kind !== "approve_join") return { action: "hint", expected: "vote" };
      return { action: "decide_join", approve: intent.type === "yes" };
    case "empty":
    case "unknown":
      if (q && !q.expired) return { action: "hint", expected: q.kind === "vote" ? "vote" : "yes_no" };
      return { action: "unrecognized" };
  }
}
