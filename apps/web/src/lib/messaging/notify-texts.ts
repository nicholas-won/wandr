/**
 * Templates for the messaging slice (FR-80, FR-80c, FR-83, FR-L2, J-4). Pure.
 * Same rules as templates.ts: user text only through the sanitizers, every outbound text has a
 * personal link and the WRONG footer (`outboundText`), no amounts, never marketing.
 */
import { APP_NAME } from "@wandr/core/config";
import type { BalanceDirection } from "@wandr/core/messaging";
import {
  outboundText,
  sanitizeFirstName,
  sanitizeIdeaTitle,
  sanitizeTripName,
  type Recipient,
} from "./templates";

export const notifyTexts = {
  /** "You owe / are owed" after an expense change (FR-80). Direction only; the link shows amounts. */
  balance(p: {
    to: Recipient;
    tripName: string;
    actorName: string;
    directions: { currency: string; direction: BalanceDirection }[];
    /** Duo: name the other person (FR-T8 "You owe Sam"). */
    otherName?: string | null;
  }) {
    const actor = sanitizeFirstName(p.actorName) || "Someone";
    const other = sanitizeFirstName(p.otherName ?? "");
    const parts = p.directions
      .filter((d) => d.direction !== "settled")
      .map((d) => {
        const multi = p.directions.length > 1 ? ` (${d.currency})` : "";
        if (d.direction === "owes") return `you owe${other ? ` ${other}` : ""}${multi}`;
        return `you're owed${other ? ` by ${other}` : ""}${multi}`;
      });
    const state = parts.length ? `Now ${parts.join(", ")}.` : "You're all settled up.";
    return outboundText(`${actor} updated a receipt in ${sanitizeTripName(p.tripName)}. ${state} See details:`, p.to);
  },

  /** FR-80c: a poll nobody shared to the group chat (or a surprise poll, FR-80d). */
  pollFallback(p: { to: Recipient; tripName: string; closesInHours: number | null }) {
    const when =
      p.closesInHours == null
        ? ""
        : ` It closes in ${Math.max(1, Math.round(p.closesInHours))} hour${Math.round(p.closesInHours) === 1 ? "" : "s"}.`;
    return outboundText(`There's a new vote for ${sanitizeTripName(p.tripName)}.${when} Tap to vote:`, p.to);
  },

  /** J-4: an organizer learns texts to a member may be reaching someone else. */
  wrongNumberAlert(p: { to: Recipient; memberName: string; tripName: string }) {
    const who = sanitizeFirstName(p.memberName) || "a member";
    return outboundText(
      `Texts to ${who} for ${sanitizeTripName(p.tripName)} may be reaching someone else, so we stopped them. Check their number:`,
      p.to,
    );
  },
};

/** TwiML replies to texted-in links and photos (FR-82, FR-83, FR-L2). Plain receipts only. */
export const intakeReplies = {
  savedToTrip: (p: { tripName: string; moveUrl: string | null; tripUrl: string }) =>
    p.moveUrl
      ? `Saved to ${sanitizeTripName(p.tripName)}. We're sorting it now. Not for this trip? Move it to your library: ${p.moveUrl}`
      : `Saved to ${sanitizeTripName(p.tripName)}. We're sorting it now. See it: ${p.tripUrl}`,
  savedToLibrary: (p: { moveUrl: string }) =>
    `Saved to your library. We're sorting it now. Meant for a trip? Move it: ${p.moveUrl}`,
  noAccount: (p: { url: string }) =>
    `${APP_NAME}: We couldn't find a trip for this number. Start one at ${p.url}`,
  receiptSaved: (p: { tripName: string; url: string }) =>
    `Got your receipt for ${sanitizeTripName(p.tripName)}. Tap to split it: ${p.url}`,
  receiptNoTrip: (p: { url: string }) =>
    `We couldn't tell which trip that receipt is for. Open your trip to add it: ${p.url}`,
  receiptFailed: () => "Sorry, we couldn't read that photo. Try sending it again.",
  ideaTitle: (t: string) => sanitizeIdeaTitle(t),
};

/** Digest email (D43, FR-80). Plain text, no votes, no surprise items. */
export function digestEmail(p: { tripName: string; titles: string[]; count: number; url: string }) {
  const trip = sanitizeTripName(p.tripName);
  const lines = p.titles.map((t) => `- ${sanitizeIdeaTitle(t)}`);
  const more = p.count > p.titles.length ? `\n...and ${p.count - p.titles.length} more` : "";
  return {
    subject: `${p.count} new idea${p.count === 1 ? "" : "s"} for ${trip}`,
    text: `New ideas for ${trip} today:\n${lines.join("\n")}${more}\n\nVote here: ${p.url}`,
  };
}
