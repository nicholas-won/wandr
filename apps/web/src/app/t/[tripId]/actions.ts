"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { addIdea, addListiclePicks, fixIdea, resolveIdeaJob } from "@/server/ideas";
import { freshLinkFor, inviteMember } from "@/server/invites";
import { castVote, getTripView, markNoticeSeen } from "@/server/trips";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; signin?: string };

const voteSchema = z.enum(["must", "down", "pass"]).nullable();

async function me(tripId: string) {
  const ctx = await tripContext(tripId);
  const view = await getTripView(ctx.db, ctx.claims, tripId);
  if (!view) throw new Error("not_a_member");
  return { ...ctx, view };
}

function failure(e: unknown, tripId: string): ActionResult {
  if (e instanceof AuthError) {
    return { ok: false, error: "Confirm your number first.", signin: routes.signin(routes.trip(tripId)) };
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
    after(() => resolveIdeaJob(db, ideaId));
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e, tripId);
  }
}

export async function fixIdeaAction(tripId: string, ideaId: string, title: string): Promise<ActionResult> {
  try {
    const { db, claims } = await me(tripId);
    await fixIdea(db, claims, { ideaId, title });
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
    refresh();
    return {
      ok: true,
      link: r.link,
      message: r.texted ? `Texted ${name.trim()} their link.` : `Send ${name.trim()} their link yourself.`,
    };
  } catch (e) {
    return failure(e, tripId);
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
    return failure(e, tripId);
  }
}
