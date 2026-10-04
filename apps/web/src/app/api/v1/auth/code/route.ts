/**
 * POST /api/v1/auth/code: send a sign-in code (FR-14, FR-15, D74). Same limits, CAPTCHA trigger,
 * spend cap and providers as the web; the signed challenge comes back in the body instead of a
 * cookie. Never reveals whether the number is known (J-17).
 */
import { endpoints } from "@wandr/api-contract";
import { startCodeChallenge } from "@/lib/auth/signin";
import { ApiFail, handler, ok, readBody } from "@/lib/api/v1";
import { clientIp } from "@/lib/http";

const ERRORS = {
  invalid: [400, "invalid_destination", "That doesn't look right. Check it and try again."],
  use_email: [400, "use_email", "Texts work for US and Canadian numbers for now. Use your email instead."],
  limited: [429, "rate_limited", "That's a lot of codes. Wait a few minutes, then try again."],
  // The app can't show the web CAPTCHA yet; treat it as a pause.
  captcha: [429, "captcha_required", "Too many code requests. Wait a few minutes, or sign in on the web."],
  unavailable: [503, "unavailable", "We couldn't send a code just now. Try again soon, or use email."],
} as const;

export const POST = handler(async (request: Request) => {
  const body = await readBody(request, endpoints.requestCode.body);
  const r = await startCodeChallenge({
    channel: body.channel,
    input: body.destination,
    ip: clientIp(request.headers),
    captchaToken: null,
  });
  if (!r.ok) {
    const [status, code, message] = ERRORS[r.error];
    throw new ApiFail(status, code, message);
  }
  return ok("requestCode", { challenge: r.challenge, display: r.display, testMode: r.testMode });
});
