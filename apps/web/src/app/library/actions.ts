"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { asService, getDb, users } from "@wandr/db";
import { createBoardLink, revokeBoardLinksForMember } from "@/lib/auth/board-link";
import { normalizePhone } from "@/lib/auth/phone";
import { createProvisionalUser, PROVISIONAL_NAME } from "@/lib/auth/provisional";
import { AuthError, getSession, requireFull, setFullSession } from "@/lib/auth/session";
import { libraryRoutes } from "@/lib/library-routes";
import { routes } from "@/lib/routes";
import { track } from "@/server/analytics";
import { inviteMember } from "@/server/invites";
import {
  addBoardMember,
  addToBoard,
  addToBoardFromPaste,
  boardInvitees,
  boardMemberOnBoard,
  createBoard,
  deleteBoard,
  deleteSave,
  isBoardOwner,
  isCategory,
  pickSavedListicle,
  removeBoardMember,
  removeFromBoard,
  renameBoard,
  resolveSavedIdeaJob,
  saveToLibrary,
  saveTripIdeaToLibrary,
  sendSavesToTrip,
  setSaveNote,
  startTripFromSaves,
  updateSaveSort,
} from "@/server/library";
import { boardContext } from "@/server/library-context";

export type LibraryResult<T = object> =
  | ({ ok: true; message?: string } & T)
  | { ok: false; error: string; signin?: string };

const uuid = z.uuid();
const priority = z.enum(["must", "down", "pass"]).nullable();

function failure(e: unknown, next: string = libraryRoutes.home): { ok: false; error: string; signin?: string } {
  if (e instanceof AuthError) return { ok: false, error: "Confirm your number first.", signin: routes.signin(next) };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

/** Any device session works for a private library (P1); none yet → a zero-setup device user. */
async function ensureUser() {
  const db = await getDb();
  const session = await getSession();
  let userId = session.user?.userId;
  if (!userId) {
    userId = await asService(db, (tx) => createProvisionalUser(tx));
    await setFullSession({ userId, needsRecheck: false, provisional: true });
  }
  return { db, userId };
}

async function requireUser() {
  const db = await getDb();
  const session = await getSession();
  if (!session.user) throw new AuthError("signin_required");
  return { db, userId: session.user.userId, provisional: !!session.user.provisional };
}

// --- Saves -----------------------------------------------------------------

/** FR-L1: paste a link or type an idea, with no trip. */
export async function saveAction(raw: string): Promise<LibraryResult<{ savedIdeaId?: string }>> {
  try {
    if (!raw.trim()) return { ok: false, error: "Paste a link or type an idea." };
    const { db, userId } = await ensureUser();
    const { savedIdeaId } = await saveToLibrary(db, userId, { raw });
    after(() => resolveSavedIdeaJob(db, savedIdeaId));
    refresh();
    return { ok: true, savedIdeaId };
  } catch (e) {
    return failure(e);
  }
}

export async function pickListicleAction(savedIdeaId: string, indexes: number[]): Promise<LibraryResult> {
  try {
    const { db, userId } = await requireUser();
    await pickSavedListicle(db, userId, { savedIdeaId: uuid.parse(savedIdeaId), indexes: z.array(z.int().min(0).max(50)).parse(indexes) });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** §5 / FR-L3: fix the name or override the sort ("Is this right?"). Empty → back to the AI's. */
export async function updateSortAction(
  savedIdeaId: string,
  patch: { title?: string; country?: string | null; city?: string | null; category?: string | null },
): Promise<LibraryResult> {
  try {
    const { db, userId } = await requireUser();
    const category = patch.category === undefined ? undefined : isCategory(patch.category) ? patch.category : null;
    const r = await updateSaveSort(db, userId, {
      savedIdeaId: uuid.parse(savedIdeaId),
      title: patch.title,
      country: patch.country,
      city: patch.city,
      category,
    });
    if (r.length === 0) return { ok: false, error: "Couldn't find that save." };
    refresh();
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message === "bad_country") return { ok: false, error: "Use a 2-letter country code, like PT." };
    return failure(e);
  }
}

/** FR-L9: note and someday priority. */
export async function noteAction(
  savedIdeaId: string,
  patch: { note?: string | null; priority?: string | null },
): Promise<LibraryResult> {
  try {
    const { db, userId } = await requireUser();
    await setSaveNote(db, userId, {
      savedIdeaId: uuid.parse(savedIdeaId),
      note: patch.note,
      priority: patch.priority === undefined ? undefined : priority.parse(patch.priority),
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function deleteSaveAction(savedIdeaId: string): Promise<LibraryResult> {
  try {
    const { db, userId } = await requireUser();
    await deleteSave(db, userId, uuid.parse(savedIdeaId));
  } catch (e) {
    return failure(e);
  }
  redirect(libraryRoutes.home);
}

// --- Saves → trips -------------------------------------------------------------

/** FR-L12: copy saves into a trip the person is in. AI/Stop filing happens in the service. */
export async function sendToTripAction(tripId: string, savedIdeaIds: string[]): Promise<LibraryResult<{ tripId?: string }>> {
  try {
    const { db, userId } = await requireUser();
    const r = await sendSavesToTrip(db, userId, { tripId: uuid.parse(tripId), savedIdeaIds: z.array(uuid).max(200).parse(savedIdeaIds) });
    refresh();
    const n = r.sent + r.merged;
    if (n === 0) return { ok: false, error: r.skipped ? "Those saves are still being sorted. Try again in a moment." : "Nothing to send." };
    return {
      ok: true,
      tripId,
      message: `Sent ${n} ${n === 1 ? "idea" : "ideas"} to the trip${r.skipped ? ` (${r.skipped} still sorting)` : ""}.`,
    };
  } catch (e) {
    if (e instanceof Error && e.message === "not_a_member") return { ok: false, error: "You're not in that trip." };
    return failure(e);
  }
}

/**
 * FR-L11 / FR-1a: start a trip from a city, board or single save. On a shared board, its
 * members are invited as normal invitees (FR-L15) — that reaches other people, so only with a
 * verified number; otherwise the owner can invite them from People later.
 */
export async function startTripFromSavesAction(input: {
  name: string;
  city: string | null;
  savedIdeaIds: string[];
  boardId?: string | null;
}): Promise<LibraryResult> {
  let tripId: string;
  try {
    const { db, userId } = await requireUser();
    const ids = z.array(uuid).max(200).parse(input.savedIdeaIds);
    const [u] = await asService(db, (tx) => tx.select({ n: users.displayName }).from(users).where(eq(users.id, userId)));
    const r = await startTripFromSaves(db, {
      userId,
      ownerName: u?.n || PROVISIONAL_NAME,
      name: input.name.trim() || (input.city ? `${input.city} trip` : "New trip"),
      city: input.city?.trim() || null,
      savedIdeaIds: ids,
      boardId: input.boardId ? uuid.parse(input.boardId) : null,
    });
    tripId = r.tripId;
    after(() => track(db, { name: "trip_created", tripId: r.tripId, memberId: r.memberId, props: { via: "library", ideas: r.sent } }));
    if (input.boardId) {
      const boardId = uuid.parse(input.boardId);
      const full = await requireFull().catch(() => null);
      if (full) {
        for (const p of await boardInvitees(db, userId, boardId)) {
          await inviteMember(db, { userId, tripId, name: p.name, phone: p.phone });
        }
      }
    }
  } catch (e) {
    return failure(e);
  }
  redirect(routes.trip(tripId));
}

/** FR-L13 "Save for next time" from a trip idea: the place only. */
export async function saveForNextTimeAction(tripId: string, ideaId: string): Promise<LibraryResult> {
  try {
    const session = await getSession();
    if (!session.user) {
      return { ok: false, error: "Confirm your number to save to your library.", signin: routes.signin(routes.trip(tripId)) };
    }
    const db = await getDb();
    const r = await saveTripIdeaToLibrary(db, session.user.userId, { tripId: uuid.parse(tripId), ideaId: uuid.parse(ideaId) });
    if (!r) return { ok: false, error: "That idea isn't ready to save yet." };
    return { ok: true, message: r.already ? "Already in your library" : "Saved to your library" };
  } catch (e) {
    return failure(e, routes.trip(tripId));
  }
}

// --- Boards ----------------------------------------------------------------

export async function createBoardAction(name: string, savedIdeaId?: string): Promise<LibraryResult<{ boardId?: string }>> {
  try {
    if (!name.trim()) return { ok: false, error: "Give the board a name." };
    const { db, userId } = await ensureUser();
    const { boardId } = await createBoard(db, userId, name);
    if (savedIdeaId) await addToBoard(db, userId, { boardId, savedIdeaIds: [uuid.parse(savedIdeaId)] });
    refresh();
    return { ok: true, boardId };
  } catch (e) {
    return failure(e);
  }
}

/** FR-L8: put a save on a board, or take it off. */
export async function toggleBoardAction(boardId: string, savedIdeaId: string, on: boolean): Promise<LibraryResult> {
  try {
    const { db, userId } = await requireUser();
    const b = uuid.parse(boardId);
    const s = uuid.parse(savedIdeaId);
    if (on) await addToBoard(db, userId, { boardId: b, savedIdeaIds: [s] });
    else await removeFromBoard(db, { sub: userId }, { boardId: b, savedIdeaId: s });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** FR-L14: anyone on the board (incl. a board link) can add. */
export async function boardAddAction(boardId: string, raw: string): Promise<LibraryResult> {
  try {
    if (!raw.trim()) return { ok: false, error: "Paste a link or type an idea." };
    const ctx = await boardContext(uuid.parse(boardId));
    if (!ctx) return { ok: false, error: "You're not on this board." };
    const { savedIdeaId } = await addToBoardFromPaste(ctx.db, ctx.claims, { boardId, raw });
    after(() => resolveSavedIdeaJob(ctx.db, savedIdeaId));
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, libraryRoutes.board(boardId));
  }
}

export async function boardRemoveItemAction(boardId: string, savedIdeaId: string): Promise<LibraryResult> {
  try {
    const ctx = await boardContext(uuid.parse(boardId));
    if (!ctx) return { ok: false, error: "You're not on this board." };
    const ok = await removeFromBoard(ctx.db, ctx.claims, { boardId, savedIdeaId: uuid.parse(savedIdeaId) });
    if (!ok) {
      return ctx.claims.sub
        ? { ok: false, error: "Only the board owner can remove that." }
        : { ok: false, error: "Confirm your number to remove items.", signin: routes.signin(libraryRoutes.board(boardId)) };
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, libraryRoutes.board(boardId));
  }
}

export async function renameBoardAction(boardId: string, name: string): Promise<LibraryResult> {
  try {
    const { db, userId } = await requireUser();
    if (!(await renameBoard(db, userId, { boardId: uuid.parse(boardId), name }))) {
      return { ok: false, error: "Only the board owner can rename it." };
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, libraryRoutes.board(boardId));
  }
}

export async function deleteBoardAction(boardId: string): Promise<LibraryResult> {
  try {
    const { db, userId } = await requireUser();
    if (!(await deleteBoard(db, userId, uuid.parse(boardId)))) return { ok: false, error: "Only the board owner can delete it." };
  } catch (e) {
    return failure(e, libraryRoutes.board(boardId));
  }
  redirect(libraryRoutes.boards);
}

/**
 * FR-L14: share a board with someone through their own personal link. Sharing reaches another
 * person, so it needs a verified number (like trip invites, FR-1). The phone is optional and
 * kept service-only (FR-L26); it's used only to invite them if the board becomes a trip (FR-L15).
 */
export async function shareBoardAction(boardId: string, name: string, phone: string): Promise<LibraryResult<{ link?: string }>> {
  try {
    const user = await requireFull();
    const db = await getDb();
    const b = uuid.parse(boardId);
    if (!name.trim()) return { ok: false, error: "Add their name." };
    let phoneE164: string | null = null;
    if (phone.trim()) {
      const p = normalizePhone(phone);
      if (!p.ok) return { ok: false, error: "That doesn't look like a mobile number." };
      phoneE164 = p.e164;
    }
    if (!(await isBoardOwner(db, user.userId, b))) return { ok: false, error: "Only the board owner can share it." };
    const { boardMemberId } = await addBoardMember(db, user.userId, { boardId: b, name, phoneE164 });
    const link = await asService(db, (tx) => createBoardLink(tx, boardMemberId));
    refresh();
    return { ok: true, link: link.url, message: `Send ${name.trim()} their link.` };
  } catch (e) {
    return failure(e, libraryRoutes.board(boardId));
  }
}

/** A fresh link for an existing board member (the old one stops working). Owner, verified. */
export async function freshBoardLinkAction(boardId: string, boardMemberId: string): Promise<LibraryResult<{ link?: string }>> {
  try {
    const user = await requireFull();
    const db = await getDb();
    const b = uuid.parse(boardId);
    const m = uuid.parse(boardMemberId);
    if (!(await isBoardOwner(db, user.userId, b)) || !(await boardMemberOnBoard(db, m, b))) {
      return { ok: false, error: "Only the board owner can share links." };
    }
    const link = await asService(db, async (tx) => {
      await revokeBoardLinksForMember(tx, m);
      return createBoardLink(tx, m);
    });
    return { ok: true, link: link.url };
  } catch (e) {
    return failure(e, libraryRoutes.board(boardId));
  }
}

/** Owner removes a member; their links stop working at once, their items stay (LB-6). */
export async function removeBoardMemberAction(boardId: string, boardMemberId: string): Promise<LibraryResult> {
  try {
    const user = await requireFull();
    const db = await getDb();
    const m = uuid.parse(boardMemberId);
    if (!(await removeBoardMember(db, user.userId, { boardId: uuid.parse(boardId), boardMemberId: m }))) {
      return { ok: false, error: "Only the board owner can remove people." };
    }
    await asService(db, (tx) => revokeBoardLinksForMember(tx, m));
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, libraryRoutes.board(boardId));
  }
}
