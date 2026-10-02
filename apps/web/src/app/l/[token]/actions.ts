"use server";

import { redirect } from "next/navigation";
import { asService, getDb } from "@wandr/db";
import { acceptPersonalLink, declinePersonalLink, redeemPersonalLink } from "@/lib/auth/personal-link";
import { getSession } from "@/lib/auth/session";
import { attachVerifiedIdentity } from "@/server/membership";
import type { OpenLinkState } from "./state";

/** A signed-in invitee opening their own link: link the membership to their account (FR-5). */
async function attachIfSignedIn() {
  const { user } = await getSession();
  if (user && !user.provisional && !user.needsRecheck) {
    const db = await getDb();
    await asService(db, (tx) => attachVerifiedIdentity(tx, user.userId));
  }
}

/**
 * POST step of a personal link (FR-5, N-4): bind this device. Goes straight in only when nothing
 * needs confirming; otherwise returns the trip preview (Q37 accept, Q1 name check).
 */
export async function openLinkAction(token: string, _prev: OpenLinkState, _form: FormData): Promise<OpenLinkState> {
  void _prev;
  void _form;
  const r = await redeemPersonalLink(token);
  if (!r.ok) return { error: r.error };
  if ("confirm" in r) return { step: r.confirm, preview: r.preview };
  await attachIfSignedIn();
  redirect(r.redirectTo);
}

/** Q37 "Accept invitation" / Q1 "That's me" (with an optional edited name). A separate POST. */
export async function acceptLinkAction(token: string, prev: OpenLinkState, form: FormData): Promise<OpenLinkState> {
  const raw = form.get("name");
  const r = await acceptPersonalLink(token, typeof raw === "string" ? raw : null);
  if (!r.ok) return { ...prev, error: r.error };
  await attachIfSignedIn();
  redirect(r.redirectTo);
}

/** Q37 "Not me": nothing joins; the link is released from this device. */
export async function notMeAction(token: string, _prev: OpenLinkState, _form: FormData): Promise<OpenLinkState> {
  void _prev;
  void _form;
  await declinePersonalLink(token);
  return { notMe: true };
}

/** One entry point for the page's forms: `intent` = open | accept | not_me. All POST. */
export async function linkAction(token: string, prev: OpenLinkState, form: FormData): Promise<OpenLinkState> {
  switch (form.get("intent")) {
    case "accept":
      return acceptLinkAction(token, prev, form);
    case "not_me":
      return notMeAction(token, prev, form);
    default:
      return openLinkAction(token, prev, form);
  }
}
