/**
 * Inngest functions (§7a). Bodies are the same handlers server/jobs.ts runs in-process, so local
 * dev without Inngest behaves the same. Crons are UTC.
 */
import { getDb } from "@wandr/db";
import { runJob } from "@/server/jobs";
import { runDailyDigest, runPollClosingNudges, runPollShareFallbacks } from "@/server/notify";
import { EVENTS, inngest } from "./client";

/** FR-20–26, FR-30–35 resolution, then FR-82/83 vote questions. */
export const ideaAdded = inngest.createFunction(
  { id: "idea-added", triggers: [{ event: EVENTS.ideaAdded }], retries: 2 },
  async ({ event }) => {
    await runJob({ name: EVENTS.ideaAdded, data: { ideaId: String(event.data.ideaId) } });
  },
);

/** FR-L2/FR-L3: auto-sort a texted-in library save. */
export const savedIdeaAdded = inngest.createFunction(
  { id: "saved-idea-added", triggers: [{ event: EVENTS.savedIdeaAdded }], retries: 2 },
  async ({ event }) => {
    await runJob({ name: EVENTS.savedIdeaAdded, data: { savedIdeaId: String(event.data.savedIdeaId) } });
  },
);

/** FR-80 "you owe / are owed". Debounced so a burst of edits to one expense sends one text. */
export const expenseChanged = inngest.createFunction(
  {
    id: "expense-changed",
    triggers: [{ event: EVENTS.expenseChanged }],
    debounce: { key: "event.data.expenseId", period: "2m" },
    retries: 1,
  },
  async ({ event }) => {
    await runJob({
      name: EVENTS.expenseChanged,
      data: { tripId: String(event.data.tripId), expenseId: String(event.data.expenseId) },
    });
  },
);

/** FR-47/FR-80 poll-closing nudges (N-5 window ~3h). */
export const pollClosingNudges = inngest.createFunction(
  { id: "poll-closing-nudges", triggers: [{ cron: "*/20 * * * *" }] },
  async () => runPollClosingNudges(await getDb()),
);

/** FR-80c: unshared polls (~12h) → personal texts. */
export const pollShareFallbacks = inngest.createFunction(
  { id: "poll-share-fallbacks", triggers: [{ cron: "15 * * * *" }] },
  async () => runPollShareFallbacks(await getDb()),
);

/**
 * D43 daily idea digest. 17:00 UTC (late morning US, evening Europe). Per-recipient quiet hours
 * need a member timezone, which the data model doesn't have yet.
 */
export const dailyDigest = inngest.createFunction(
  { id: "daily-digest", triggers: [{ cron: "0 17 * * *" }] },
  async () => runDailyDigest(await getDb()),
);

export const functions = [ideaAdded, savedIdeaAdded, expenseChanged, pollClosingNudges, pollShareFallbacks, dailyDigest];
