import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { shouldShowPhonePrompt } from "@wandr/core";
import { COOKIE } from "@/lib/auth/cookies";
import { getDb } from "@wandr/db";
import { claimsFor, getSession } from "@/lib/auth/session";
import { getTripView } from "./trips";

/** Per-request DB + RLS claims for a trip. */
export const tripContext = cache(async (tripId: string) => {
  const [db, session] = await Promise.all([getDb(), getSession()]);
  return { db, session, claims: claimsFor(session, tripId) };
});

/** Q1: should this session see the "confirm your number" nudge? Reads the dismissal cookie. */
export async function phonePromptVisible(scope: "link" | "full", votesCast: number): Promise<boolean> {
  const dismissed = Number((await cookies()).get(COOKIE.phonePrompt)?.value);
  return shouldShowPhonePrompt({
    scope,
    votesCast,
    dismissedAt: Number.isFinite(dismissed) && dismissed > 0 ? dismissed : null,
    now: Date.now(),
  });
}

/** The caller's view of a trip, memoized per request (layout + page share it). */
export const loadTripView = cache(async (tripId: string) => {
  const { db, claims } = await tripContext(tripId);
  return getTripView(db, claims, tripId);
});
