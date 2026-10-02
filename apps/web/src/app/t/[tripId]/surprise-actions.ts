"use server";

import { refresh } from "next/cache";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { setBachMode, setGuestOfHonor, setIdeaHiddenFrom } from "@/server/surprise";
import type { ActionResult } from "./actions";

function fail(e: unknown, tripId: string): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: "Confirm your number first.", signin: routes.signin(routes.trip(tripId)) };
  if (e instanceof Error && e.message === "not_allowed") return { ok: false, error: "Only organizers can do that." };
  if (e instanceof Error && e.message === "group_only") return { ok: false, error: "Bachelor/bachelorette mode is for groups of 3 or more." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

/** FR-91: hide an idea from these members (settings change → needs a code, FR-5). */
export async function setIdeaSurpriseAction(tripId: string, ideaId: string, memberIds: string[]): Promise<ActionResult> {
  try {
    await requireFull();
    const { db, claims } = await tripContext(tripId);
    const hidden = await setIdeaHiddenFrom(db, claims, { ideaId, memberIds });
    refresh();
    return { ok: true, message: hidden.length ? "Hidden. They won't see it anywhere." : "Visible to everyone again." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-90 */
export async function setGuestOfHonorAction(tripId: string, memberId: string, on: boolean): Promise<ActionResult> {
  try {
    await requireFull();
    const { db, claims } = await tripContext(tripId);
    await setGuestOfHonor(db, claims, { tripId, memberId, on });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** §6.7 opt-in */
export async function setBachModeAction(tripId: string, on: boolean): Promise<ActionResult> {
  try {
    await requireFull();
    const { db, claims } = await tripContext(tripId);
    await setBachMode(db, claims, { tripId, on });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}
