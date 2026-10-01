/**
 * "🤔 Split opinions" label (FR-44a, D42). Group trips only (§6.10: duo votes are already visible,
 * solo has no one to disagree with). No names are ever attached.
 */
import type { TripSize } from "../domain";
import type { IdeaScore } from "./ranking";

export const SPLIT_OPINIONS_LABEL = "🤔 Split opinions";

/**
 * FR-44a: contested if
 *   (a) at least 2 Must-do AND at least 2 Pass, or
 *   (b) at least a third of voters passed AND there is at least 1 Must-do.
 * Voters = eligible members who voted (same denominator as FR-44).
 * Integer arithmetic: pass * 3 >= voters.
 */
export function isSplitOpinions(
  score: Pick<IdeaScore, "must" | "pass" | "voters">,
  size: TripSize,
): boolean {
  if (size !== "group") return false;
  if (score.voters === 0) return false;
  if (score.must >= 2 && score.pass >= 2) return true;
  return score.must >= 1 && score.pass * 3 >= score.voters;
}
