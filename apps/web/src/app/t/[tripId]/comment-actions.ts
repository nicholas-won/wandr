"use server";

/**
 * Idea comment threads (FR-46). Reading works from a personal link; writing needs a code
 * (FR-5; the comments_insert policy requires full scope). RLS decides visibility (FR-91).
 */
import { refresh } from "next/cache";
import { z } from "zod";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import {
  addComment,
  CommentError,
  deleteComment,
  editComment,
  listThread,
  restoreComment,
  type CommentView,
} from "@/server/comments";

type Fail = { ok: false; error: string; signin?: string };
export type ThreadResult = { ok: true; comments: CommentView[]; canWrite: boolean; signin: string } | Fail;
export type CommentResult = { ok: true; comment: CommentView } | Fail;
export type CommentOk = { ok: true } | Fail;

const uuid = z.uuid();
const body = z.string().max(4000);

function fail(e: unknown, tripId: string): Fail {
  if (e instanceof CommentError) {
    switch (e.code) {
      case "signin_required":
        return { ok: false, error: "Confirm your number to comment.", signin: routes.signin(routes.trip(tripId)) };
      case "empty":
        return { ok: false, error: "Write something first." };
      case "too_long":
        return { ok: false, error: "That's a bit long. Keep it under 2,000 characters." };
      case "not_found":
        return { ok: false, error: "You can only change your own comments." };
    }
  }
  if (e instanceof z.ZodError) return { ok: false, error: "Something went wrong. Try again." };
  console.error(e);
  return { ok: false, error: "Couldn't save that. Try again." };
}

export async function loadThreadAction(tripId: string, ideaId: string): Promise<ThreadResult> {
  try {
    const { db, claims, session } = await tripContext(uuid.parse(tripId));
    const comments = await listThread(db, claims, uuid.parse(ideaId));
    if (!comments) return { ok: false, error: "This idea isn't available." };
    return { ok: true, comments, canWrite: !!session.user, signin: routes.signin(routes.trip(tripId)) };
  } catch (e) {
    return fail(e, tripId);
  }
}

export async function addCommentAction(
  tripId: string,
  ideaId: string,
  text: string,
  parentId: string | null,
): Promise<CommentResult> {
  try {
    const { db, claims } = await tripContext(uuid.parse(tripId));
    const comment = await addComment(db, claims, {
      ideaId: uuid.parse(ideaId),
      body: body.parse(text),
      parentId: parentId ? uuid.parse(parentId) : null,
    });
    refresh();
    return { ok: true, comment };
  } catch (e) {
    return fail(e, tripId);
  }
}

export async function editCommentAction(tripId: string, commentId: string, text: string): Promise<CommentOk> {
  try {
    const { db, claims } = await tripContext(uuid.parse(tripId));
    await editComment(db, claims, { commentId: uuid.parse(commentId), body: body.parse(text) });
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}

export async function deleteCommentAction(tripId: string, commentId: string): Promise<CommentOk> {
  try {
    const { db, claims } = await tripContext(uuid.parse(tripId));
    await deleteComment(db, claims, { commentId: uuid.parse(commentId) });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** Undo for a delete (P7): the author's own text goes back. */
export async function restoreCommentAction(tripId: string, commentId: string, text: string): Promise<CommentOk> {
  try {
    const { db, claims } = await tripContext(uuid.parse(tripId));
    await restoreComment(db, claims, { commentId: uuid.parse(commentId), body: body.parse(text) });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}
