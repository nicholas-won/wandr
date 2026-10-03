/** POST /api/v1/trips/:tripId/ideas/:ideaId/vote: cast, change or clear (null) my vote (FR-40, FR-43). */
import { endpoints } from "@wandr/api-contract";
import { ApiFail, handler, notFound, ok, readBody, requireApiUser, uuidParam } from "@/lib/api/v1";
import { activeMember, canSeeIdea } from "@/server/api-v1";
import { castVote } from "@/server/trips";

export const POST = handler(async (request: Request, ctx: RouteContext<"/api/v1/trips/[tripId]/ideas/[ideaId]/vote">) => {
  const { db, user } = await requireApiUser(request);
  const params = await ctx.params;
  const tripId = uuidParam(params.tripId);
  const ideaId = uuidParam(params.ideaId);
  const body = await readBody(request, endpoints.vote.body);
  const member = await activeMember(db, user.userId, tripId);
  // A surprise idea hidden from me doesn't exist for me (FR-91).
  if (!member || !(await canSeeIdea(db, user.userId, tripId, ideaId))) throw notFound();
  try {
    await castVote(db, { sub: user.userId }, { tripId, ideaId, memberId: member.memberId, value: body.value });
  } catch (e) {
    console.error("[api/v1] vote refused", e);
    throw new ApiFail(403, "forbidden", "You can't vote on this right now.");
  }
  return ok("vote", { ok: true });
});
