/**
 * Shared-board personal links (FR-L14, same rules as FR-5 / N-4). Server only.
 *
 * - `createBoardLink` mints a token for a board member; only its sha256 is stored.
 * - GET /b/[token] only inspects the link (no state change), so preview bots can't bind it.
 * - The page POSTs to `redeemBoardLink`, which binds the link to this device on first use and
 *   adds a view + add grant for that board to a separate signed cookie (`w_brd`).
 * - Revoked links and removed board members are refused, and grants are re-checked per request.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { asService, boardLinks, boardMembers, getDb, type Tx } from "@wandr/db";
import { appUrl } from "@/lib/env";
import { libraryRoutes } from "@/lib/library-routes";
import { COOKIE, cookieOptions } from "./cookies";
import { randomToken } from "./crypto";
import { generateLinkToken, hashDeviceId, hashLinkToken, isWellFormedLinkToken } from "./link-token";
import { SESSION_TTL_SECONDS, signPayload, verifyPayload, type BoardLinkGrant } from "./tokens";

const DEVICE_COOKIE_TTL = 400 * 24 * 60 * 60;
/** At most this many board grants in one cookie. */
export const MAX_BOARD_GRANTS = 20;

export async function createBoardLink(tx: Tx, boardMemberId: string): Promise<{ token: string; url: string }> {
  const token = generateLinkToken();
  await tx.insert(boardLinks).values({ boardMemberId, tokenHash: hashLinkToken(token) });
  return { token, url: `${appUrl()}${libraryRoutes.boardLink(token)}` };
}

export async function revokeBoardLinksForMember(tx: Tx, boardMemberId: string): Promise<void> {
  await tx
    .update(boardLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(boardLinks.boardMemberId, boardMemberId), isNull(boardLinks.revokedAt)));
}

export type BoardLinkStatus = "ok" | "invalid" | "revoked" | "removed";

type Row = {
  linkId: string;
  boardMemberId: string;
  boardId: string;
  revokedAt: Date | null;
  boundDeviceHash: string | null;
  memberStatus: string;
};

async function findLink(tx: Tx, token: string): Promise<Row | undefined> {
  const [row] = await tx
    .select({
      linkId: boardLinks.id,
      boardMemberId: boardLinks.boardMemberId,
      boardId: boardMembers.boardId,
      revokedAt: boardLinks.revokedAt,
      boundDeviceHash: boardLinks.boundDeviceHash,
      memberStatus: boardMembers.status,
    })
    .from(boardLinks)
    .innerJoin(boardMembers, eq(boardMembers.id, boardLinks.boardMemberId))
    .where(eq(boardLinks.tokenHash, hashLinkToken(token)))
    .limit(1);
  return row;
}

function statusOf(row: Row | undefined): BoardLinkStatus {
  if (!row) return "invalid";
  if (row.revokedAt) return "revoked";
  if (row.memberStatus !== "active") return "removed";
  return "ok";
}

/** Read-only check for the GET page. Reveals nothing about the board. */
export async function inspectBoardLink(token: string): Promise<BoardLinkStatus> {
  if (!isWellFormedLinkToken(token)) return "invalid";
  const db = await getDb();
  return statusOf(await asService(db, (tx) => findLink(tx, token)));
}

export type RedeemBoardResult =
  | { ok: true; boardId: string; redirectTo: string }
  | { ok: false; error: Exclude<BoardLinkStatus, "ok"> | "other_device" };

/** Exchange a board-link token for a view + add grant on this device. Server Action / POST only. */
export async function redeemBoardLink(token: string): Promise<RedeemBoardResult> {
  if (!isWellFormedLinkToken(token)) return { ok: false, error: "invalid" };
  const jar = await cookies();
  let deviceId = jar.get(COOKIE.device)?.value;
  if (!deviceId || !/^[A-Za-z0-9_-]{32,64}$/.test(deviceId)) {
    deviceId = randomToken(24);
    jar.set(COOKIE.device, deviceId, cookieOptions(DEVICE_COOKIE_TTL));
  }
  const deviceHash = hashDeviceId(deviceId);
  const db = await getDb();
  const outcome = await asService(db, async (tx) => {
    const row = await findLink(tx, token);
    const status = statusOf(row);
    if (status !== "ok" || !row) return { ok: false as const, error: status === "ok" ? ("invalid" as const) : status };
    if (row.boundDeviceHash && row.boundDeviceHash !== deviceHash) {
      return { ok: false as const, error: "other_device" as const };
    }
    if (!row.boundDeviceHash) {
      const bound = await tx
        .update(boardLinks)
        .set({ boundDeviceHash: deviceHash })
        .where(and(eq(boardLinks.id, row.linkId), isNull(boardLinks.boundDeviceHash)))
        .returning({ id: boardLinks.id });
      if (bound.length === 0) return { ok: false as const, error: "other_device" as const };
    }
    return { ok: true as const, row };
  });
  if (!outcome.ok) return outcome;
  const { row } = outcome;
  const current = await verifyPayload(jar.get(COOKIE.boards)?.value, "boards");
  const grants = [
    { boardMemberId: row.boardMemberId, boardId: row.boardId, linkId: row.linkId },
    ...(current?.grants ?? []).filter((g) => g.boardId !== row.boardId),
  ].slice(0, MAX_BOARD_GRANTS);
  jar.set(COOKIE.boards, await signPayload({ k: "boards", grants }, SESSION_TTL_SECONDS), cookieOptions(SESSION_TTL_SECONDS));
  return { ok: true, boardId: row.boardId, redirectTo: libraryRoutes.board(row.boardId) };
}

/** Live board grants for this request (revoked links and removed members filtered out). */
export const getBoardGrants = cache(async (): Promise<BoardLinkGrant[]> => {
  const jar = await cookies();
  const payload = await verifyPayload(jar.get(COOKIE.boards)?.value, "boards");
  const grants = payload?.grants ?? [];
  if (grants.length === 0) return [];
  const db = await getDb();
  const rows = await asService(db, (tx) =>
    tx
      .select({ linkId: boardLinks.id, boardMemberId: boardLinks.boardMemberId, boardId: boardMembers.boardId })
      .from(boardLinks)
      .innerJoin(boardMembers, eq(boardMembers.id, boardLinks.boardMemberId))
      .where(
        and(
          inArray(
            boardLinks.id,
            grants.map((g) => g.linkId),
          ),
          isNull(boardLinks.revokedAt),
          eq(boardMembers.status, "active"),
        ),
      ),
  );
  const ok = new Set(rows.map((r) => `${r.linkId}|${r.boardMemberId}|${r.boardId}`));
  return grants.filter((g) => ok.has(`${g.linkId}|${g.boardMemberId}|${g.boardId}`));
});
