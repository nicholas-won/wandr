/**
 * Background helpers for trip activity (§6.6 as revised by D65).
 *
 * Texts are now only sign-in codes and personal invites, so nothing here sends a text: new ideas
 * are resolved and voted on in the app, polls and decisions reach people through share cards
 * (server/share.ts) and the in-app "What's new" (server/whats-new.ts).
 */
import { and, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { pollOptions, polls, type Db, type Tx } from "@wandr/db";
import type { resolveIdea } from "@wandr/ai";
import { resolveIdeaJob } from "./ideas";

/** Job body for `wandr/idea.added`: resolve the idea (FR-20–26, FR-30–35). */
export async function handleIdeaAdded(db: Db, ideaId: string, deps: { resolver?: typeof resolveIdea } = {}) {
  await resolveIdeaJob(db, ideaId, deps);
}

/** Record that a poll was shared to the group chat (FR-80a). */
export async function markPollShared(tx: Tx, pollId: string, at = new Date()) {
  await tx.update(polls).set({ sharedAt: at }).where(and(eq(polls.id, pollId), isNull(polls.sharedAt)));
}

/** Option labels in order (poll share cards). */
export async function pollOptionLabels(tx: Tx, pollId: string): Promise<{ id: string; label: string }[]> {
  return tx
    .select({ id: pollOptions.id, label: pollOptions.label })
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId))
    .orderBy(pollOptions.position);
}

/** Polls decided recently (closed with a winner), for "Decision made" share prompts. */
export async function recentDecisions(tx: Tx, tripId: string, since: Date) {
  return tx
    .select()
    .from(polls)
    .where(and(eq(polls.tripId, tripId), isNotNull(polls.winningOptionId), isNotNull(polls.closedAt), gte(polls.closedAt, since)));
}
