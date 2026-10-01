import "server-only";
import { cache } from "react";
import { getDb } from "@wandr/db";
import { claimsFor, getSession } from "@/lib/auth/session";
import { getTripView } from "./trips";

/** Per-request DB + RLS claims for a trip. */
export const tripContext = cache(async (tripId: string) => {
  const [db, session] = await Promise.all([getDb(), getSession()]);
  return { db, session, claims: claimsFor(session, tripId) };
});

/** The caller's view of a trip, memoized per request (layout + page share it). */
export const loadTripView = cache(async (tripId: string) => {
  const { db, claims } = await tripContext(tripId);
  return getTripView(db, claims, tripId);
});
