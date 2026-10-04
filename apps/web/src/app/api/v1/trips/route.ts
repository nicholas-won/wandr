/** POST /api/v1/trips: start a trip (FR-1(b); every field optional, P1; verified people only, D74). */
import { endpoints } from "@wandr/api-contract";
import { handler, ok, readBody, requireApiUser } from "@/lib/api/v1";
import { ownerName } from "@/server/api-v1";
import { track } from "@/server/analytics";
import { createTrip, DEFAULT_TRIP_NAME } from "@/server/trips";

export const POST = handler(async (request: Request) => {
  const { db, user } = await requireApiUser(request);
  const body = await readBody(request, endpoints.createTrip.body);
  const destinations = (body.destinations ?? []).map((d) => d.trim()).filter(Boolean);
  // Same default as the web's classic setup.
  const name = body.name?.trim() || (destinations.length ? `${destinations.join(" + ")} trip` : DEFAULT_TRIP_NAME);
  const { tripId, memberId } = await createTrip(db, {
    userId: user.userId,
    ownerName: await ownerName(db, user.userId),
    name,
    destinations,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
  });
  await track(db, { name: "trip_created", tripId, memberId, props: { via: "app", destinations: destinations.length } });
  return ok("createTrip", { tripId }, 201);
});
