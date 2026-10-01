/**
 * Planning stages (§6.0, FR-S1, FR-S2, FR-S4, FR-120, §6.10, D16, S-6, S-7, S-8).
 *
 * Fixed order: Where → When → Stay → Getting around → Do.
 * Each stage: collecting → voting → set, or not_needed (skipped).
 * Solo trips use simple "set" toggles with no voting step (§6.10).
 * Organizers move stages (FR-S1); the permission check lives in permissions.ts (`manage_stages`).
 */
import { STAGE_ORDER, toMs, type Instant, type StageKind, type StageStatus, type TripSize } from "./domain";
import { closesLabel } from "./polls";

export type StageAction =
  /** collecting → voting (not in solo). */
  | "start_voting"
  /** collecting|voting → set. From collecting = "already decided" (FR-S2). */
  | "set"
  /** collecting|voting → not_needed (FR-S2). */
  | "mark_not_needed"
  /** set → collecting (FR-S4, needs an impact preview before confirming). */
  | "reopen"
  /** not_needed → collecting (undo a skip, P7). */
  | "restore";

export type StageTransition =
  | {
      ok: true;
      next: StageStatus;
      /** FR-S4: show what's affected before confirming. */
      requiresImpactPreview: boolean;
      /** S-7: setting a stage nobody has voted on is allowed, with a warning. */
      warning?: "no_votes_yet";
    }
  | { ok: false; reason: "invalid_transition" | "no_voting_in_solo" };

/**
 * FR-S1/S2/S4 state machine.
 * @param votesCast optional number of votes cast on the stage's ideas/polls (for the S-7 warning).
 */
export function transitionStage(
  current: StageStatus,
  action: StageAction,
  size: TripSize,
  votesCast?: number,
): StageTransition {
  const ok = (next: StageStatus, extra: Partial<Extract<StageTransition, { ok: true }>> = {}) =>
    ({ ok: true, next, requiresImpactPreview: false, ...extra }) as const;
  const bad = { ok: false, reason: "invalid_transition" } as const;

  switch (action) {
    case "start_voting":
      if (size === "solo") return { ok: false, reason: "no_voting_in_solo" };
      return current === "collecting" ? ok("voting") : bad;
    case "set":
      if (current !== "collecting" && current !== "voting") return bad;
      return ok("set", size !== "solo" && votesCast === 0 ? { warning: "no_votes_yet" } : {});
    case "mark_not_needed":
      return current === "collecting" || current === "voting" ? ok("not_needed") : bad;
    case "reopen":
      // Solo: a plain toggle; there's no one else's work to affect.
      return current === "set" ? ok("collecting", { requiresImpactPreview: size !== "solo" }) : bad;
    case "restore":
      return current === "not_needed" ? ok("collecting") : bad;
  }
}

/** Actions available from a status at a size (for rendering organizer menus). */
export function availableStageActions(current: StageStatus, size: TripSize): StageAction[] {
  const all: StageAction[] = ["start_voting", "set", "mark_not_needed", "reopen", "restore"];
  return all.filter((a) => transitionStage(current, a, size).ok);
}

// ---------------------------------------------------------------------------
// Reopen impact (FR-S4, S-6)
// ---------------------------------------------------------------------------

export interface ImpactItem {
  id: string;
  kind: "poll" | "planned_item" | "idea" | "expense";
  /** The stage the item belongs to (e.g. a Stay poll → "stay"). Null = not stage-bound. */
  stage: StageKind | null;
  stopId: string | null;
  /** Polls: still open? */
  open?: boolean;
}

export interface ReopenImpact {
  /** Later stages that are already set and may need revisiting. */
  downstreamSetStages: StageKind[];
  /** Open polls in later stages: paused, not cancelled (S-6). */
  pollsToPause: string[];
  /** Planned items in later stages: listed for review (nothing is deleted). */
  plannedItemsToReview: string[];
  /** Ideas in later stages that the change touches. */
  ideasAffected: string[];
  /** Expenses already incurred in later stages (deposits): flagged "may need refund" (S-6). */
  expensesMayNeedRefund: string[];
}

/** Index of a stage in the fixed order. */
export function stageIndex(kind: StageKind): number {
  return STAGE_ORDER.indexOf(kind);
}

/**
 * FR-S4 impact preview for reopening `stage`. An item is affected if it belongs to a LATER stage
 * (the reopened stage is the frame for the ones after it, §6.0) and — when `affectedStopIds` is
 * given (e.g. only Lisbon changes) — it is in one of those Stops or not tied to a Stop.
 * Stage-less items are not affected. Pure: returns lists; it changes nothing.
 */
export function reopenImpact(
  stage: StageKind,
  stageStatuses: Readonly<Partial<Record<StageKind, StageStatus>>>,
  items: readonly ImpactItem[],
  affectedStopIds?: readonly string[],
): ReopenImpact {
  const idx = stageIndex(stage);
  const later = (k: StageKind | null) => k != null && stageIndex(k) > idx;
  const stops = affectedStopIds ? new Set(affectedStopIds) : null;
  const inScope = (i: ImpactItem) => later(i.stage) && (!stops || i.stopId == null || stops.has(i.stopId));

  const hit = items.filter(inScope);
  return {
    downstreamSetStages: STAGE_ORDER.filter((k) => stageIndex(k) > idx && stageStatuses[k] === "set"),
    pollsToPause: hit.filter((i) => i.kind === "poll" && i.open !== false).map((i) => i.id),
    plannedItemsToReview: hit.filter((i) => i.kind === "planned_item").map((i) => i.id),
    ideasAffected: hit.filter((i) => i.kind === "idea").map((i) => i.id),
    expensesMayNeedRefund: hit.filter((i) => i.kind === "expense").map((i) => i.id),
  };
}

// ---------------------------------------------------------------------------
// Progress chips (FR-120)
// ---------------------------------------------------------------------------

export const STAGE_LABELS: Record<StageKind, string> = {
  where: "Where",
  when: "When",
  stay: "Stay",
  getting_around: "Getting around",
  do: "Do",
};

const STATUS_EMOJI: Record<Exclude<StageStatus, "not_needed">, string> = {
  set: "✅",
  voting: "🗳",
  collecting: "💡",
};

export interface StageChipInput {
  kind: StageKind;
  status: StageStatus;
  /** Earliest deadline of the stage's open polls, if any (shown as "closes Fri"). */
  closesAt?: Instant | null;
}

export interface StageChip {
  kind: StageKind;
  status: StageStatus;
  text: string;
}

/**
 * FR-120 progress chips: "Where ✅ · When ✅ · Stay 🗳 closes Fri · Do 💡".
 * - not_needed stages are hidden (FR-S2, P2).
 * - "Getting around" is hidden for single-Stop trips (S-8; transit is between Stops).
 * - A voting stage shows its deadline in the viewer's time zone (S-14) if it has one in the future.
 * Missing stages default to `collecting`.
 */
export function stageChips(
  stages: readonly StageChipInput[],
  opts: { timeZone: string; now: Instant; stopCount: number; locale?: string },
): StageChip[] {
  const byKind = new Map(stages.map((s) => [s.kind, s]));
  const chips: StageChip[] = [];
  for (const kind of STAGE_ORDER) {
    const s = byKind.get(kind) ?? { kind, status: "collecting" as const };
    if (s.status === "not_needed") continue;
    if (kind === "getting_around" && opts.stopCount <= 1) continue;
    let text = `${STAGE_LABELS[kind]} ${STATUS_EMOJI[s.status]}`;
    if (s.status === "voting" && s.closesAt != null && toMs(s.closesAt) > toMs(opts.now)) {
      text += ` ${closesLabel(s.closesAt, opts.timeZone, opts.locale)}`;
    }
    chips.push({ kind, status: s.status, text });
  }
  return chips;
}

/** FR-120: chips joined into one line. */
export function stageProgressText(
  stages: readonly StageChipInput[],
  opts: { timeZone: string; now: Instant; stopCount: number; locale?: string },
): string {
  return stageChips(stages, opts)
    .map((c) => c.text)
    .join(" · ");
}
