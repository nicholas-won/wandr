/**
 * Google place photo for an idea or library save (FR-31 display only, FR-L6).
 *
 * GET /api/place-photo/{idea|save}/{id}?v=<photo hash>&w=<px>   → image (private, 1 h)
 * GET /api/place-photo/{idea|save}/{id}?prime=1                 → 204 after refreshing the cache
 *
 * The caller must be able to see the item (RLS via withSession). The Google key stays here.
 */
import type { NextRequest } from "next/server";
import { getDb, type Claims } from "@wandr/db";
import { createPlacesClient } from "@wandr/ai";
import { getBoardGrants } from "@/lib/auth/board-link";
import { claimsFor, getSession } from "@/lib/auth/session";
import { ideaTripId, loadPhotoSubject, placePhotoResponse } from "@/server/place-photos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });

export async function GET(req: NextRequest, ctx: RouteContext<"/api/place-photo/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if ((kind !== "idea" && kind !== "save") || !UUID.test(id)) return notFound();
  const places = createPlacesClient();
  if (!places) return notFound();

  const [db, session] = await Promise.all([getDb(), getSession()]);
  let claims: Claims[];
  if (kind === "idea") {
    const tripId = await ideaTripId(db, id);
    if (!tripId) return notFound();
    claims = [claimsFor(session, tripId)];
  } else {
    claims = [
      ...(session.user ? [{ sub: session.user.userId } as Claims] : []),
      ...(await getBoardGrants()).map((g): Claims => ({ board_link: g.boardMemberId })),
    ];
  }
  const subject = await loadPhotoSubject(db, kind, id, claims);
  if (!subject) return notFound();

  const q = req.nextUrl.searchParams;
  const w = Number(q.get("w"));
  return placePhotoResponse({
    db,
    places,
    kind,
    id,
    subject,
    v: q.get("v"),
    prime: q.get("prime") === "1",
    widthPx: Number.isFinite(w) && w > 0 ? Math.min(Math.max(Math.round(w), 160), 1200) : 640,
  });
}
