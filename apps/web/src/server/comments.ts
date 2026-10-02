/**
 * Threaded comments on ideas (FR-46): not real-time chat. One level of replies.
 *
 * Everything runs as the caller (withSession), so RLS decides what they see:
 * - comments inherit the idea's surprise list and disappear with the idea (FR-91);
 * - personal-link sessions can read threads but not write (FR-5; comments_insert needs full scope);
 * - only the author edits or deletes (guard_comments, migrations/0007_comment_threads_rls.sql).
 * Deletes are soft: the DB clears the body, and a deleted comment stays only as a
 * "Comment deleted" placeholder while it still has replies. Phone numbers are never read here.
 */
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { comments, ideas, members, withSession, type Claims, type Db, type Tx } from "@wandr/db";

export const COMMENT_MAX = 2000;

export interface CommentView {
  id: string;
  parentId: string | null;
  authorMemberId: string;
  authorName: string;
  isMine: boolean;
  /** Null when deleted. Plain text: render as text, never HTML. */
  body: string | null;
  deleted: boolean;
  edited: boolean;
  createdAt: string;
  replies: CommentView[];
}

export class CommentError extends Error {
  constructor(public readonly code: "empty" | "too_long" | "not_found" | "signin_required") {
    super(code);
    this.name = "CommentError";
  }
}

/** Trim, normalize line endings, cap blank lines. Throws on empty/too long. */
export function cleanBody(raw: string): string {
  const body = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!body) throw new CommentError("empty");
  if (body.length > COMMENT_MAX) throw new CommentError("too_long");
  return body;
}

type Row = typeof comments.$inferSelect;

function pgCode(e: unknown): string | undefined {
  for (let x: unknown = e, i = 0; x && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    const code = (x as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function toView(r: Row, names: Map<string, string>, myMemberId: string | null): CommentView {
  return {
    id: r.id,
    parentId: r.parentId,
    authorMemberId: r.memberId,
    authorName: names.get(r.memberId) ?? "Former member",
    isMine: !!myMemberId && r.memberId === myMemberId,
    body: r.deletedAt ? null : r.body,
    deleted: !!r.deletedAt,
    edited: !!r.editedAt && !r.deletedAt,
    createdAt: r.createdAt.toISOString(),
    replies: [],
  };
}

/** Shape rows into a thread: top-level oldest first, replies oldest first under their parent. */
export function shapeThread(rows: Row[], names: Map<string, string>, myMemberId: string | null): CommentView[] {
  const view = (r: Row) => toView(r, names, myMemberId);
  const byTime = [...rows].sort((a, b) => +a.createdAt - +b.createdAt || (a.id < b.id ? -1 : 1));
  const top = new Map<string, CommentView>();
  for (const r of byTime) if (!r.parentId) top.set(r.id, view(r));
  for (const r of byTime) {
    if (!r.parentId || r.deletedAt) continue;
    top.get(r.parentId)?.replies.push(view(r));
  }
  // A deleted top-level comment stays only as a placeholder for its live replies.
  return [...top.values()].filter((c) => !c.deleted || c.replies.length > 0);
}

async function myMemberId(tx: Tx, tripId: string, claims: Claims): Promise<string | null> {
  const rows = await tx
    .select({ id: members.id, userId: members.userId, status: members.status })
    .from(members)
    .where(eq(members.tripId, tripId));
  const me = rows.find((m) => (claims.sub ? m.userId === claims.sub : m.id === claims.link_member));
  return me && (me.status === "active" || me.status === "not_attending") ? me.id : null;
}

async function threadIn(tx: Tx, claims: Claims, ideaId: string): Promise<CommentView[] | null> {
  // RLS: an idea the caller can't see (surprise, other trip) returns nothing.
  const [idea] = await tx.select({ tripId: ideas.tripId }).from(ideas).where(eq(ideas.id, ideaId));
  if (!idea) return null;
  const rows = await tx.select().from(comments).where(eq(comments.ideaId, ideaId)).orderBy(asc(comments.createdAt));
  const ids = [...new Set(rows.map((r) => r.memberId))];
  const names = ids.length
    ? await tx
        .select({ id: members.id, displayName: members.displayName })
        .from(members)
        .where(inArray(members.id, ids))
    : [];
  const me = await myMemberId(tx, idea.tripId, claims);
  return shapeThread(rows, new Map(names.map((n) => [n.id, n.displayName])), me);
}

/** The thread for one idea, as the caller. Null if they can't see the idea. */
export async function listThread(db: Db, claims: Claims, ideaId: string): Promise<CommentView[] | null> {
  return withSession(db, claims, (tx) => threadIn(tx, claims, ideaId));
}

/** Live comment counts per idea, counting only rows RLS lets the caller see. Run inside a session. */
export async function commentCountsIn(tx: Tx, ideaIds: string[]): Promise<Map<string, number>> {
  if (ideaIds.length === 0) return new Map();
  const rows = await tx
    .select({ ideaId: comments.ideaId, n: count() })
    .from(comments)
    .where(and(inArray(comments.ideaId, ideaIds), isNull(comments.deletedAt)))
    .groupBy(comments.ideaId);
  return new Map(rows.map((r) => [r.ideaId!, Number(r.n)]));
}

export async function commentCounts(db: Db, claims: Claims, ideaIds: string[]) {
  return withSession(db, claims, (tx) => commentCountsIn(tx, ideaIds));
}

/** Add a comment, or a reply under a top-level comment. Full scope only (FR-5, RLS). */
export async function addComment(
  db: Db,
  claims: Claims,
  args: { ideaId: string; body: string; parentId?: string | null },
): Promise<CommentView> {
  if (!claims.sub) throw new CommentError("signin_required");
  const body = cleanBody(args.body);
  return withSession(db, claims, async (tx) => {
    const [idea] = await tx.select({ tripId: ideas.tripId }).from(ideas).where(eq(ideas.id, args.ideaId));
    if (!idea) throw new CommentError("not_found");
    const memberId = await myMemberId(tx, idea.tripId, claims);
    if (!memberId) throw new CommentError("not_found");
    // The guard trigger re-derives trip_id, member_id, hidden_from and created_at, and checks
    // the parent is a live top-level comment on this idea.
    const [row] = await tx
      .insert(comments)
      .values({ tripId: idea.tripId, ideaId: args.ideaId, parentId: args.parentId ?? null, memberId, body })
      .returning();
    const [me] = await tx.select({ displayName: members.displayName }).from(members).where(eq(members.id, row!.memberId));
    return toView(row!, new Map([[row!.memberId, me?.displayName ?? "You"]]), row!.memberId);
  });
}

async function updateOwn(db: Db, claims: Claims, commentId: string, set: Partial<Row>) {
  if (!claims.sub) throw new CommentError("signin_required");
  try {
    await withSession(db, claims, async (tx) => {
      const [row] = await tx.update(comments).set(set).where(eq(comments.id, commentId)).returning({ id: comments.id });
      if (!row) throw new CommentError("not_found");
    });
  } catch (e) {
    // Organizers pass the update policy, but the trigger rejects edits to others' words.
    if (pgCode(e) === "42501") throw new CommentError("not_found");
    throw e;
  }
}

/** Author edits their comment; the DB marks it edited. */
export async function editComment(db: Db, claims: Claims, args: { commentId: string; body: string }) {
  await updateOwn(db, claims, args.commentId, { body: cleanBody(args.body) });
}

/** Author deletes their comment (soft: the DB clears the body). */
export async function deleteComment(db: Db, claims: Claims, args: { commentId: string }) {
  await updateOwn(db, claims, args.commentId, { deletedAt: new Date() });
}

/** Undo a delete: the author puts their text back (the client still has it). */
export async function restoreComment(db: Db, claims: Claims, args: { commentId: string; body: string }) {
  await updateOwn(db, claims, args.commentId, { deletedAt: null, body: cleanBody(args.body) });
}
