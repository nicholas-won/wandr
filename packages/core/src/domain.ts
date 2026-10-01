/**
 * Shared domain literals. These mirror the Postgres enums in packages/db/src/schema.ts
 * (kept as plain string unions so packages/core has no dependency on the DB package).
 */

export type MemberId = string;

/** vote_value (FR-40). Shown as Must-do / Down / Pass; in solo trips as Must-do / Maybe / Skip (D55). */
export type VoteValue = "must" | "down" | "pass";
export const VOTE_VALUES: readonly VoteValue[] = ["must", "down", "pass"];

/** trip_size (FR-T1). */
export type TripSize = "solo" | "duo" | "group";

/** member_role (FR-2). */
export type MemberRole = "owner" | "organizer" | "member";

/** member_status (§5; `not_attending` per M-9). */
export type MemberStatus = "invited" | "pending" | "active" | "not_attending" | "removed";

/** stage_kind (§6.0), in fixed order. */
export type StageKind = "where" | "when" | "stay" | "getting_around" | "do";
export const STAGE_ORDER: readonly StageKind[] = ["where", "when", "stay", "getting_around", "do"];

/** stage_status (FR-S1/S2). */
export type StageStatus = "collecting" | "voting" | "set" | "not_needed";

/** idea_status (§5, FR-49). */
export type IdeaStatus = "idea" | "shortlisted" | "planned" | "done" | "dropped";

/** Anything that can be turned into an epoch-ms timestamp. */
export type Instant = Date | number | string;

export function toMs(t: Instant): number {
  const ms = t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid instant: ${String(t)}`);
  return ms;
}
