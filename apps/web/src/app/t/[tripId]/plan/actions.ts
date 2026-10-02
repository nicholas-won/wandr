"use server";

import { refresh } from "next/cache";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { after } from "next/server";
import { track } from "@/server/analytics";
import { addToPlan, applyPlan, updatePlanItem } from "@/server/plan";
import type { ActionResult } from "../actions";

async function full(tripId: string) {
  await requireFull();
  return tripContext(tripId);
}

function fail(e: unknown, tripId: string): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: "Confirm your number first.", signin: routes.signin(`${routes.trip(tripId)}/plan`) };
  if (e instanceof Error && e.message === "not_allowed") return { ok: false, error: "Only organizers can apply a plan." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

/** FR-O3: apply the previewed plan. */
export async function applyPlanAction(tripId: string, stopId: string | null): Promise<ActionResult> {
  try {
    const { db, claims } = await full(tripId);
    await applyPlan(db, claims, tripId, stopId);
    after(() => track(db, { name: "plan_applied", tripId, props: { stopId } }));
    refresh();
    return { ok: true, message: "Plan applied. Everyone can see it now." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-O4: lock an item, or move it to another day. */
export async function updatePlanItemAction(
  tripId: string,
  planItemId: string,
  patch: { locked?: boolean; dayIndex?: number },
): Promise<ActionResult> {
  try {
    const { db, claims } = await full(tripId);
    await updatePlanItem(db, claims, { planItemId, ...patch });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** D70 / C-Q27: place an idea on a day (and optionally a time) by hand. */
export async function addToPlanAction(
  tripId: string,
  stopId: string,
  ideaId: string,
  dayIndex: number,
  time: string | null,
): Promise<ActionResult> {
  try {
    const { db, claims } = await full(tripId);
    let startMinute: number | null = null;
    if (time) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(time);
      if (!m) return { ok: false, error: "Use a time like 19:30." };
      startMinute = Number(m[1]) * 60 + Number(m[2]);
    }
    await addToPlan(db, claims, { tripId, stopId, ideaId, dayIndex, startMinute });
    refresh();
    return { ok: true, message: "Added to the plan" };
  } catch (e) {
    return fail(e, tripId);
  }
}
