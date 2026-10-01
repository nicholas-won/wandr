/**
 * SMS templates (FR-81, FR-84, FR-86, FR-16; J-4, J-19). Pure.
 *
 * Rules:
 * - All texts are templated. User-written text (trip names, idea titles, names) only appears
 *   after `sanitizeLabel`: URLs/phone numbers/emoji stripped, length capped, and a neutral
 *   fallback ("your trip") when it contains carrier-flagged (SHAFT/spam) terms.
 * - Every outbound text carries the recipient's personal link (FR-81) and "Not {name}? Reply
 *   WRONG" (FR-16). Use `outboundText()`; it requires both.
 * - Never marketing. Brand prefix for carrier/10DLC identification.
 */
import { APP_NAME } from "@wandr/core/config";

// ---------------------------------------------------------------------------
// Sanitizing user text
// ---------------------------------------------------------------------------

/** Carrier SHAFT categories (sex, hate, alcohol, firearms, tobacco), drugs, gambling, spam bait. */
const FLAGGED_TERMS = [
  // sex
  "sex", "sexy", "xxx", "nude", "nudes", "naked", "porn", "stripper", "strip club", "escort", "hooker", "nsfw",
  // alcohol
  "booze", "boozy", "drunk", "wasted", "alcohol", "beer", "wine", "vodka", "tequila", "whiskey", "whisky",
  "liquor", "shots", "keg", "kegger", "bar crawl", "pub crawl", "bottomless", "margarita", "rum",
  // drugs / tobacco
  "weed", "420", "cannabis", "marijuana", "thc", "cbd", "edibles", "molly", "mdma", "coke", "cocaine",
  "drugs", "shrooms", "tobacco", "cigar", "cigars", "cigarette", "cigarettes", "vape", "hookah", "smoke",
  // firearms / violence
  "gun", "guns", "firearm", "rifle", "shooting", "ammo", "kill",
  // gambling / spam / phishing bait
  "casino", "gamble", "gambling", "betting", "winner", "prize", "cash", "loan", "crypto", "bitcoin",
  // profanity
  "fuck", "fucking", "shit", "bitch", "ass", "damn",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FLAGGED_RE = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${FLAGGED_TERMS.map((t) => escapeRe(t).replace(/ /g, "\\s+")).join("|")})s?(?=$|[^\\p{L}\\p{N}])`,
  "iu",
);

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/giu;
const BARE_DOMAIN_RE =
  /\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|io|co|ly|me|app|link|xyz|info|biz|us|ca|gg|tv|to|sh|site|online|club|shop|page|ai|dev|lol|click|top)\b(?:\/\S*)?/giu;
const PHONE_LIKE_RE = /\+?\d[\d\s().-]{6,}\d/gu;
const EMAIL_RE = /\S+@\S+\.\S+/gu;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const CONTROL_RE = /[\p{Cc}\p{Cf}]/gu;

export function containsFlaggedTerm(text: string): boolean {
  return FLAGGED_RE.test(text.normalize("NFKC"));
}

/**
 * Make user-written text safe to put in a text body (J-19). Returns `fallback` when the text is
 * empty after cleaning or contains a flagged term.
 */
export function sanitizeLabel(raw: string | null | undefined, opts: { max: number; fallback: string }): string {
  if (!raw) return opts.fallback;
  const original = raw.normalize("NFKC");
  if (containsFlaggedTerm(original)) return opts.fallback;
  let s = original
    .replace(CONTROL_RE, " ")
    .replace(URL_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(BARE_DOMAIN_RE, " ")
    .replace(PHONE_LIKE_RE, " ")
    .replace(EMOJI_RE, "")
    .replace(/[<>{}[\]\\|^~`"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s\-–—:;,.!?/]+|[\s\-–—:;,/]+$/g, "")
    .trim();
  if (!s || !/[\p{L}\p{N}]/u.test(s)) return opts.fallback;
  if (containsFlaggedTerm(s)) return opts.fallback;
  const chars = Array.from(s);
  if (chars.length > opts.max) s = `${chars.slice(0, opts.max - 3).join("").trimEnd()}...`;
  return s;
}

export const TRIP_NAME_MAX = 30;
export const IDEA_TITLE_MAX = 40;
export const PERSON_NAME_MAX = 20;
export const NEUTRAL_TRIP = "your trip";

export function sanitizeTripName(name: string | null | undefined): string {
  return sanitizeLabel(name, { max: TRIP_NAME_MAX, fallback: NEUTRAL_TRIP });
}

export function sanitizeIdeaTitle(title: string | null | undefined): string {
  return sanitizeLabel(title, { max: IDEA_TITLE_MAX, fallback: "an idea" });
}

/** First name only, for greetings and the WRONG footer. Empty string when unusable. */
export function sanitizeFirstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return sanitizeLabel(first, { max: PERSON_NAME_MAX, fallback: "" });
}

// ---------------------------------------------------------------------------
// Outbound texts
// ---------------------------------------------------------------------------

export type Recipient = {
  /** Display name of the person we're texting (for "Not Sam?"). */
  name: string | null | undefined;
  /** Their personal link (FR-81). Required. */
  link: string;
};

/** "Not Sam? Reply WRONG" (FR-16, J-4). */
export function wrongFooter(name: string | null | undefined): string {
  const first = sanitizeFirstName(name);
  return first ? `Not ${first}? Reply WRONG` : "Not you? Reply WRONG";
}

/** Assemble a text: brand prefix, body, personal link, WRONG footer. */
export function outboundText(body: string, to: Recipient): string {
  if (!to.link) throw new Error("Every text needs a personal link (FR-81)");
  return `${APP_NAME}: ${body}\n${to.link}\n${wrongFooter(to.name)}`;
}

const VOTE_PROMPT = "Reply 1 Must-do, 2 Down, 3 Pass";

export const texts = {
  /** Personal invite (FR-4). */
  invite(p: { to: Recipient; inviterName: string; tripName: string }) {
    const hi = sanitizeFirstName(p.to.name);
    const inviter = sanitizeFirstName(p.inviterName) || "A friend";
    return outboundText(
      `${hi ? `Hi ${hi}! ` : ""}${inviter} added you to ${sanitizeTripName(p.tripName)}. Tap to see ideas and vote:`,
      p.to,
    );
  },

  /** Vote question; opens the person's single SMS question (FR-82, FR-83). */
  voteQuestion(p: { to: Recipient; tripName: string; ideaTitle: string }) {
    return outboundText(
      `New idea for ${sanitizeTripName(p.tripName)}: ${sanitizeIdeaTitle(p.ideaTitle)}. ${VOTE_PROMPT}. Or tap:`,
      p.to,
    );
  },

  /** Join request to an organizer (FR-8). Only the last 4 digits of the requester's number (J-20). */
  joinRequest(p: { to: Recipient; requesterName: string; requesterLast4: string; tripName: string }) {
    const who = sanitizeFirstName(p.requesterName) || "Someone";
    const last4 = p.requesterLast4.replace(/\D/g, "").slice(-4);
    return outboundText(
      `${who}${last4 ? ` (${last4})` : ""} wants to join ${sanitizeTripName(p.tripName)}. Reply Y to approve or N to deny. Or tap:`,
      p.to,
    );
  },

  /** Expense involving you (FR-80). No amounts in the text body; the link shows them. */
  expenseAdded(p: { to: Recipient; payerName: string; tripName: string }) {
    const payer = sanitizeFirstName(p.payerName) || "Someone";
    return outboundText(`${payer} added a receipt in ${sanitizeTripName(p.tripName)}. See your share:`, p.to);
  },

  /** Poll closing, only to people who haven't voted (FR-80). */
  pollClosing(p: { to: Recipient; tripName: string; hoursLeft: number }) {
    const h = Math.max(1, Math.round(p.hoursLeft));
    return outboundText(
      `A vote for ${sanitizeTripName(p.tripName)} closes in ${h} hour${h === 1 ? "" : "s"}. Tap to vote:`,
      p.to,
    );
  },
};

// ---------------------------------------------------------------------------
// Replies to inbound texts (TwiML). Short; replies to the person's own message.
// ---------------------------------------------------------------------------

const VOTE_LABEL = { must: "Must-do", down: "Down", pass: "Pass" } as const;

export const replies = {
  optedOut: () =>
    `${APP_NAME}: You're unsubscribed and won't get more texts from this number. Sign-in codes still work. Reply START to resubscribe.`,
  optedIn: () => `${APP_NAME}: You're resubscribed to trip texts. Reply STOP to opt out, HELP for help.`,
  help: (p: { url: string; supportEmail?: string }) =>
    `${APP_NAME}: Texts about trips you're in. Help: ${p.url}${p.supportEmail ? ` or ${p.supportEmail}` : ""}. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.`,
  wrongNumber: () => `${APP_NAME}: Thanks for letting us know. We won't text this number again. Sorry about that!`,
  voteRecorded: (p: { ideaTitle: string; value: keyof typeof VOTE_LABEL }) =>
    `Got it: ${VOTE_LABEL[p.value]} for ${sanitizeIdeaTitle(p.ideaTitle)}. Reply UNDO to change.`,
  joinDecided: (p: { name: string; approved: boolean; tripName: string }) =>
    p.approved
      ? `Approved: ${sanitizeFirstName(p.name) || "they"} joined ${sanitizeTripName(p.tripName)}. Reply UNDO to change.`
      : `Denied: ${sanitizeFirstName(p.name) || "they"} won't join ${sanitizeTripName(p.tripName)}. Reply UNDO to change.`,
  undone: () => "Undone. Nothing else changed.",
  nothingToUndo: () => "There's nothing to undo right now.",
  noOpenQuestion: () => "There's nothing to answer right now. Use the link in our last text to see your trip.",
  questionClosed: () => "That question has closed. Use the link in our last text to see what was decided.",
  hint: (expected: "vote" | "yes_no") =>
    expected === "vote" ? `Sorry, we didn't get that. ${VOTE_PROMPT}.` : "Sorry, we didn't get that. Reply Y to approve or N to deny.",
  removed: () => "You're no longer in this trip.",
  unrecognized: () =>
    "Sorry, we didn't get that. Reply to a question with its number, text us a link to add an idea, or reply HELP.",
  tapback: () => "Reactions don't count as votes. Reply 1, 2 or 3 instead.",
};
