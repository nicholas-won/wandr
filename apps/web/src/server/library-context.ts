import "server-only";
import { cache } from "react";
import { getDb, type Claims } from "@wandr/db";
import { getBoardGrants } from "@/lib/auth/board-link";
import { getSession } from "@/lib/auth/session";
import { getBoardView } from "./library";

/** The person whose library this is (any device session, including zero-setup creators). */
export const libraryContext = cache(async () => {
  const [db, session] = await Promise.all([getDb(), getSession()]);
  return { db, session, userId: session.user?.userId ?? null };
});

/**
 * Claims for a board (FR-L14): a signed-in person on the board acts as themselves; otherwise a
 * board-link grant for this board acts as that board member (view + add only).
 */
export const boardContext = cache(async (boardId: string) => {
  const { db, session, userId } = await libraryContext();
  if (userId) {
    const view = await getBoardView(db, { sub: userId }, boardId);
    if (view) return { db, session, claims: { sub: userId } as Claims, view };
  }
  const grant = (await getBoardGrants()).find((g) => g.boardId === boardId);
  if (grant) {
    const claims: Claims = { board_link: grant.boardMemberId };
    const view = await getBoardView(db, claims, boardId);
    if (view) return { db, session, claims, view };
  }
  return null;
});
