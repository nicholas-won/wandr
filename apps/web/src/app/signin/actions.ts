"use server";

/** Sign-in steps (FR-5, FR-14, FR-15, FR-16): contact → code → name (new people only). */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestCode, setDisplayName, verifyCode } from "@/lib/auth/signin";
import { clientIp, safeNextPath } from "@/lib/http";
import { routes } from "@/lib/routes";
import type { SignInState } from "./state";

const MESSAGES = {
  invalid_sms: "That doesn't look like a phone number. Check it and try again.",
  invalid_email: "That doesn't look like an email address.",
  use_email: "Texts work for US and Canadian numbers for now. Use your email instead.",
  limited: "That's a lot of codes. Wait a few minutes, then try again.",
  captcha: "Quick check first: confirm you're human, then tap again.",
  unavailable: "We couldn't send a code just now. Try again soon, or use email.",
  expired: "That code expired. Let's send a new one.",
  locked: "Too many tries. Let's send a new code.",
  name: "Add a name between 1 and 40 characters.",
} as const;

export async function signInStep(prev: SignInState, formData: FormData): Promise<SignInState> {
  const intent = String(formData.get("intent") ?? "");
  const next = safeNextPath(prev.next, routes.home);

  if (intent === "back") return { step: "contact", channel: prev.channel, next };
  if (intent === "switch") {
    return { step: "contact", channel: prev.channel === "sms" ? "email" : "sms", next };
  }

  if (intent === "request" || intent === "resend") {
    const channel = prev.channel;
    const input = intent === "resend" ? (prev.lastInput ?? "") : String(formData.get("destination") ?? "");
    const r = await requestCode({
      channel,
      input,
      ip: clientIp(await headers()),
      captchaToken: (formData.get("cf-turnstile-response") as string | null) ?? null,
    });
    if (r.ok) return { step: "code", channel, display: r.display, lastInput: input, next };
    if (r.error === "use_email") {
      return { step: "contact", channel: "email", error: MESSAGES.use_email, next };
    }
    const error = r.error === "invalid" ? MESSAGES[channel === "sms" ? "invalid_sms" : "invalid_email"] : MESSAGES[r.error];
    return { step: "contact", channel, error, captchaRequired: r.captchaRequired, lastInput: input, next };
  }

  if (intent === "verify") {
    const r = await verifyCode(String(formData.get("code") ?? ""));
    if (!r.ok) {
      if (r.error === "wrong") {
        const left = r.attemptsLeft ?? 0;
        return { ...prev, error: `That code didn't work. ${left} ${left === 1 ? "try" : "tries"} left.` };
      }
      return { step: "contact", channel: prev.channel, error: MESSAGES[r.error], lastInput: prev.lastInput, next };
    }
    if (r.needsName) return { step: "name", channel: prev.channel, next };
    redirect(next);
  }

  if (intent === "name") {
    const r = await setDisplayName(String(formData.get("name") ?? ""));
    if (!r.ok) return { ...prev, error: MESSAGES.name };
    redirect(next);
  }

  return prev;
}
