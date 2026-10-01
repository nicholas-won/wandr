import { describe, expect, it } from "vitest";
import {
  availableStageActions,
  reopenImpact,
  stageChips,
  stageProgressText,
  transitionStage,
  type ImpactItem,
  type StageAction,
} from "../src/stages";
import type { StageStatus, TripSize } from "../src/domain";

describe("transitionStage (FR-S1/S2/S4)", () => {
  it.each<[StageStatus, StageAction, TripSize, StageStatus | null]>([
    ["collecting", "start_voting", "group", "voting"],
    ["collecting", "start_voting", "duo", "voting"],
    ["voting", "set", "group", "set"],
    ["collecting", "set", "group", "set"], // "already decided"
    ["collecting", "mark_not_needed", "group", "not_needed"],
    ["voting", "mark_not_needed", "group", "not_needed"],
    ["not_needed", "restore", "group", "collecting"],
    ["set", "reopen", "group", "collecting"],
    ["set", "start_voting", "group", null],
    ["set", "set", "group", null],
    ["set", "mark_not_needed", "group", null],
    ["voting", "start_voting", "group", null],
    ["collecting", "reopen", "group", null],
    ["voting", "restore", "group", null],
    ["not_needed", "set", "group", null],
    // solo: simple toggles, no voting step
    ["collecting", "set", "solo", "set"],
    ["set", "reopen", "solo", "collecting"],
    ["voting", "set", "solo", "set"], // left over from when it was a group
  ])("%s --%s--> (%s) = %s", (from, action, size, to) => {
    const out = transitionStage(from, action, size);
    if (to === null) expect(out.ok).toBe(false);
    else expect(out).toMatchObject({ ok: true, next: to });
  });

  it("solo has no voting step", () => {
    expect(transitionStage("collecting", "start_voting", "solo")).toEqual({ ok: false, reason: "no_voting_in_solo" });
  });

  it("reopen needs an impact preview except in solo (FR-S4)", () => {
    expect(transitionStage("set", "reopen", "group")).toMatchObject({ requiresImpactPreview: true });
    expect(transitionStage("set", "reopen", "duo")).toMatchObject({ requiresImpactPreview: true });
    expect(transitionStage("set", "reopen", "solo")).toMatchObject({ requiresImpactPreview: false });
  });

  it("S-7: setting with no votes warns", () => {
    expect(transitionStage("voting", "set", "group", 0)).toMatchObject({ ok: true, warning: "no_votes_yet" });
    expect(transitionStage("voting", "set", "group", 3)).not.toHaveProperty("warning");
    expect(transitionStage("collecting", "set", "solo", 0)).not.toHaveProperty("warning");
  });

  it("availableStageActions", () => {
    expect(availableStageActions("collecting", "group")).toEqual(["start_voting", "set", "mark_not_needed"]);
    expect(availableStageActions("collecting", "solo")).toEqual(["set", "mark_not_needed"]);
    expect(availableStageActions("set", "group")).toEqual(["reopen"]);
    expect(availableStageActions("not_needed", "group")).toEqual(["restore"]);
  });
});

describe("reopenImpact (FR-S4, S-6)", () => {
  const items: ImpactItem[] = [
    { id: "stayPollLis", kind: "poll", stage: "stay", stopId: "lis", open: true },
    { id: "stayPollPor", kind: "poll", stage: "stay", stopId: "por", open: true },
    { id: "closedPoll", kind: "poll", stage: "do", stopId: "lis", open: false },
    { id: "wherePoll", kind: "poll", stage: "where", stopId: null, open: true },
    { id: "dinner", kind: "planned_item", stage: "do", stopId: "lis" },
    { id: "airbnb", kind: "expense", stage: "stay", stopId: "lis" },
    { id: "train", kind: "idea", stage: "getting_around", stopId: null },
    { id: "misc", kind: "expense", stage: null, stopId: "lis" },
  ];
  const statuses = { where: "set", when: "set", stay: "voting", getting_around: "not_needed", do: "set" } as const;

  it("reopening Where touches every later-stage item", () => {
    expect(reopenImpact("where", statuses, items)).toEqual({
      downstreamSetStages: ["when", "do"],
      pollsToPause: ["stayPollLis", "stayPollPor"],
      plannedItemsToReview: ["dinner"],
      ideasAffected: ["train"],
      expensesMayNeedRefund: ["airbnb"],
    });
  });

  it("scoped to affected Stops (items without a Stop still count)", () => {
    expect(reopenImpact("where", statuses, items, ["lis"])).toMatchObject({
      pollsToPause: ["stayPollLis"],
      ideasAffected: ["train"],
    });
  });

  it("reopening Do affects nothing later", () => {
    expect(reopenImpact("do", statuses, items)).toEqual({
      downstreamSetStages: [],
      pollsToPause: [],
      plannedItemsToReview: [],
      ideasAffected: [],
      expensesMayNeedRefund: [],
    });
  });
});

describe("progress chips (FR-120)", () => {
  const opts = { timeZone: "America/New_York", now: "2026-10-01T12:00:00Z", stopCount: 2 };

  it("matches the spec example", () => {
    const text = stageProgressText(
      [
        { kind: "where", status: "set" },
        { kind: "when", status: "set" },
        { kind: "stay", status: "voting", closesAt: "2026-10-02T20:00:00Z" },
        { kind: "getting_around", status: "not_needed" },
        { kind: "do", status: "collecting" },
      ],
      opts,
    );
    expect(text).toBe("Where ✅ · When ✅ · Stay 🗳 closes Fri · Do 💡");
  });

  it("hides Getting around for single-Stop trips and defaults missing stages to collecting", () => {
    expect(stageChips([{ kind: "where", status: "set" }], { ...opts, stopCount: 1 }).map((c) => c.text)).toEqual([
      "Where ✅",
      "When 💡",
      "Stay 💡",
      "Do 💡",
    ]);
  });

  it("omits a past deadline", () => {
    expect(stageChips([{ kind: "stay", status: "voting", closesAt: "2026-09-01T00:00:00Z" }], opts)[2]!.text).toBe("Stay 🗳");
  });
});
