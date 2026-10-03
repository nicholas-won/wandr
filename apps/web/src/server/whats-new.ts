/**
 * "What's new" on a trip (D65, replacing the daily digest by text): what happened since the
 * person's last visit. Reads run as the caller, so surprise items and private data never count
 * (FR-91, NFR-3).
 */
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { comments, ideas, members, polls, withSession, type Claims, type Db } from "@wandr/db";

export interface WhatsNew {
  since: Date;
  newIdeas: { count: number; by: string[] };
  newPolls: { id: string; question: string }[];
  decided: { id: string; question: string }[];
  newComments: number;
}

const DAY_MS = 86_400_000;

export async function whatsNew(
  db: Db,
  claims: Claims,
  args: { tripId: string; myMemberId: string; since: Date | null },
): Promise<WhatsNew | null> {
  // First visit: nothing is "new" yet. Cap the window at a week so a long absence stays readable.
  if (!args.since) return null;
  const since = new Date(Math.max(args.since.getTime(), Date.now() - 7 * DAY_MS));
  return withSession(db, claims, async (tx) => {
    const ideaRows = await tx
      .select({ by: members.displayName })
      .from(ideas)
      .leftJoin(members, eq(members.id, ideas.createdByMemberId))
      .where(and(eq(ideas.tripId, args.tripId), gt(ideas.createdAt, since), ne(ideas.createdByMemberId, args.myMemberId)));
    const newPolls = await tx
      .select({ id: polls.id, question: polls.question })
      .from(polls)
      .where(and(eq(polls.tripId, args.tripId), gt(polls.createdAt, since), isNull(polls.closedAt)))
      .orderBy(desc(polls.createdAt))
      .limit(5);
    const decided = await tx
      .select({ id: polls.id, question: polls.question })
      .from(polls)
      .where(and(eq(polls.tripId, args.tripId), gt(polls.closedAt, since)))
      .orderBy(desc(polls.closedAt))
      .limit(5);
    const [c] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(eq(comments.tripId, args.tripId), gt(comments.createdAt, since), ne(comments.memberId, args.myMemberId), isNull(comments.deletedAt)));
    const by = [...new Set(ideaRows.map((r) => r.by ?? "Someone"))];
    return { since, newIdeas: { count: ideaRows.length, by }, newPolls, decided, newComments: c?.n ?? 0 };
  });
}

export function isEmpty(w: WhatsNew | null): boolean {
  return !w || (w.newIdeas.count === 0 && w.newPolls.length === 0 && w.decided.length === 0 && w.newComments === 0);
}
