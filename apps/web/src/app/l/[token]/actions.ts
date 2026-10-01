"use server";

import { redirect } from "next/navigation";
import { redeemPersonalLink } from "@/lib/auth/personal-link";
import type { OpenLinkState } from "./state";

/** POST step of a personal link (FR-5, N-4): bind this device and grant view + vote. */
export async function openLinkAction(token: string, _prev: OpenLinkState, _form: FormData): Promise<OpenLinkState> {
  void _prev;
  void _form;
  const r = await redeemPersonalLink(token);
  if (r.ok) redirect(r.redirectTo);
  return { error: r.error };
}
