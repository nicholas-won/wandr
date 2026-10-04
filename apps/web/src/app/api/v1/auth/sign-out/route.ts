/**
 * POST /api/v1/auth/sign-out. Tokens are stateless: the app drops its token. If the app sends its
 * push token, this device stops getting the person's pushes (FR-87). Always succeeds.
 */
import { and, eq } from "drizzle-orm";
import { endpoints } from "@wandr/api-contract";
import { asService, getDb, pushTokens } from "@wandr/db";
import { getApiUser } from "@/lib/auth/bearer";
import { handler, ok, readBody } from "@/lib/api/v1";

export const POST = handler(async (request: Request) => {
  const body = await readBody(request, endpoints.signOut.body);
  const user = await getApiUser(request);
  if (user && body.expoPushToken) {
    const db = await getDb();
    await asService(db, (tx) =>
      tx.delete(pushTokens).where(and(eq(pushTokens.userId, user.userId), eq(pushTokens.token, body.expoPushToken!))),
    );
  }
  return ok("signOut", { ok: true });
});
