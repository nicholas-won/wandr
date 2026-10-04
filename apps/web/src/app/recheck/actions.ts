"use server";

/** FR-16 / J-4: "Is this you?" after a long-inactive number signs in. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, signOut } from "@/lib/auth/session";
import { requestAccountEmailCode, verifyAccountEmailCode } from "@/lib/auth/signin";
import { clientIp, safeNextPath } from "@/lib/http";
import { routes } from "@/lib/routes";

export type RecheckState = { step: "start" | "code"; next: string; display?: string; error?: string };

const ERRORS = {
  invalid: "Something went wrong. Try again.",
  no_email: "There's no email on this account. Ask an organizer instead.",
  limited: "That's a lot of codes. Wait a few minutes, then try again.",
  unavailable: "We couldn't send a code just now. Try again soon.",
  not_allowed: "Something went wrong. Try again.",
  expired: "That code expired. Let's send a new one.",
  locked: "Too many tries. Let's send a new code.",
  taken: "Something went wrong. Try again.",
} as const;

export async function recheckStepAction(prev: RecheckState, form: FormData): Promise<RecheckState> {
  const intent = String(form.get("intent") ?? "");
  const next = safeNextPath(prev.next, routes.home);
  if (intent === "not_me") {
    await signOut({ links: true });
    redirect(routes.signin());
  }
  try {
    if (intent === "request") {
      const r = await requestAccountEmailCode("recheck", null, clientIp(await headers()));
      if (!r.ok) return { step: "start", next, error: ERRORS[r.error] };
      return { step: "code", next, display: r.display };
    }
    if (intent === "verify") {
      const r = await verifyAccountEmailCode("recheck", String(form.get("code") ?? ""));
      if (!r.ok) {
        if (r.error === "wrong") {
          const left = r.attemptsLeft ?? 0;
          return { ...prev, error: `That code didn't work. ${left} ${left === 1 ? "try" : "tries"} left.` };
        }
        return { step: "start", next, error: ERRORS[r.error] };
      }
    }
  } catch (e) {
    if (e instanceof AuthError) redirect(routes.signin(next));
    throw e;
  }
  if (intent === "verify") redirect(next);
  return prev;
}
