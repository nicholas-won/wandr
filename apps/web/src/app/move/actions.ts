"use server";

import { redirect } from "next/navigation";
import { getDb } from "@wandr/db";
import { requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { EVENTS } from "@/inngest/client";
import { enqueue } from "@/server/jobs";
import { moveIdeaToLibrary, moveSaveToTrip } from "@/server/text-intake";

export type MoveState = { error?: string } | undefined;

/**
 * LB-7: a texted-in idea went to the wrong trip → the sender's library. Needs a code (FR-5).
 * TX7: if others voted on it, the page warns first and passes `confirmVotesLost`.
 */
export async function moveIdeaToLibraryAction(ideaId: string, confirmVotesLost = false): Promise<MoveState> {
  const user = await requireFull().catch(() => null);
  if (!user) redirect(routes.signin(`/move/${ideaId}`));
  const r = await moveIdeaToLibrary(await getDb(), user.userId, ideaId, { confirmVotesLost });
  if (!r.ok) {
    return {
      error:
        r.error === "confirm_votes_lost"
          ? "People voted on it since you opened this page. Reload to see the warning."
          : "We couldn't move that idea.",
    };
  }
  redirect(`${routes.home}?moved=library`);
}

/** LB-7 / FR-L12: a texted-in library save was meant for a trip. */
export async function moveSaveToTripAction(savedIdeaId: string, tripId: string): Promise<MoveState> {
  const user = await requireFull().catch(() => null);
  if (!user) redirect(routes.signin(`/move/saved/${savedIdeaId}`));
  const r = await moveSaveToTrip(await getDb(), user.userId, savedIdeaId, tripId);
  if (!r.ok || !r.ideaId) return { error: "We couldn't move that idea." };
  await enqueue({ name: EVENTS.ideaAdded, data: { ideaId: r.ideaId } });
  redirect(routes.trip(tripId));
}
