import "server-only";
import { cache } from "react";
import { tripContext } from "./context";
import { getPlanningView } from "./planning";

/** Stages/Stops view for the caller, memoized per request (layout chips + pages share it). */
export const loadPlanning = cache(async (tripId: string) => {
  const { db, claims } = await tripContext(tripId);
  return getPlanningView(db, claims, tripId);
});
