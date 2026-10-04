/** POST /api/v1/library/saves: save a link or idea "for someday" (FR-L1); auto-sorted in the background (FR-L3). */
import { endpoints } from "@wandr/api-contract";
import { handler, ok, readBody, requireApiUser } from "@/lib/api/v1";
import { addLibrarySave } from "@/server/api-v1";

export const POST = handler(async (request: Request) => {
  const { db, user } = await requireApiUser(request);
  const body = await readBody(request, endpoints.saveToLibrary.body);
  const savedIdeaId = await addLibrarySave(db, user.userId, body.raw);
  return ok("saveToLibrary", { savedIdeaId }, 201);
});
