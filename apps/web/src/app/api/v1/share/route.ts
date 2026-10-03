/**
 * POST /api/v1/share: the OS share sheet (FR-21). Whatever was shared goes to a trip (as an idea)
 * or to "Save for someday" (the library), through the same capture paths as the web.
 */
import { endpoints } from "@wandr/api-contract";
import { handler, notFound, ok, readBody, requireApiUser, uuidParam } from "@/lib/api/v1";
import { activeMember, addLibrarySave, addTripIdea, LIBRARY_DESTINATION, tripDestinationLabel } from "@/server/api-v1";

export const POST = handler(async (request: Request) => {
  const { db, user } = await requireApiUser(request);
  const body = await readBody(request, endpoints.shareIntake.body);
  if (body.target.type === "library") {
    const savedIdeaId = await addLibrarySave(db, user.userId, body.raw);
    return ok("shareIntake", { ideaId: null, savedIdeaId, destination: LIBRARY_DESTINATION }, 201);
  }
  const tripId = uuidParam(body.target.tripId);
  const member = await activeMember(db, user.userId, tripId);
  if (!member) throw notFound();
  const ideaId = await addTripIdea(db, { userId: user.userId, tripId, memberId: member.memberId, raw: body.raw });
  return ok("shareIntake", { ideaId, savedIdeaId: null, destination: tripDestinationLabel(member.tripName) }, 201);
});
