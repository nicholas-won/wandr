import { describe, expect, it } from "vitest";
import {
  canPick,
  isDueForClose,
  isSafeImageUrl,
  organizerPollActions,
  outcomeText,
  pollOutcomeFromTally,
  pollStatus,
  resumedDeadline,
  validatePollDraft,
} from "../src/poll-flow";
import { pollOutcome } from "../src/polls";

const NOW = new Date("2027-01-01T12:00:00Z");
const H = 3_600_000;

describe("validatePollDraft (FR-47, FR-S12, FR-92)", () => {
  const base = { question: " Theme? ", options: [{ label: "Disco" }, { label: "Cowboy" }], closesAt: null };
  it("normalizes a valid draft", () => {
    const r = validatePollDraft({ ...base, options: [...base.options, { label: "  ", imageUrl: "" }] }, NOW);
    expect(r).toEqual({
      ok: true,
      draft: {
        question: "Theme?",
        options: [
          { label: "Disco", ideaId: null, imageUrl: null },
          { label: "Cowboy", ideaId: null, imageUrl: null },
        ],
        closesAt: null,
      },
    });
  });
  it.each([
    [{ ...base, question: "" }, "question_required"],
    [{ ...base, question: "x".repeat(141) }, "question_too_long"],
    [{ ...base, options: [{ label: "A" }] }, "too_few_options"],
    [{ ...base, options: Array.from({ length: 11 }, (_, i) => ({ label: `o${i}` })) }, "too_many_options"],
    [{ ...base, options: [{ label: "A" }, { label: "", imageUrl: "https://x.test/a.png" }] }, "option_label_required"],
    [{ ...base, options: [{ label: "A" }, { label: "x".repeat(81) }] }, "option_label_too_long"],
    [{ ...base, options: [{ label: "A" }, { label: "a" }] }, "duplicate_options"],
    [{ ...base, options: [{ label: "A" }, { label: "B", imageUrl: "javascript:alert(1)" }] }, "bad_image_url"],
    [{ ...base, closesAt: new Date(NOW.getTime() + 60_000) }, "deadline_too_soon"],
    [{ ...base, closesAt: new Date(NOW.getTime() + 61 * 24 * H) }, "deadline_too_far"],
  ])("rejects %#", (draft, error) => {
    expect(validatePollDraft(draft, NOW)).toEqual({ ok: false, error });
  });
  it("same label on different ideas is fine", () => {
    const r = validatePollDraft({ ...base, options: [{ label: "Bar", ideaId: "1" }, { label: "Bar", ideaId: "2" }] }, NOW);
    expect(r.ok).toBe(true);
  });
  it("image URLs must be https without credentials", () => {
    expect(isSafeImageUrl("https://img.test/a.jpg")).toBe(true);
    expect(isSafeImageUrl("http://img.test/a.jpg")).toBe(false);
    expect(isSafeImageUrl("https://u:p@img.test/a.jpg")).toBe(false);
    expect(isSafeImageUrl("data:image/png;base64,AAA")).toBe(false);
    expect(isSafeImageUrl("not a url")).toBe(false);
  });
});

describe("pollStatus", () => {
  const p = { closesAt: new Date(NOW.getTime() + H), closedAt: null, pausedAt: null, winningOptionId: null };
  it("open → needs_decision/decided at the deadline", () => {
    expect(pollStatus(p, NOW)).toBe("open");
    const later = new Date(NOW.getTime() + 2 * H);
    expect(pollStatus(p, later)).toBe("needs_decision");
    expect(pollStatus({ ...p, winningOptionId: "a" }, later)).toBe("decided");
    expect(isDueForClose(p, later)).toBe(true);
    expect(isDueForClose(p, NOW)).toBe(false);
  });
  it("paused polls don't run out", () => {
    const paused = { ...p, pausedAt: NOW };
    expect(pollStatus(paused, new Date(NOW.getTime() + 5 * H))).toBe("paused");
    expect(isDueForClose(paused, new Date(NOW.getTime() + 5 * H))).toBe(false);
    expect(resumedDeadline({ closesAt: p.closesAt, pausedAt: NOW }, new Date(NOW.getTime() + 3 * H))).toEqual(
      new Date(NOW.getTime() + 4 * H),
    );
    expect(resumedDeadline({ closesAt: null, pausedAt: NOW }, NOW)).toBeNull();
  });
  it("closed early by an organizer", () => {
    expect(pollStatus({ ...p, closedAt: NOW }, NOW)).toBe("needs_decision");
  });
});

describe("pollOutcomeFromTally (FR-48, FR-T7)", () => {
  it("matches pollOutcome on equivalent ballots", () => {
    const ballots = [
      { memberId: "m1", optionId: "a" },
      { memberId: "m2", optionId: "a" },
      { memberId: "m3", optionId: "b" },
    ];
    const direct = pollOutcome({ size: "group", optionIds: ["a", "b"], ballots, eligibleVoterIds: ["m1", "m2", "m3", "m4"] });
    const fromTally = pollOutcomeFromTally("group", [{ optionId: "a", count: 2 }, { optionId: "b", count: 1 }], 4);
    expect(fromTally).toEqual(direct);
    expect(fromTally.kind).toBe("winner");
  });
  it("low turnout and ties need the organizer; duo ties go to the owner", () => {
    expect(pollOutcomeFromTally("group", [{ optionId: "a", count: 1 }, { optionId: "b", count: 0 }], 5)).toMatchObject({
      kind: "needs_organizer",
      reason: "low_turnout",
    });
    expect(pollOutcomeFromTally("duo", [{ optionId: "a", count: 1 }, { optionId: "b", count: 1 }], 2)).toMatchObject({
      kind: "needs_organizer",
      reason: "tie",
      decider: "owner",
      tiedOptionIds: ["a", "b"],
    });
  });
  it("hidden in solo", () => {
    expect(pollOutcomeFromTally("solo", [{ optionId: "a", count: 1 }], 1)).toEqual({ kind: "hidden" });
  });
});

describe("organizer actions (FR-48, V-7, V-8, FR-T7)", () => {
  const tie = pollOutcomeFromTally("group", [{ optionId: "a", count: 2 }, { optionId: "b", count: 2 }, { optionId: "c", count: 0 }], 4);
  const low = pollOutcomeFromTally("group", [{ optionId: "a", count: 1 }, { optionId: "b", count: 0 }], 4);
  const duoTie = pollOutcomeFromTally("duo", [{ optionId: "a", count: 1 }, { optionId: "b", count: 1 }], 2);
  const win = pollOutcomeFromTally("group", [{ optionId: "a", count: 3 }, { optionId: "b", count: 0 }], 4);
  it("tie: pick a tied option, run-off or extend", () => {
    expect(organizerPollActions(tie, { role: "organizer" })).toEqual({ actions: ["pick", "runoff", "extend"], pickable: ["a", "b"] });
    expect(canPick(tie, "organizer", "c", ["a", "b", "c"])).toBe(false);
    expect(canPick(tie, "owner", "a", ["a", "b", "c"])).toBe(true);
  });
  it("low turnout: pick anything or extend", () => {
    expect(organizerPollActions(low, { role: "owner" })).toEqual({ actions: ["pick", "extend"], pickable: "any" });
    expect(canPick(low, "organizer", "b", ["a", "b"])).toBe(true);
  });
  it("members and non-owners in a duo tie get nothing", () => {
    expect(organizerPollActions(tie, { role: "member" }).actions).toEqual([]);
    expect(organizerPollActions(duoTie, { role: "organizer" }).actions).toEqual([]);
    expect(organizerPollActions(duoTie, { role: "owner" }).actions).toContain("pick");
    expect(organizerPollActions(win, { role: "owner" }).actions).toEqual([]);
  });
  it("outcome text", () => {
    const labels = { a: "Disco", b: "Cowboy", c: "Space" };
    expect(outcomeText(win, labels)).toBe("Disco won. 3 of 4 voted.");
    expect(outcomeText(tie, labels)).toBe("Tie between Disco and Cowboy. 4 of 4 voted.");
    expect(outcomeText(low, labels, { closedEarlyBy: "Sam" })).toBe("No decision, too few votes. Closed early by Sam, 1 of 4 voted.");
    expect(outcomeText(tie, labels, { winningOptionId: "b" })).toBe("Decided: Cowboy. 4 of 4 voted.");
    expect(outcomeText(win, labels, { winningOptionId: "a" })).toBe("Disco won. 3 of 4 voted.");
  });
});
