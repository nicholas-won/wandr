/**
 * An uploaded screenshot (FR-20, FR-26) for people who can see the idea or save. Never public:
 * RLS decides through the viewer's claims, and the response is never cached by shared caches.
 *
 * GET /api/screenshot/{idea|save}/{sourceId} → image
 */
import type { NextRequest } from "next/server";
import { getDb, type Claims } from "@wandr/db";
import { getBoardGrants } from "@/lib/auth/board-link";
import { claimsFor, getSession } from "@/lib/auth/session";
import { openScreenshot, screenshotTripId } from "@/server/screenshots";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { "cache-control": "private, no-store" };
const notFound = () => new Response(null, { status: 404, headers: PRIVATE });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/screenshot/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if ((kind !== "idea" && kind !== "save") || !UUID.test(id)) return notFound();
  const [db, session] = await Promise.all([getDb(), getSession()]);
  let claims: Claims[];
  if (kind === "idea") {
    const tripId = await screenshotTripId(db, id);
    if (!tripId) return notFound();
    claims = [claimsFor(session, tripId)];
  } else {
    claims = [
      ...(session.user ? [{ sub: session.user.userId } as Claims] : []),
      ...(await getBoardGrants()).map((g): Claims => ({ board_link: g.boardMemberId })),
    ];
  }
  const obj = await openScreenshot(db, kind, id, claims);
  if (!obj) return notFound();
  return new Response(obj.bytes as unknown as BodyInit, {
    headers: {
      ...PRIVATE,
      "content-type": obj.contentType,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      // Uploaded bytes are only ever rendered as an image, never as a document.
      "content-security-policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
}
