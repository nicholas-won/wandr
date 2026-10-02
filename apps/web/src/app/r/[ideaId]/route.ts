/**
 * Booking/source link click tracking (D47, §11): plain links only, no affiliate params.
 * Redirects only to a URL already stored on that idea (no open redirect), for members who can
 * see the idea (RLS).
 */
import { NextResponse, after, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ideas, ideaSources, withSession } from "@wandr/db";
import { detectLodging } from "@wandr/ai";
import { tripContext } from "@/server/context";
import { track } from "@/server/analytics";

export async function GET(req: NextRequest, ctx: RouteContext<"/r/[ideaId]">) {
  const { ideaId } = await ctx.params;
  const tripId = req.nextUrl.searchParams.get("t") ?? "";
  const { db, claims } = await tripContext(tripId);
  const found = await withSession(db, claims, async (tx) => {
    const [idea] = await tx.select().from(ideas).where(eq(ideas.id, ideaId));
    if (!idea) return null;
    const [src] = await tx.select({ url: ideaSources.url }).from(ideaSources).where(eq(ideaSources.ideaId, ideaId));
    const cache = idea.placeCache as { websiteUri?: string | null; mapsUri?: string | null } | null;
    const which = req.nextUrl.searchParams.get("to");
    const url = which === "website" ? cache?.websiteUri : which === "maps" ? cache?.mapsUri : src?.url;
    return url ? { url, idea } : null;
  }).catch(() => null);
  if (!found || !/^https?:\/\//i.test(found.url)) return NextResponse.redirect(new URL("/", req.url));
  after(() =>
    track(db, {
      name: "booking_link_click",
      tripId: found.idea.tripId,
      memberId: claims.link_member ?? null,
      props: {
        ideaId,
        category: found.idea.category,
        status: found.idea.status,
        provider: detectLodging(found.url)?.provider ?? new URL(found.url).hostname,
      },
    }),
  );
  return NextResponse.redirect(found.url, { headers: { "Referrer-Policy": "no-referrer" } });
}
