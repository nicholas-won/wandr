import { describe, expect, it } from "vitest";
import {
  computeOpenTo,
  openSoloVotesToDuo,
  organizerTurnout,
  voteLabel,
  voteView,
  type VoteRecord,
} from "../src/voting";

const v = (memberId: string, value: VoteRecord["value"], castInSize: VoteRecord["castInSize"], openTo: string[] = []): VoteRecord => ({
  memberId,
  value,
  castInSize,
  openTo,
});

describe("voteLabel (D55)", () => {
  it.each([
    ["must", "solo", "Must-do"],
    ["down", "solo", "Maybe"],
    ["pass", "solo", "Skip"],
    ["must", "duo", "Must-do"],
    ["down", "group", "Down"],
    ["pass", "group", "Pass"],
  ] as const)("%s in %s → %s", (value, size, label) => expect(voteLabel(value, size)).toBe(label));
});

describe("computeOpenTo", () => {
  it("duo → both active members", () => expect(computeOpenTo("duo", ["a", "b"])).toEqual(["a", "b"]));
  it.each(["solo", "group"] as const)("%s → []", (size) => expect(computeOpenTo(size, ["a", "b", "c"])).toEqual([]));
  it("duo with wrong member count throws", () => expect(() => computeOpenTo("duo", ["a"])).toThrow());
});

describe("solo view (D55)", () => {
  it("shows only own vote", () => {
    expect(voteView({ viewerId: "a", size: "solo", votes: [v("a", "down", "solo"), v("b", "must", "group")] })).toEqual({
      mode: "solo",
      own: "down",
    });
  });
  it("no vote → own null", () => {
    expect(voteView({ viewerId: "a", size: "solo", votes: [] })).toEqual({ mode: "solo", own: null });
  });
});

describe("group view (FR-41/42)", () => {
  const votes = [v("a", "must", "group"), v("b", "down", "group"), v("c", "pass", "group"), v("d", "pass", "group")];

  it("blind until the viewer votes: no counts, no names", () => {
    expect(voteView({ viewerId: "e", size: "group", votes })).toEqual({ mode: "blind", own: null });
  });

  it("after voting: counts, Must/Down names, Pass count only", () => {
    const view = voteView({ viewerId: "a", size: "group", votes });
    expect(view).toEqual({
      mode: "group",
      own: "must",
      tally: { must: 1, down: 1, pass: 2 },
      named: [{ memberId: "b", value: "down" }],
    });
  });

  it("a Pass voter sees their own Pass but not other Passes by name", () => {
    const view = voteView({ viewerId: "c", size: "group", votes });
    if (view.mode !== "group") throw new Error();
    expect(view.own).toBe("pass");
    expect(view.tally.pass).toBe(2);
    expect(view.named.map((n) => n.memberId)).toEqual(["a", "b"]);
  });

  it("non-voters never appear anywhere (FR-42)", () => {
    const view = voteView({ viewerId: "a", size: "group", votes: [v("a", "must", "group")] });
    expect(view).toEqual({ mode: "group", own: "must", tally: { must: 1, down: 0, pass: 0 }, named: [] });
  });
});

describe("duo view (D56, FR-T5/T6)", () => {
  const pair = ["a", "b"];

  it("open from the start: no blind gate, Pass named for the pair", () => {
    const view = voteView({ viewerId: "a", size: "duo", votes: [v("b", "pass", "duo", pair)] });
    expect(view).toEqual({
      mode: "duo",
      own: null,
      tally: { must: 0, down: 0, pass: 1 },
      named: [{ memberId: "b", value: "pass" }],
    });
  });

  it("FR-T7 1–1 split shown plainly", () => {
    const view = voteView({ viewerId: "a", size: "duo", votes: [v("a", "must", "duo", pair), v("b", "pass", "duo", pair)] });
    expect(view).toMatchObject({ own: "must", tally: { must: 1, down: 0, pass: 1 }, named: [{ memberId: "b", value: "pass" }] });
  });
});

describe("size transitions", () => {
  it("FR-T5: group → duo never reveals group-cast Passes, not even as a count", () => {
    // Trip was a group (a, b, c). c left. a and b remain as a duo.
    const votes = [v("a", "must", "group"), v("b", "pass", "group"), v("c", "pass", "group")];
    const view = voteView({ viewerId: "a", size: "duo", votes: votes.filter((x) => x.memberId !== "c") });
    expect(view).toEqual({ mode: "duo", own: "must", tally: { must: 1, down: 0, pass: 0 }, named: [] });
  });

  it("FR-T5: group-cast Must/Down names are still shown in duo", () => {
    const view = voteView({ viewerId: "a", size: "duo", votes: [v("b", "down", "group")] });
    expect(view).toMatchObject({ named: [{ memberId: "b", value: "down" }], tally: { down: 1 } });
  });

  it("FR-T5: a member always sees their own group-cast Pass", () => {
    const view = voteView({ viewerId: "b", size: "duo", votes: [v("b", "pass", "group")] });
    expect(view).toMatchObject({ own: "pass", tally: { pass: 1 } });
  });

  it("FR-T5: new duo votes after shrinking follow duo rules", () => {
    const votes = [v("b", "pass", "group"), v("b", "pass", "duo", ["a", "b"])].slice(1);
    expect(voteView({ viewerId: "a", size: "duo", votes })).toMatchObject({ named: [{ memberId: "b", value: "pass" }] });
  });

  describe("FR-T4: duo → group", () => {
    const pair = ["a", "b"];
    const votes = [v("a", "must", "duo", pair), v("b", "pass", "duo", pair), v("c", "down", "group")];

    it("the original two still see each other's earlier votes (incl. Pass)", () => {
      const view = voteView({ viewerId: "a", size: "group", votes });
      expect(view).toMatchObject({
        tally: { must: 1, down: 1, pass: 1 },
        named: [
          { memberId: "b", value: "pass" },
          { memberId: "c", value: "down" },
        ],
      });
    });

    it("the newcomer sees earlier duo Passes only as a count", () => {
      const view = voteView({ viewerId: "c", size: "group", votes });
      expect(view).toEqual({
        mode: "group",
        own: "down",
        tally: { must: 1, down: 1, pass: 1 },
        named: [{ memberId: "a", value: "must" }],
      });
    });

    it("the newcomer is blind until they vote", () => {
      expect(voteView({ viewerId: "c", size: "group", votes: votes.slice(0, 2) }).mode).toBe("blind");
    });

    it("the original two are blind on new ideas they haven't voted on", () => {
      expect(voteView({ viewerId: "a", size: "group", votes: [v("c", "down", "group")] }).mode).toBe("blind");
    });
  });

  it("group → duo → group: group-cast Pass stays a count only for everyone", () => {
    const votes = [v("a", "must", "group"), v("b", "pass", "group"), v("d", "down", "group")];
    const view = voteView({ viewerId: "a", size: "group", votes });
    expect(view).toMatchObject({ tally: { pass: 1 }, named: [{ memberId: "d", value: "down" }] });
  });

  it("FR-T3: solo priorities carry over and open to the new pair", () => {
    const solo = [v("a", "pass", "solo"), v("a", "must", "solo"), v("x", "pass", "group")];
    const out = openSoloVotesToDuo(solo, ["a", "b"]);
    expect(out[0]!.openTo).toEqual(["a", "b"]);
    expect(out[1]!.openTo).toEqual(["a", "b"]);
    expect(out[2]!.openTo).toEqual([]); // group-cast votes are never re-opened
    expect(voteView({ viewerId: "b", size: "duo", votes: [out[0]!] })).toMatchObject({ named: [{ memberId: "a", value: "pass" }] });
    expect(solo[0]!.openTo).toEqual([]); // input not mutated
  });

  it("without carry-over re-stamping, a solo Skip is hidden in duo", () => {
    expect(voteView({ viewerId: "b", size: "duo", votes: [v("a", "pass", "solo")] })).toMatchObject({ named: [], tally: { pass: 0 } });
  });
});

describe("organizerTurnout (FR-42)", () => {
  it("organizers and owner get a number; members get nothing", () => {
    expect(organizerTurnout("owner", 3, 5)).toEqual({ voted: 3, eligible: 5 });
    expect(organizerTurnout("organizer", 3, 5)).toEqual({ voted: 3, eligible: 5 });
    expect(organizerTurnout("member", 3, 5)).toBeNull();
  });
});
