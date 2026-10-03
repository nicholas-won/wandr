/**
 * "Arrange my days" scheduling engine (REQUIREMENTS.md §6.11, FR-O1–FR-O18).
 * Pure and deterministic: same input → same output.
 */
export { arrangeDays, OFF_CLUSTER_PENALTY, LOAD_COST, TOO_FAR_MINUTES, NEARBY_KM } from "./arrange";
export { checkPlan, type CheckPlanOptions } from "./check";
export { computePlanBasis, checkPlanFreshness, stableHash, type PlanFreshness } from "./freshness";
export { reasonText, summarizeReasons } from "./reasons";
export {
  PACE_RULES,
  KIND_WINDOWS,
  LATE_ARRIVAL_START,
  formatMinute,
  buildDayFrames,
  arrivalStart,
  departureEnd,
  type DayFrame,
  weekdayOf,
  type PaceRules,
} from "./rules";
export {
  defaultTravelTime,
  haversineKm,
  WALK_MAX_KM,
  WALK_KMH,
  TRANSIT_KMH,
  TRANSIT_OVERHEAD_MINUTES,
} from "./travel";
export { kMedoids } from "./cluster";
export type * from "./types";
