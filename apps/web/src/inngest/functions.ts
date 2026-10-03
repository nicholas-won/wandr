/**
 * Inngest functions (§7a). Bodies are the same handlers server/jobs.ts runs in-process, so local
 * dev without Inngest behaves the same. Crons are UTC.
 */
import { getDb } from "@wandr/db";
import { runJob } from "@/server/jobs";
import { closeDuePolls } from "@/server/polls";
import { EVENTS, inngest } from "./client";

/** FR-20–26, FR-30–35 resolution (D65: no vote-question texts). */
export const ideaAdded = inngest.createFunction(
  { id: "idea-added", triggers: [{ event: EVENTS.ideaAdded }], retries: 2 },
  async ({ event }) => {
    await runJob({ name: EVENTS.ideaAdded, data: { ideaId: String(event.data.ideaId) } });
  },
);

/** FR-L3: auto-sort a library save. */
export const savedIdeaAdded = inngest.createFunction(
  { id: "saved-idea-added", triggers: [{ event: EVENTS.savedIdeaAdded }], retries: 2 },
  async ({ event }) => {
    await runJob({ name: EVENTS.savedIdeaAdded, data: { savedIdeaId: String(event.data.savedIdeaId) } });
  },
);

/** FR-47/48: close polls at their deadline even if nobody opens them (reads also close lazily). */
export const closeDuePollsJob = inngest.createFunction(
  { id: "close-due-polls", triggers: [{ cron: "*/5 * * * *" }] },
  async () => closeDuePolls(await getDb()),
);

/**
 * D43 daily idea digest. 17:00 UTC (late morning US, evening Europe). Per-recipient quiet hours
 * need a member timezone, which the data model doesn't have yet.
 */
export const functions = [ideaAdded, savedIdeaAdded, closeDuePollsJob];
