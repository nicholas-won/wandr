/**
 * CAPTCHA before repeated code requests (FR-15, J-16). Cloudflare Turnstile when configured;
 * otherwise a no-op that always passes (dev).
 */
import { env } from "@/lib/env";

export interface CaptchaVerifier {
  /** False for the no-op verifier: callers skip the challenge entirely. */
  readonly enabled: boolean;
  verify(token: string | null | undefined, ip: string | null): Promise<boolean>;
}

export const noopCaptcha: CaptchaVerifier = {
  enabled: false,
  async verify() {
    return true;
  },
};

export function turnstileVerifier(secret: string): CaptchaVerifier {
  return {
    enabled: true,
    async verify(token, ip) {
      if (!token) return false;
      const body = new URLSearchParams({ secret, response: token });
      if (ip) body.set("remoteip", ip);
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body,
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    },
  };
}

export function getCaptcha(): CaptchaVerifier {
  const secret = env().TURNSTILE_SECRET_KEY;
  return secret ? turnstileVerifier(secret) : noopCaptcha;
}
