"use server";

/** Account page actions (FR-3, J-6, NFR-7). All need a verified session with no pending recheck. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb } from "@wandr/db";
import { AuthError, requireFull, signOut } from "@/lib/auth/session";
import { requestAccountEmailCode, setDisplayName, verifyAccountEmailCode } from "@/lib/auth/signin";
import { clientIp } from "@/lib/http";
import { routes } from "@/lib/routes";
import { AccountError, deleteAccount } from "@/server/account";

export type NameState = { saved?: boolean; error?: string };

export async function saveNameAction(_prev: NameState, form: FormData): Promise<NameState> {
  void _prev;
  try {
    await requireFull();
  } catch (e) {
    if (e instanceof AuthError) redirect(routes.signin(routes.account));
    throw e;
  }
  const r = await setDisplayName(String(form.get("name") ?? ""));
  if (!r.ok) return { error: "Add a name between 1 and 40 characters." };
  refresh();
  return { saved: true };
}

export type EmailState = { step: "enter" | "code" | "done"; display?: string; lastInput?: string; error?: string };

const EMAIL_ERRORS = {
  invalid: "That doesn't look like an email address.",
  no_email: "There's no email on your account yet.",
  limited: "That's a lot of codes. Wait a few minutes, then try again.",
  unavailable: "We couldn't send a code just now. Try again soon.",
  not_allowed: "Confirm it's you first.",
  expired: "That code expired. Let's send a new one.",
  locked: "Too many tries. Let's send a new code.",
  taken: "That email is already on another account. Sign in with it instead, or use a different one.",
} as const;

/** J-6: add (or change) an email so you can sign in when texts can't reach you. Code first. */
export async function emailStepAction(prev: EmailState, form: FormData): Promise<EmailState> {
  const intent = String(form.get("intent") ?? "");
  try {
    if (intent === "back") return { step: "enter", lastInput: prev.lastInput };
    if (intent === "request" || intent === "resend") {
      const input = intent === "resend" ? (prev.lastInput ?? "") : String(form.get("email") ?? "");
      const r = await requestAccountEmailCode("add_email", input, clientIp(await headers()));
      if (!r.ok) return { step: "enter", lastInput: input, error: EMAIL_ERRORS[r.error] };
      return { step: "code", display: r.display, lastInput: input };
    }
    if (intent === "verify") {
      const r = await verifyAccountEmailCode("add_email", String(form.get("code") ?? ""));
      if (r.ok) {
        refresh();
        return { step: "done" };
      }
      if (r.error === "wrong") {
        const left = r.attemptsLeft ?? 0;
        return { ...prev, error: `That code didn't work. ${left} ${left === 1 ? "try" : "tries"} left.` };
      }
      return { step: "enter", lastInput: prev.lastInput, error: EMAIL_ERRORS[r.error] };
    }
    return prev;
  } catch (e) {
    if (e instanceof AuthError) redirect(e.code === "recheck_required" ? routes.recheck(routes.account) : routes.signin(routes.account));
    throw e;
  }
}

export type DeleteState = { error?: string };

/** FR-3 / NFR-7: delete the account after the typed confirmation, then sign this device out. */
export async function deleteAccountAction(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  void _prev;
  let userId: string;
  try {
    userId = (await requireFull()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect(routes.signin(routes.accountDelete));
    throw e;
  }
  const picks: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("pick:") && typeof v === "string") picks[k.slice(5)] = v;
  }
  try {
    await deleteAccount(await getDb(), { userId, confirmation: String(form.get("confirm") ?? ""), picks });
  } catch (e) {
    if (e instanceof AccountError) {
      return { error: e.code === "confirmation_mismatch" ? "Type delete to confirm." : "Something changed. Reload and try again." };
    }
    console.error(e);
    return { error: "Something went wrong. Try again." };
  }
  await signOut({ links: true });
  redirect(`${routes.site}?account=deleted`);
}
