"use server";

/** Trip settings for organizers (FR-6, FR-7, FR-10, J-7) and the owner (FR-2, FR-3). Code required (FR-5). */
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import {
  deleteTrip,
  MembershipError,
  regenerateGroupLink,
  transferOwnership,
  updateJoinSettings,
} from "@/server/membership";
import type { ActionResult } from "../actions";

async function full(tripId: string) {
  const user = await requireFull();
  const { db } = await tripContext(tripId);
  return { user, db };
}

function fail(e: unknown, tripId: string): ActionResult {
  if (e instanceof AuthError) {
    return { ok: false, error: "Confirm your number first.", signin: routes.signin(`${routes.trip(tripId)}/settings`) };
  }
  if (e instanceof MembershipError) {
    const error =
      e.code === "not_allowed"
        ? "Only organizers can change this."
        : e.code === "confirmation_mismatch"
          ? "Type the trip name exactly to confirm."
          : "Pick someone else.";
    return { ok: false, error };
  }
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

/** FR-6 / FR-10: create the group link, or replace it (the old one stops working). */
export async function regenerateGroupLinkAction(tripId: string): Promise<ActionResult & { url?: string }> {
  try {
    const { db, user } = await full(tripId);
    const url = await regenerateGroupLink(db, user.userId, tripId);
    refresh();
    return { ok: true, url };
  } catch (e) {
    return fail(e, tripId);
  }
}

const settings = z.object({
  inviteListOnly: z.boolean().optional(),
  outsiderName: z.string().max(60).nullable().optional(),
});

/** FR-7 invite-list-only; J-7 name shown to people who aren't in yet. */
export async function updateJoinSettingsAction(tripId: string, patch: unknown): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await updateJoinSettings(db, user.userId, tripId, settings.parse(patch));
    refresh();
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** JR3: the owner deletes the trip for everyone (typed confirmation). Soft delete; money history kept. */
export async function deleteTripAction(tripId: string, confirmation: string): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await deleteTrip(db, { userId: user.userId, tripId, confirmation: z.string().max(200).parse(confirmation) });
  } catch (e) {
    return fail(e, tripId);
  }
  redirect(`${routes.home}?deleted=1`);
}

/** FR-2: the owner hands the trip to someone else and becomes an organizer. */
export async function transferOwnershipAction(tripId: string, toMemberId: string): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await transferOwnership(db, { userId: user.userId, tripId, toMemberId: z.string().uuid().parse(toMemberId) });
    refresh();
    return { ok: true, message: "Ownership transferred. You're an organizer now." };
  } catch (e) {
    return fail(e, tripId);
  }
}
