"use server";

/**
 * Stages, Stops, attendance and idea-status actions (§6.0, FR-45/49/50). Organizer actions and
 * attendance need a verified code (FR-5: personal links only view and vote).
 */
import { refresh } from "next/cache";
import { z } from "zod";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { queueStopGeocode } from "@/server/geocode";
import {
  addStop,
  keepCityInStop,
  moveStage,
  moveStop,
  PlanningError,
  removeStop,
  setAttendance,
  setIdeaStatus,
  setNotMyPick,
  shortlistIdeas,
  undoStageMove,
  updateStop,
  type MoveStageResult,
  type RemoveStopResult,
  type UpdateStopResult,
} from "@/server/planning";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; signin?: string };

const MESSAGES: Record<string, string> = {
  not_a_member: "You're not on this trip.",
  organizers_only: "Only organizers can do that.",
  not_found: "That's gone. Refresh and try again.",
  invalid: "That doesn't look right.",
  name_required: "Give it a name.",
  first_stop_name_required: "Name your first stop too.",
  not_allowed: "You can only change that for yourself or someone you manage.",
  last_stop: "A trip needs at least one Stop.",
  vote_first: "Vote first.",
};

function failure(e: unknown, tripId: string, back = "stops"): { ok: false; error: string; signin?: string } {
  if (e instanceof AuthError) {
    return { ok: false, error: "Confirm your number first.", signin: routes.signin(`${routes.trip(tripId)}/${back}`) };
  }
  if (e instanceof PlanningError) return { ok: false, error: MESSAGES[e.message] ?? MESSAGES[e.code] ?? "Not allowed." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

async function ctx(tripId: string) {
  await requireFull();
  return tripContext(tripId);
}

const stage = z.enum(["where", "when", "stay", "getting_around", "do"]);
const stageAction = z.enum(["start_voting", "back_to_collecting", "set", "mark_not_needed", "reopen", "restore"]);
const stageStatus = z.enum(["collecting", "voting", "set", "not_needed"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export async function moveStageAction(
  tripId: string,
  stageKind: string,
  action: string,
  confirmed = false,
): Promise<{ ok: true; result: MoveStageResult } | { ok: false; error: string; signin?: string }> {
  try {
    const { db, claims } = await ctx(tripId);
    const result = await moveStage(db, claims, {
      tripId,
      stage: stage.parse(stageKind),
      action: stageAction.parse(action),
      confirmed,
    });
    if (result.ok) {
      if (input.name !== undefined) await queueStopGeocode(tripId, { force: true }); // a rename re-geocodes
      refresh();
    }
    return { ok: true, result };
  } catch (e) {
    return failure(e, tripId);
  }
}

export async function undoStageAction(tripId: string, stageKind: string, from: string, to: string): Promise<ActionResult> {
  try {
    const { db, claims } = await ctx(tripId);
    await undoStageMove(db, claims, { tripId, stage: stage.parse(stageKind), from: stageStatus.parse(from), to: stageStatus.parse(to) });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

export async function addStopAction(
  tripId: string,
  input: { name: string; firstStopName?: string | null; cityIdeaId?: string | null },
): Promise<ActionResult> {
  try {
    const { db, claims } = await ctx(tripId);
    const r = await addStop(db, claims, {
      tripId,
      name: z.string().max(60).parse(input.name),
      firstStopName: input.firstStopName ? z.string().max(60).parse(input.firstStopName) : null,
      cityIdeaId: input.cityIdeaId ? z.uuid().parse(input.cityIdeaId) : null,
    });
    await queueStopGeocode(tripId, { force: true }); // FR-S6 / FR-O16
    refresh();
    return { ok: true, message: r.moved ? `Added ${input.name.trim()} and moved ${r.moved} ${r.moved === 1 ? "idea" : "ideas"}.` : `Added ${input.name.trim()}.` };
  } catch (e) {
    return failure(e, tripId);
  }
}

export async function keepCityAction(tripId: string, city: string, stopId: string): Promise<ActionResult> {
  try {
    const { db, claims } = await ctx(tripId);
    await keepCityInStop(db, claims, { tripId, city: z.string().max(80).parse(city), stopId: z.uuid().parse(stopId) });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

export async function updateStopAction(
  tripId: string,
  input: {
    stopId: string;
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
    nights?: number | null;
    choices?: Record<string, "shift" | "unschedule">;
  },
): Promise<{ ok: true; result: UpdateStopResult } | { ok: false; error: string; signin?: string }> {
  try {
    const { db, claims } = await ctx(tripId);
    const result = await updateStop(db, claims, {
      stopId: z.uuid().parse(input.stopId),
      name: input.name === undefined ? undefined : z.string().max(60).parse(input.name),
      startDate: input.startDate === undefined ? undefined : isoDate.parse(input.startDate || null),
      endDate: input.endDate === undefined ? undefined : isoDate.parse(input.endDate || null),
      nights: input.nights === undefined ? undefined : z.number().int().min(0).max(60).nullable().parse(input.nights),
      choices: input.choices ? z.record(z.string(), z.enum(["shift", "unschedule"])).parse(input.choices) : undefined,
    });
    if (result.ok) refresh();
    return { ok: true, result };
  } catch (e) {
    return failure(e, tripId);
  }
}

export async function moveStopAction(tripId: string, stopId: string, dir: -1 | 1): Promise<ActionResult> {
  try {
    const { db, claims } = await ctx(tripId);
    await moveStop(db, claims, { stopId: z.uuid().parse(stopId), dir: dir === -1 ? -1 : 1 });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

/**
 * S-5 / ST5: remove a city. Returns a preview (polls that close, plan items removed, expenses
 * unlinked) when there's more than ideas to move; call again with `confirmed` to apply.
 */
export async function removeStopAction(
  tripId: string,
  stopId: string,
  confirmed = false,
): Promise<{ ok: true; result: RemoveStopResult } | { ok: false; error: string; signin?: string }> {
  try {
    const { db, claims } = await ctx(tripId);
    const result = await removeStop(db, claims, { stopId: z.uuid().parse(stopId), confirmed });
    if (result.ok) refresh();
    return { ok: true, result };
  } catch (e) {
    return failure(e, tripId);
  }
}

/** FR-S7: your own attendance, a managed member's, or (organizers, Q13) anyone's. null = back to "assumed". */
export async function setAttendanceAction(
  tripId: string,
  stopId: string,
  memberId: string,
  attending: boolean | null,
): Promise<ActionResult> {
  try {
    const { db, claims } = await ctx(tripId);
    await setAttendance(db, claims, { stopId: z.uuid().parse(stopId), memberId: z.uuid().parse(memberId), attending });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

const settable = z.enum(["idea", "shortlisted", "planned", "dropped"]);

/** FR-49: returns the previous status so the toast can undo (P7). */
export async function setIdeaStatusAction(
  tripId: string,
  ideaId: string,
  status: string,
): Promise<(ActionResult & { previous?: string })> {
  try {
    const { db, claims } = await ctx(tripId);
    const previous = await setIdeaStatus(db, claims, { ideaId: z.uuid().parse(ideaId), status: settable.parse(status) });
    refresh();
    return { ok: true, previous: previous === "done" ? "planned" : previous };
  } catch (e) {
    return failure(e, tripId, "");
  }
}

/** FR-50: part of voting, so personal-link sessions may use it too (it only flags your own vote). */
export async function notMyPickAction(tripId: string, ideaId: string, on: boolean): Promise<ActionResult> {
  try {
    const { db, claims } = await tripContext(tripId);
    await setNotMyPick(db, claims, { tripId, ideaId: z.uuid().parse(ideaId), on });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId, "");
  }
}

export async function shortlistAction(tripId: string, ideaIds: string[]): Promise<ActionResult> {
  try {
    const { db, claims } = await ctx(tripId);
    await shortlistIdeas(db, claims, { tripId, ideaIds: z.array(z.uuid()).max(10).parse(ideaIds) });
    refresh();
    return { ok: true, message: `Shortlisted ${ideaIds.length}.` };
  } catch (e) {
    return failure(e, tripId, "");
  }
}
