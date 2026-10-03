/** POST /api/v1/me/name: set my display name (sign-up's last step, D74). */
import { endpoints } from "@wandr/api-contract";
import { applyDisplayName } from "@/lib/auth/signin";
import { ApiFail, handler, ok, readBody, requireApiUser } from "@/lib/api/v1";
import { loadMe } from "@/server/api-v1";

export const POST = handler(async (request: Request) => {
  const { db, user } = await requireApiUser(request);
  const body = await readBody(request, endpoints.setName.body);
  const r = await applyDisplayName(db, user.userId, body.name);
  if (!r.ok) throw new ApiFail(400, "invalid_name", "Add a name between 1 and 40 characters.");
  const me = await loadMe(db, user.userId);
  if (!me) throw new ApiFail(401, "unauthorized", "Sign in to continue.");
  return ok("setName", { me });
});
