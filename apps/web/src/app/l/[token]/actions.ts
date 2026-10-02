"use server";

import { redirect } from "next/navigation";
import { asService, getDb } from "@wandr/db";
import { redeemPersonalLink } from "@/lib/auth/personal-link";
import { getSession } from "@/lib/auth/session";
import { attachVerifiedIdentity } from "@/server/membership";
import type { OpenLinkState } from "./state";

/** POST step of a personal link (FR-5, N-4): bind this device and grant view + vote. */
export async function openLinkAction(token: string, _prev: OpenLinkState, _form: FormData): Promise<OpenLinkState> {
  void _prev;
  void _form;
  const r = await redeemPersonalLink(token);
  if (r.ok) {
    // A signed-in invitee opening their own link: link the membership to their account (FR-5).
    const { user } = await getSession();
    if (user && !user.provisional && !user.needsRecheck) {
      const db = await getDb();
      await asService(db, (tx) => attachVerifiedIdentity(tx, user.userId));
    }
    redirect(r.redirectTo);
  }
  return { error: r.error };
}
