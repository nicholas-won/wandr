import { describe, expect, it } from "vitest";
import {
  closesLabel,
  extendDeadline,
  isPollOpen,
  isSplitDecision,
  meetsTurnout,
  msUntilClose,
  pollOutcome,
  type PollBallot,
} from "../src/polls";
import type { TripSize } from "../src/domain";

const b = (memberId: string, optionId: string): PollBallot => ({ memberId, optionId });

describe("meetsTurnout (FR-48)", () => {
  it.each([
    [0, 0, false],
    [0, 4, false],
    [1, 4, false],
    [2, 4, true], // exactly 50% passes
    [2, 5, false],
    [3, 5, true],
    [1, 2, true],
    [1, 1, true],
  ])("%i of %i → %s", (voted, eligible, ok) => expect(meetsTurnout(voted, eligible)).toBe(ok));
});

describe("isSplitDecision (Q15)", () => {
  const four = ["m1", "m2", "m3", "m4"];
  it("a 50/50 at exactly 50% turnout is a split decision for the organizer", () => {
    const out = pollOutcome({ size: "group", optionIds: ["A", "B"], ballots: [b("m1", "A"), b("m2", "B")], eligibleVoterIds: four });
    expect(out).toMatchObject({ kind: "needs_organizer", reason: "tie" });
    expect(isSplitDecision(out)).toBe(true);
  });
  it("any tie for first is split; a winner or low turnout isn't", () => {
    const tie3 = pollOutcome({
      size: "group",
      optionIds: ["A", "B", "C"],
      ballots: [b("m1", "A"), b("m2", "B"), b("m3", "C")],
      eligibleVoterIds: four,
    });
    expect(isSplitDecision(tie3)).toBe(true);
    const win = pollOutcome({ size: "group", optionIds: ["A", "B"], ballots: [b("m1", "A"), b("m2", "A")], eligibleVoterIds: four });
    expect(isSplitDecision(win)).toBe(false);
    const low = pollOutcome({ size: "group", optionIds: ["A", "B"], ballots: [b("m1", "A")], eligibleVoterIds: four });
    expect(isSplitDecision(low)).toBe(false);
  });
});

describe("pollOutcome (FR-47/48, FR-T7)", () => {
  const opts = ["A", "B", "C"];
  const five = ["m1", "m2", "m3", "m4", "m5"];

  it("solo: hidden", () => {
    expect(pollOutcome({ size: "solo", optionIds: opts, ballots: [b("m1", "A")], eligibleVoterIds: ["m1"] })).toEqual({ kind: "hidden" });
  });

  it("clear winner", () => {
    const out = pollOutcome({ size: "group", optionIds: opts, ballots: [b("m1", "A"), b("m2", "A"), b("m3", "B")], eligibleVoterIds: five });
    expect(out).toEqual({ kind: "winner", optionId: "A", tally: { A: 2, B: 1, C: 0 }, turnout: { voted: 3, eligible: 5 } });
  });

  it("group tie → organizers decide", () => {
    const out = pollOutcome({ size: "group", optionIds: opts, ballots: [b("m1", "A"), b("m2", "B"), b("m3", "C")], eligibleVoterIds: five });
    expect(out).toMatchObject({ kind: "needs_organizer", reason: "tie", decider: "organizers", tiedOptionIds: ["A", "B", "C"] });
  });

  it("low turnout (<50%) → no automatic winner, even with a clear leader", () => {
    const out = pollOutcome({ size: "group", optionIds: opts, ballots: [b("m1", "A"), b("m2", "A")], eligibleVoterIds: five });
    expect(out).toMatchObject({ kind: "needs_organizer", reason: "low_turnout", tiedOptionIds: [] });
  });

  it("non-voters abstain; only attending (eligible) members count", () => {
    const out = pollOutcome({
      size: "group",
      optionIds: opts,
      ballots: [b("m1", "A"), b("m2", "A"), b("m3", "B"), b("outsider", "B"), b("outsider2", "B")],
      eligibleVoterIds: ["m1", "m2", "m3", "m4"],
    });
    expect(out).toMatchObject({ kind: "winner", optionId: "A", turnout: { voted: 3, eligible: 4 } });
  });

  it("ignores ballots for unknown options; last ballot per member wins (FR-43)", () => {
    const out = pollOutcome({
      size: "group",
      optionIds: ["A", "B"],
      ballots: [b("m1", "A"), b("m1", "B"), b("m2", "Z"), b("m2", "B"), b("m3", "A")],
      eligibleVoterIds: ["m1", "m2", "m3"],
    });
    expect(out).toMatchObject({ kind: "winner", optionId: "B", tally: { A: 1, B: 2 } });
  });

  it.each<[TripSize, string]>([
    ["duo", "owner"],
    ["group", "organizers"],
  ])("1–1 tie in %s → decider %s (FR-T7)", (size, decider) => {
    const out = pollOutcome({ size, optionIds: ["A", "B"], ballots: [b("me", "A"), b("sam", "B")], eligibleVoterIds: ["me", "sam"] });
    expect(out).toMatchObject({ kind: "needs_organizer", reason: "tie", decider, tiedOptionIds: ["A", "B"] });
  });

  it("duo: one vote of two is 50% turnout → that option wins", () => {
    const out = pollOutcome({ size: "duo", optionIds: ["A", "B"], ballots: [b("me", "A")], eligibleVoterIds: ["me", "sam"] });
    expect(out).toMatchObject({ kind: "winner", optionId: "A" });
  });

  it("no eligible voters → low turnout", () => {
    expect(pollOutcome({ size: "group", optionIds: opts, ballots: [], eligibleVoterIds: [] })).toMatchObject({ reason: "low_turnout" });
  });
});

describe("deadline helpers", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const later = "2026-10-02T12:00:00Z";
  const earlier = "2026-09-30T12:00:00Z";

  it.each([
    [{ closesAt: null, closedAt: null }, true],
    [{ closesAt: later, closedAt: null }, true],
    [{ closesAt: earlier, closedAt: null }, false],
    [{ closesAt: now, closedAt: null }, false],
    [{ closesAt: later, closedAt: earlier }, false], // closed early (V-12)
  ])("isPollOpen %#", (poll, open) => expect(isPollOpen(poll, now)).toBe(open));

  it("msUntilClose", () => {
    expect(msUntilClose({ closesAt: later, closedAt: null }, now)).toBe(86_400_000);
    expect(msUntilClose({ closesAt: earlier, closedAt: null }, now)).toBe(0);
    expect(msUntilClose({ closesAt: null, closedAt: null }, now)).toBeNull();
    expect(msUntilClose({ closesAt: later, closedAt: now }, now)).toBe(0);
  });

  it("extendDeadline extends from the later of deadline and now", () => {
    expect(extendDeadline(later, now, 3_600_000).toISOString()).toBe("2026-10-02T13:00:00.000Z");
    expect(extendDeadline(earlier, now, 3_600_000).toISOString()).toBe("2026-10-01T13:00:00.000Z");
    expect(extendDeadline(null, now, 3_600_000).toISOString()).toBe("2026-10-01T13:00:00.000Z");
    expect(() => extendDeadline(later, now, 0)).toThrow();
  });

  it("closesLabel uses the viewer's time zone (S-14)", () => {
    // Sat 02:00 UTC is still Fri evening in New York.
    expect(closesLabel("2026-10-03T02:00:00Z", "America/New_York")).toBe("closes Fri");
    expect(closesLabel("2026-10-03T02:00:00Z", "Europe/Lisbon")).toBe("closes Sat");
  });
});
