/**
 * POST /api/v1/push: register this device's Expo push token (FR-87). Upsert by token: a device
 * that signs in as someone else moves to them, so pushes follow whoever is signed in.
 */
import { endpoints } from "@wandr/api-contract";
import { asService, pushTokens } from "@wandr/db";
import { ApiFail, handler, ok, readBody, requireApiUser } from "@/lib/api/v1";

const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export const POST = handler(async (request: Request) => {
  const { db, user } = await requireApiUser(request);
  const body = await readBody(request, endpoints.registerPush.body);
  if (!EXPO_TOKEN.test(body.expoPushToken)) throw new ApiFail(400, "bad_request", "That isn't an Expo push token.");
  const now = new Date();
  await asService(db, (tx) =>
    tx
      .insert(pushTokens)
      .values({ userId: user.userId, token: body.expoPushToken, platform: body.platform, lastSeenAt: now })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId: user.userId, platform: body.platform, lastSeenAt: now },
      }),
  );
  return ok("registerPush", { ok: true });
});
