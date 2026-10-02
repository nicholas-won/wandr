"use server";

/** People page actions (FR-2, FR-8, FR-9, FR-11, M-4, M-11, FR-T3..T5). All need a code (FR-5). */
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { money } from "@wandr/core";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import {
  addManagedMember,
  balanceFor,
  decideJoinRequest,
  leaveTrip,
  MembershipError,
  removeMember,
  restoreMember,
  setOrganizer,
} from "@/server/membership";
import { markNoticeSeen } from "@/server/trips";
import type { ActionResult } from "../actions";

const MESSAGES: Record<MembershipError["code"], string> = {
  not_allowed: "Only organizers can do that.",
  not_found: "That person isn't here any more.",
  owner_cannot_leave: "Hand the trip to someone else first.",
  resolve_balance_first: "Settle their balance first.",
  bad_target: "Pick someone else.",
  no_anchor_expense: "Their balance can't be moved automatically. Record a payment instead.",
  expired: "That's too old to undo now.",
  invalid: "Check the details and try again.",
};

async function full(tripId: string) {
  const user = await requireFull();
  const ctx = await tripContext(tripId);
  return { user, ...ctx };
}

function fail(e: unknown, tripId: string): ActionResult {
  if (e instanceof AuthError) {
    return { ok: false, error: "Confirm your number first.", signin: routes.signin(`${routes.trip(tripId)}/people`) };
  }
  if (e instanceof MembershipError) return { ok: false, error: MESSAGES[e.code] };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

const id = z.string().uuid();

/** FR-8: one-tap approve or deny. */
export async function decideRequestAction(tripId: string, memberId: string, approve: boolean): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await decideJoinRequest(db, { userId: user.userId, tripId, memberId: id.parse(memberId), approve });
    refresh();
    return { ok: true, message: approve ? "Approved" : "Request denied" };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-2 / §6.10: make or unmake an organizer. */
export async function setOrganizerAction(tripId: string, memberId: string, organizer: boolean): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await setOrganizer(db, { userId: user.userId, tripId, memberId: id.parse(memberId), organizer });
    refresh();
    return { ok: true, message: organizer ? "Now an organizer" : "No longer an organizer" };
  } catch (e) {
    return fail(e, tripId);
  }
}

export type BalanceLine = { currency: string; balanceMinor: number; label: string };

/** FR-9 / M-4: the open balance to show before removing or leaving. */
export async function balanceAction(
  tripId: string,
  memberId: string,
): Promise<{ ok: true; balances: BalanceLine[] } | { ok: false; error: string; signin?: string }> {
  try {
    const { db, user } = await full(tripId);
    const rows = await balanceFor(db, user.userId, tripId, id.parse(memberId));
    return {
      ok: true,
      balances: rows.map((b) => ({
        ...b,
        label: money.formatMinor(Math.abs(b.balanceMinor), b.currency as money.CurrencyCode),
      })),
    };
  } catch (e) {
    return fail(e, tripId) as { ok: false; error: string };
  }
}

const resolution = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("reassign"), toMemberId: z.string().uuid() }),
    z.object({ kind: z.literal("split_group") }),
    z.object({ kind: z.literal("write_off") }),
  ])
  .optional();

/** FR-9: remove someone (not the owner); an open balance needs a resolution. */
export async function removeMemberAction(tripId: string, memberId: string, res?: unknown): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await removeMember(db, { userId: user.userId, tripId, memberId: id.parse(memberId), resolution: resolution.parse(res) });
    refresh();
    return { ok: true, message: "Removed. You can restore them for 30 days." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** M-11 */
export async function restoreMemberAction(tripId: string, memberId: string): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await restoreMember(db, { userId: user.userId, tripId, memberId: id.parse(memberId) });
    refresh();
    return { ok: true, message: "Restored. Send them a new link." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** M-4: leave the trip (balance shown first in the UI). */
export async function leaveTripAction(tripId: string): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await leaveTrip(db, { userId: user.userId, tripId });
  } catch (e) {
    return fail(e, tripId);
  }
  redirect(routes.home);
}

/** FR-11: add someone with no phone, by name. */
export async function addManagedAction(tripId: string, name: string): Promise<ActionResult> {
  try {
    const { db, user } = await full(tripId);
    await addManagedMember(db, { userId: user.userId, tripId, name });
    refresh();
    return { ok: true, message: `Added ${name.trim()}. You'll vote for them.` };
  } catch (e) {
    return fail(e, tripId);
  }
}

const notice = z.enum(["solo_to_duo", "duo_to_group", "group_to_duo", "duo_votes_visible"]);

/** FR-T3/T4/T5: record a one-time notice as seen (works from a personal link too). */
export async function dismissNoticeAction(tripId: string, memberId: string, id_: string): Promise<ActionResult> {
  try {
    const { db, claims } = await tripContext(tripId);
    await markNoticeSeen(db, claims, id.parse(memberId), notice.parse(id_));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}
