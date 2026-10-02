/**
 * Background job queue (§7a Inngest). `enqueue` sends an Inngest event when INNGEST_EVENT_KEY is
 * set; otherwise (local dev, or if the send fails) it runs the same handler in-process after the
 * response with `after()`. Handlers live in server/notify.ts and server/text-intake.ts and are
 * shared by both paths, so behavior is identical.
 */
import { after } from "next/server";
import { getDb } from "@wandr/db";
import { env } from "@/lib/env";
import { EVENTS, inngest } from "@/inngest/client";

export type JobEvent =
  | { name: typeof EVENTS.ideaAdded; data: { ideaId: string } }
  | { name: typeof EVENTS.savedIdeaAdded; data: { savedIdeaId: string } }
  | { name: typeof EVENTS.expenseChanged; data: { tripId: string; expenseId: string } };

/** Run one job in-process (the after() fallback, and the Inngest function bodies). */
export async function runJob(e: JobEvent): Promise<void> {
  const db = await getDb();
  switch (e.name) {
    case EVENTS.ideaAdded: {
      const { handleIdeaAdded } = await import("./notify");
      await handleIdeaAdded(db, e.data.ideaId);
      return;
    }
    case EVENTS.savedIdeaAdded: {
      const { resolveSavedIdeaJob } = await import("./text-intake");
      await resolveSavedIdeaJob(db, e.data.savedIdeaId);
      return;
    }
    case EVENTS.expenseChanged: {
      const { sendExpenseTexts } = await import("./notify");
      await sendExpenseTexts(db, e.data.tripId, e.data.expenseId);
      return;
    }
  }
}

/** Queue a background job. Call from Server Actions and Route Handlers (needs a request scope). */
export async function enqueue(e: JobEvent): Promise<void> {
  if (env().INNGEST_EVENT_KEY) {
    try {
      await inngest.send(e);
      return;
    } catch (err) {
      console.error("[jobs] inngest send failed; running in-process", err);
    }
  }
  after(() =>
    runJob(e).catch((err) => {
      console.error("[jobs] in-process job failed", e.name, err);
    }),
  );
}
