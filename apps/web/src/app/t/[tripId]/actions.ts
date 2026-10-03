"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import {
  addIdea,
  addIdeaFromPlace,
  addListiclePicks,
  fixIdea,
  IdeaInputError,
  pickPlaceForIdea,
  searchPlacesForTrip,
} from "@/server/ideas";
import { PlacePickError, placeSearchConnected, type PlaceSearchOutcome } from "@/server/place-search";
import { EVENTS } from "@/inngest/client";
import { enqueue } from "@/server/jobs";
import { freshLinkFor, inviteMember } from "@/server/invites";
import { track } from "@/server/analytics";
import { castVote, getTripView, markNoticeSeen } from "@/server/trips";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; signin?: string };

const voteSchema = z.enum(["must", "down", "pass"]).nullable();

async function me(tripId: string) {
  const ctx = await tripContext(tripId);
  const view = await getTripView(ctx.db, ctx.claims, tripId);
  if (!view) throw new Error("not_a_member");
  return { ...ctx, view };
}

function failure(e: unknown, tripId: string, returnTo = routes.trip(tripId)): ActionResult {
  if (e instanceof AuthError) {
    return { ok: false, error: "Confirm your number first.", signin: routes.signin(returnTo) };
  }
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

/** FR-40/43: vote, change or clear. Personal-link sessions may vote (FR-5). */
export async function voteAction(tripId: string, ideaId: string, value: string | null): Promise<ActionResult> {
  try {
    const v = voteSchema.parse(value);
    const { db, claims, view } = await me(tripId);
    await castVote(db, claims, { tripId, ideaId, memberId: view.me.memberId, value: v });
    // No vote value in analytics: individual votes never leave the trip (FR-42).
    after(() => track(db, { name: "vote_cast", tripId, memberId: view.me.memberId, props: { ideaId } }));
    if (view.trip.size === "duo" && !view.me.noticesSeen.includes("duo_votes_visible")) {
      await markNoticeSeen(db, claims, view.me.memberId, "duo_votes_visible");
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

/** FR-20: paste a link or type an idea. The card appears at once; AI fills it in (FR-23). */
export async function addIdeaAction(tripId: string, raw: string): Promise<ActionResult> {
  try {
    if (!raw.trim()) return { ok: false, error: "Paste a link or type an idea." };
    const { db, claims, view, session } = await me(tripId);
    if (!session.user) {
      return { ok: false, error: "Confirm your number to add ideas.", signin: routes.signin(routes.trip(tripId)) };
    }
    const { ideaId } = await addIdea(db, claims, { tripId, memberId: view.me.memberId, raw });
    await enqueue({ name: EVENTS.ideaAdded, data: { ideaId } });
    after(() => track(db, { name: "idea_added", tripId, memberId: view.me.memberId, props: { ideaId, via: "web" } }));
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

export async function fixIdeaAction(tripId: string, ideaId: string, title: string): Promise<ActionResult> {
  try {
    const { db, claims, view } = await me(tripId);
    if (!title.trim()) return { ok: false, error: "Type a name." };
    const rows = await fixIdea(db, claims, { ideaId, title });
    if (rows.length === 0) {
      return { ok: false, error: "Confirm your number to fix ideas.", signin: routes.signin(routes.trip(tripId)) };
    }
    after(() => track(db, { name: "idea_fixed", tripId, memberId: view.me.memberId, props: { ideaId } }));
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

export async function pickListicleAction(tripId: string, ideaId: string, indexes: number[]): Promise<ActionResult> {
  try {
    const { db, claims } = await me(tripId);
    await addListiclePicks(db, claims, { ideaId, indexes });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

/** FR-4: invites reach other people, so they need a verified number (FR-1). */
export async function inviteAction(tripId: string, name: string, phone: string): Promise<ActionResult & { link?: string }> {
  try {
    const user = await requireFull();
    const { db } = await tripContext(tripId);
    const r = await inviteMember(db, { userId: user.userId, tripId, name, phone });
    if (!r.ok) {
      const msg = {
        invalid_phone: "That doesn't look like a US or Canadian mobile number.",
        not_allowed: "Only organizers can invite people.",
        limit: "Invite limit reached for today.",
        already_invited: "That number is already on the trip.",
      }[r.error];
      return { ok: false, error: msg };
    }
    after(() => track(db, { name: "invite_sent", tripId, props: { channel: r.channel } }));
    refresh();
    return {
      ok: true,
      link: r.link,
      message: r.texted ? `Texted ${name.trim()} their link.` : `Send ${name.trim()} their link yourself.`,
    };
  } catch (e) {
    return failure(e, tripId, `${routes.trip(tripId)}/people`);
  }
}

export async function shareLinkAction(tripId: string, memberId: string): Promise<ActionResult & { link?: string }> {
  try {
    const user = await requireFull();
    const { db } = await tripContext(tripId);
    const link = await freshLinkFor(db, { userId: user.userId, tripId, memberId });
    if (!link) return { ok: false, error: "Only organizers can share invite links." };
    return { ok: true, link: link.url };
  } catch (e) {
    return failure(e, tripId, `${routes.trip(tripId)}/people`);
  }
}

// --- Place search: "wrong place? fix" (FR-23) and add by hand (FR-L20). Never an AI import. ---

const placeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,300}$/);

function placeFailure(e: unknown, tripId: string): ActionResult {
  if (e instanceof PlacePickError) {
    return { ok: false, error: e.message === e.code ? "Couldn't use that place. Try another." : e.message };
  }
  if (e instanceof IdeaInputError) {
    return { ok: false, error: "Confirm your number to fix ideas.", signin: routes.signin(routes.trip(tripId)) };
  }
  return failure(e, tripId);
}

/** Is Google place search configured? (no key → the picker offers rename only) */
export async function placeSearchStatusAction(): Promise<{ connected: boolean }> {
  return { connected: placeSearchConnected() };
}

export async function searchPlacesAction(
  tripId: string,
  query: string,
  ideaId?: string | null,
): Promise<{ ok: true; outcome: PlaceSearchOutcome } | Extract<ActionResult, { ok: false }>> {
  try {
    const { db, claims, session } = await tripContext(tripId);
    if (!session.user) return { ok: false, error: "Confirm your number to search.", signin: routes.signin(routes.trip(tripId)) };
    const outcome = await searchPlacesForTrip(db, claims, {
      tripId,
      ideaId: ideaId ? z.uuid().parse(ideaId) : null,
      query: z.string().max(200).parse(query),
    });
    return { ok: true, outcome };
  } catch (e) {
    return placeFailure(e, tripId) as Extract<ActionResult, { ok: false }>;
  }
}

/** FR-23: pick the right place for an idea. */
export async function pickPlaceAction(tripId: string, ideaId: string, placeId: string): Promise<ActionResult> {
  try {
    const { db, claims, view } = await me(tripId);
    await pickPlaceForIdea(db, claims, { tripId, ideaId: z.uuid().parse(ideaId), placeId: placeIdSchema.parse(placeId) });
    after(() => track(db, { name: "idea_fixed", tripId, memberId: view.me.memberId, props: { ideaId, via: "place_search" } }));
    refresh();
    return { ok: true };
  } catch (e) {
    return placeFailure(e, tripId);
  }
}

/** FR-L20: add an idea by picking a place. Free, no AI. */
export async function addPlaceAction(tripId: string, placeId: string): Promise<ActionResult> {
  try {
    const { db, claims, view, session } = await me(tripId);
    if (!session.user) {
      return { ok: false, error: "Confirm your number to add ideas.", signin: routes.signin(routes.trip(tripId)) };
    }
    const r = await addIdeaFromPlace(db, claims, { tripId, placeId: placeIdSchema.parse(placeId) });
    after(() =>
      track(db, { name: "idea_added", tripId, memberId: view.me.memberId, props: { ideaId: r.ideaId, via: "place_search" } }),
    );
    refresh();
    return { ok: true, message: r.merged ? "Already on the trip. Added you as a sharer." : undefined };
  } catch (e) {
    return placeFailure(e, tripId);
  }
}
