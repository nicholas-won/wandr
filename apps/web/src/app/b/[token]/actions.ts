"use server";

import { redirect } from "next/navigation";
import { redeemBoardLink } from "@/lib/auth/board-link";
import type { OpenBoardLinkState } from "./state";

/** POST step of a shared-board link (FR-L14, N-4): bind this device and grant view + add. */
export async function openBoardLinkAction(
  token: string,
  _prev: OpenBoardLinkState,
  _form: FormData,
): Promise<OpenBoardLinkState> {
  void _prev;
  void _form;
  const r = await redeemBoardLink(token);
  if (r.ok) redirect(r.redirectTo);
  return { error: r.error };
}
