/**
 * GET /api/v1/trips/:tripId: the trip as the caller sees it (RLS: blind voting FR-41/42, surprise
 * items FR-91). Not a member → 404, so trip ids can't be probed.
 */
import { handler, notFound, ok, requireApiUser, uuidParam } from "@/lib/api/v1";
import { tripDetail } from "@/server/api-v1";

export const GET = handler(async (request: Request, ctx: RouteContext<"/api/v1/trips/[tripId]">) => {
  const { db, user } = await requireApiUser(request);
  const tripId = uuidParam((await ctx.params).tripId);
  const detail = await tripDetail(db, user.userId, tripId);
  if (!detail) throw notFound();
  return ok("trip", detail);
});
