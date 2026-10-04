/**
 * POST /api/v1/trips/:tripId/ideas: paste a link or type an idea (FR-20). The card appears at
 * once as "processing"; resolution runs in the background (FR-23, FR-30–35). Fetched captions are
 * untrusted data (C-20/C-21), handled by the same pipeline as the web.
 */
import { endpoints } from "@wandr/api-contract";
import { handler, notFound, ok, readBody, requireApiUser, uuidParam } from "@/lib/api/v1";
import { activeMember, addTripIdea } from "@/server/api-v1";

export const POST = handler(async (request: Request, ctx: RouteContext<"/api/v1/trips/[tripId]/ideas">) => {
  const { db, user } = await requireApiUser(request);
  const tripId = uuidParam((await ctx.params).tripId);
  const body = await readBody(request, endpoints.addIdea.body);
  const member = await activeMember(db, user.userId, tripId);
  if (!member) throw notFound();
  const ideaId = await addTripIdea(db, { userId: user.userId, tripId, memberId: member.memberId, raw: body.raw });
  return ok("addIdea", { ideaId }, 201);
});
