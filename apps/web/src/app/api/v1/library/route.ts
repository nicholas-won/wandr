/** GET /api/v1/library: my own saves, newest first (FR-L6). Never other people's board items. */
import { handler, ok, requireApiUser } from "@/lib/api/v1";
import { toSaveCard } from "@/server/api-v1";
import { listMySaves } from "@/server/library";

export const GET = handler(async (request: Request) => {
  const { db, user } = await requireApiUser(request);
  const saves = await listMySaves(db, user.userId);
  return ok("library", { saves: saves.map(toSaveCard) });
});
