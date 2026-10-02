"use server";

/** Poll actions (FR-47/48, FR-S12, FR-92, FR-T7). Voting works from a personal link (FR-5). */
import { refresh } from "next/cache";
import { z } from "zod";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import {
  closePollEarly,
  createPoll,
  decidePoll,
  extendPoll,
  PollError,
  runoffPoll,
  setPollPaused,
  votePoll,
} from "@/server/polls";

export type ActionResult = { ok: true; message?: string; pollId?: string } | { ok: false; error: string; signin?: string };

const MESSAGES: Record<string, string> = {
  question_required: "Ask a question.",
  question_too_long: "Keep the question under 140 characters.",
  too_few_options: "Add at least 2 options.",
  too_many_options: "Up to 10 options.",
  option_label_required: "Every option needs a name.",
  option_label_too_long: "Keep options under 80 characters.",
  duplicate_options: "Two options are the same.",
  bad_image_url: "Image links must start with https://",
  deadline_too_soon: "Pick a deadline at least 10 minutes away.",
  deadline_too_far: "Pick a deadline within 60 days.",
  not_a_member: "You're not on this trip.",
  organizers_only: "Only organizers can do that.",
  not_available_for_trip_size: "Polls appear once someone else joins.",
  not_found: "That poll is gone.",
  bad_stop: "Pick a Stop on this trip.",
  bad_idea: "Pick ideas from this trip.",
  not_eligible: "Only people going to this Stop vote here.",
  not_open: "This poll isn't open.",
  not_allowed: "Not allowed.",
};

function failure(e: unknown, tripId: string): { ok: false; error: string; signin?: string } {
  if (e instanceof AuthError) {
    return { ok: false, error: "Confirm your number first.", signin: routes.signin(`${routes.trip(tripId)}/polls`) };
  }
  if (e instanceof PollError) return { ok: false, error: MESSAGES[e.code] ?? "Not allowed." };
  if (e instanceof Error && /attending this Stop/.test(e.message)) return { ok: false, error: MESSAGES.not_eligible! };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

export async function votePollAction(tripId: string, pollId: string, optionId: string | null): Promise<ActionResult> {
  try {
    const { db, claims } = await tripContext(tripId);
    await votePoll(db, claims, { tripId, pollId: z.uuid().parse(pollId), optionId: optionId ? z.uuid().parse(optionId) : null });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

const createSchema = z.object({
  question: z.string().max(200),
  kind: z.enum(["ideas", "custom"]),
  stopId: z.uuid().nullable(),
  stage: z.enum(["where", "when", "stay", "getting_around", "do"]).nullable(),
  /** Absolute instant from the browser (S-14: deadlines are instants). */
  closesAt: z.iso.datetime({ offset: true }).nullable(),
  options: z
    .array(z.object({ label: z.string().max(200), ideaId: z.uuid().nullable(), imageUrl: z.string().max(2048).nullable() }))
    .max(12),
});

export async function createPollAction(tripId: string, input: z.input<typeof createSchema>): Promise<ActionResult> {
  try {
    await requireFull();
    const v = createSchema.parse(input);
    const { db, claims } = await tripContext(tripId);
    const pollId = await createPoll(db, claims, {
      tripId,
      question: v.question,
      kind: v.kind,
      stopId: v.stopId,
      stage: v.stage,
      closesAt: v.closesAt ? new Date(v.closesAt) : null,
      options: v.options,
    });
    refresh();
    return { ok: true, pollId };
  } catch (e) {
    return failure(e, tripId);
  }
}

type Manage = "close" | "pause" | "resume" | "extend" | "runoff" | "pick";

export async function managePollAction(tripId: string, pollId: string, action: Manage, optionId?: string): Promise<ActionResult> {
  try {
    await requireFull();
    const { db, claims } = await tripContext(tripId);
    const id = z.uuid().parse(pollId);
    let newId: string | undefined;
    switch (action) {
      case "close":
        await closePollEarly(db, claims, { tripId, pollId: id });
        break;
      case "pause":
      case "resume":
        await setPollPaused(db, claims, { tripId, pollId: id, paused: action === "pause" });
        break;
      case "extend":
        await extendPoll(db, claims, { tripId, pollId: id });
        break;
      case "runoff":
        newId = await runoffPoll(db, claims, { tripId, pollId: id });
        break;
      case "pick":
        await decidePoll(db, claims, { tripId, pollId: id, optionId: z.uuid().parse(optionId) });
        break;
    }
    refresh();
    return { ok: true, pollId: newId };
  } catch (e) {
    return failure(e, tripId);
  }
}
