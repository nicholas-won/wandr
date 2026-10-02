/**
 * "Tap to vote" from a share card (FR-80b). GET has no side effects (link-preview bots, N-4).
 * - Signed in or holding a personal link for this trip → straight to the trip.
 * - Otherwise → the trip's group link (FR-6), which handles code + approval; until the joining
 *   slice exposes one, sign-in then the trip.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, members, asService } from "@wandr/db";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { getPublicShare, groupLinkFor } from "@/server/share";

export async function GET(request: NextRequest, ctx: RouteContext<"/s/[kind]/[id]/open">) {
  const { kind, id } = await ctx.params;
  const db = await getDb();
  const share = await getPublicShare(db, kind, id);
  if (!share) return NextResponse.redirect(new URL(routes.home, request.url));
  const trip = routes.trip(share.tripId);

  const session = await getSession();
  if (session.links.some((g) => g.tripId === share.tripId)) return NextResponse.redirect(new URL(trip, request.url));
  if (session.user && !session.user.provisional) {
    const userId = session.user.userId;
    const [m] = await asService(db, (tx) =>
      tx
        .select({ status: members.status })
        .from(members)
        .where(and(eq(members.tripId, share.tripId), eq(members.userId, userId))),
    );
    if (m?.status === "active") return NextResponse.redirect(new URL(trip, request.url));
  }
  const group = await groupLinkFor(share.tripId);
  return NextResponse.redirect(new URL(group ?? routes.signin(trip), request.url));
}
