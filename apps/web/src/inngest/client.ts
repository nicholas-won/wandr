/**
 * Inngest client (§7a background jobs). Events are sent only when INNGEST_EVENT_KEY is set;
 * otherwise server/jobs.ts runs the same handlers in-process via after() (local dev).
 */
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "wandr" });

/** Event names. Payloads carry ids only (no user content, no phone numbers). */
export const EVENTS = {
  ideaAdded: "wandr/idea.added",
  savedIdeaAdded: "wandr/saved-idea.added",
  expenseChanged: "wandr/expense.changed",
  stopsGeocode: "wandr/stops.geocode",
} as const;
