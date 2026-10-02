"use server";

/**
 * Group link join (FR-6, FR-7, FR-15, FR-17, J-7, J-8, J-17):
 * name + number + age → code → (name check | request | join). The invite list is consulted only
 * after the code is verified, so the flow never reveals whether a number is on it.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@wandr/db";
import { AuthError, getSession, requireFull } from "@/lib/auth/session";
import { cleanDisplayName, requestCode, verifyCode } from "@/lib/auth/signin";
import { clientIp } from "@/lib/http";
import { routes } from "@/lib/routes";
import {
  confirmInviteName,
  inspectGroupLink,
  joinViaGroupLink,
  MembershipError,
  type JoinOutcome,
} from "@/server/membership";
import type { JoinState } from "./state";

const CODE_ERRORS = {
  invalid_sms: "That doesn't look like a phone number. Check it and try again.",
  invalid_email: "That doesn't look like an email address.",
  use_email: "Texts work for US and Canadian numbers for now. Use your email instead.",
  limited: "That's a lot of codes. Wait a few minutes, then try again.",
  captcha: "Quick check first: confirm you're human, then tap again.",
  unavailable: "We couldn't send a code just now. Try again soon.",
  expired: "That code expired. Let's send a new one.",
  locked: "Too many tries. Let's send a new code.",
} as const;

async function outcome(prev: JoinState, r: JoinOutcome): Promise<JoinState> {
  switch (r.kind) {
    case "joined":
      redirect(routes.trip(r.tripId));
    case "confirm_name":
      return { ...prev, step: "confirm", expectedName: r.expectedName, memberId: r.memberId, error: undefined };
    case "pending":
      // D65: organizers see requests in the app (count on the trip's People link), not by text.
      return { ...prev, step: "result", result: "pending", error: undefined };
    default:
      return { ...prev, step: "result", result: r.kind, error: undefined };
  }
}

export async function joinStep(token: string, prev: JoinState, formData: FormData): Promise<JoinState> {
  const intent = String(formData.get("intent") ?? "");
  const db = await getDb();

  if (intent === "switch") {
    return { ...prev, step: "details", channel: prev.channel === "sms" ? "email" : "sms", error: undefined };
  }
  if (intent === "back") return { ...prev, step: "details", error: undefined };

  if (intent === "details" || intent === "resend") {
    const name = intent === "resend" ? prev.name : cleanDisplayName(String(formData.get("name") ?? ""));
    const ageConfirmed = intent === "resend" ? prev.ageConfirmed : formData.get("age") === "on";
    if (!name) return { ...prev, error: "Add your name (up to 40 characters)." };
    if (!ageConfirmed) return { ...prev, name, error: "You need to be 13 or older to join with your own number." };
    const next: JoinState = { ...prev, name, ageConfirmed, error: undefined };

    const { user } = await getSession();
    if (user && !user.provisional && !user.needsRecheck) return { ...next, step: "joining" };

    const link = await inspectGroupLink(db, token);
    if (!link) return { ...next, step: "result", result: "link_off" };
    const input = intent === "resend" ? (prev.lastInput ?? "") : String(formData.get("destination") ?? "");
    const r = await requestCode({
      channel: prev.channel,
      input,
      ip: clientIp(await headers()),
      tripId: link.tripId, // FR-15 per-trip limit
      captchaToken: (formData.get("cf-turnstile-response") as string | null) ?? null,
    });
    if (r.ok) return { ...next, step: "code", display: r.display, lastInput: input };
    if (r.error === "use_email") return { ...next, channel: "email", error: CODE_ERRORS.use_email };
    const error =
      r.error === "invalid" ? CODE_ERRORS[prev.channel === "sms" ? "invalid_sms" : "invalid_email"] : CODE_ERRORS[r.error];
    return { ...next, error, captchaRequired: r.captchaRequired, lastInput: input };
  }

  if (intent === "verify") {
    const r = await verifyCode(String(formData.get("code") ?? ""));
    if (!r.ok) {
      if (r.error === "wrong") {
        const left = r.attemptsLeft ?? 0;
        return { ...prev, error: `That code didn't work. ${left} ${left === 1 ? "try" : "tries"} left.` };
      }
      return { ...prev, step: "details", error: CODE_ERRORS[r.error] };
    }
    // Continue in a fresh request so the new session cookie is read (the client auto-submits).
    return { ...prev, step: "joining", error: undefined };
  }

  try {
    if (intent === "join") {
      const user = await requireFull();
      return await outcome(
        prev,
        await joinViaGroupLink(db, { userId: user.userId, token, name: prev.name, ageConfirmed: prev.ageConfirmed }),
      );
    }
    if (intent === "confirm_yes" || intent === "confirm_no") {
      const user = await requireFull();
      if (!prev.memberId) return { ...prev, step: "details" };
      return await outcome(
        prev,
        await confirmInviteName(db, {
          userId: user.userId,
          token,
          memberId: prev.memberId,
          isMe: intent === "confirm_yes",
          name: prev.name,
        }),
      );
    }
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "recheck_required") return { ...prev, step: "result", result: "recheck" };
      return { ...prev, step: "details", error: "Let's confirm your number first." };
    }
    if (e instanceof MembershipError) {
      return { ...prev, step: "details", error: "Something didn't match. Check your details and try again." };
    }
    throw e; // includes Next's redirect signal
  }
  return prev;
}
