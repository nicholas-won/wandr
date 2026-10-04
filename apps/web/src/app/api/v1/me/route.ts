/** GET /api/v1/me: who I am, my trips and how many saves I have (home screen). */
import { handler, ok, requireApiUser, ApiFail } from "@/lib/api/v1";
import { loadMe } from "@/server/api-v1";
import { countMySaves } from "@/server/library";
import { listMyTrips } from "@/server/trips";

export const GET = handler(async (request: Request) => {
  const { db, user } = await requireApiUser(request);
  const [me, trips, savedCount] = await Promise.all([
    loadMe(db, user.userId),
    listMyTrips(db, user.userId),
    countMySaves(db, user.userId),
  ]);
  if (!me) throw new ApiFail(401, "unauthorized", "Sign in to continue.");
  return ok("me", { me, trips: trips.map((t) => ({ id: t.id, name: t.name, size: t.size })), savedCount });
});
