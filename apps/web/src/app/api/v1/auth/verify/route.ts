/**
 * POST /api/v1/auth/verify: check the code against the challenge and return a 60-day bearer
 * token (FR-5 full scope, J-6). Attempts are counted per challenge exactly as on the web (max 5);
 * a recycled number gets `needsRecheck` on its token (FR-16, J-4).
 */
import { endpoints } from "@wandr/api-contract";
import { issueApiToken } from "@/lib/auth/bearer";
import { checkCodeChallenge } from "@/lib/auth/signin";
import { ApiFail, handler, ok, readBody } from "@/lib/api/v1";
import { getDb } from "@wandr/db";
import { loadMe } from "@/server/api-v1";

export const POST = handler(async (request: Request) => {
  const body = await readBody(request, endpoints.verifyCode.body);
  const r = await checkCodeChallenge(body.challenge, body.code);
  if (!r.ok) {
    if (r.error === "wrong") {
      const left = r.attemptsLeft ?? 0;
      throw new ApiFail(400, "wrong_code", `That code didn't work. ${left} ${left === 1 ? "try" : "tries"} left.`);
    }
    if (r.error === "locked") throw new ApiFail(429, "locked", "Too many tries. Ask for a new code.");
    throw new ApiFail(400, "expired", "That code expired. Ask for a new one.");
  }
  const me = await loadMe(await getDb(), r.userId);
  if (!me) throw new ApiFail(500, "server_error", "Something went wrong. Try again.");
  const token = await issueApiToken({ userId: r.userId, needsRecheck: r.needsRecheck });
  return ok("verifyCode", { token, me });
});
