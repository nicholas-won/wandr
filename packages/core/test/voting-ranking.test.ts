import { describe, expect, it } from "vitest";
import {
  approvalLabel,
  CROWDED_CATEGORY_THRESHOLD,
  crowdedCategoryShortlists,
  duoVoteLabel,
  isSplitOpinions,
  rankIdeas,
  rankIdeasDuo,
  rankIdeasSolo,
  rankingMode,
  scoreIdea,
  shuffleForViewer,
  shuffleKey,
  suggestShortlist,
  type RankableIdea,
  type SimpleVote,
  type VoteRecord,
} from "../src/voting";
import type { VoteValue } from "../src/domain";

const ALL = ["a", "b", "c", "d", "e", "f"];
/** Build votes from a compact string: "mmdp" → a:must b:must c:down d:pass ("-" = no vote). */
function votes(spec: string, ids = ALL): SimpleVote[] {
  const map: Record<string, VoteValue> = { m: "must", d: "down", p: "pass" };
  return [...spec].flatMap((ch, i) => (map[ch] ? [{ memberId: ids[i]!, value: map[ch]! }] : []));
}
const idea = (id: string, spec: string, createdAt = 0, eligible = ALL): RankableIdea => ({
  id,
  createdAt,
  votes: votes(spec),
  eligibleVoterIds: eligible,
});

describe("scoreIdea (FR-44)", () => {
  it("counts only eligible voters (attending the Stop); non-voters don't count", () => {
    const s = scoreIdea(idea("x", "mmdp--", 0, ["a", "b", "c"]));
    expect(s).toMatchObject({ voters: 3, inCount: 3, must: 2, down: 1, pass: 0, approval: 1 });
  });
  it("no votes → approval null", () => expect(scoreIdea(idea("x", "")).approval).toBeNull());
  it("duplicate votes for one member count once", () => {
    const s = scoreIdea({ id: "x", votes: [...votes("m"), ...votes("p")], eligibleVoterIds: ALL });
    expect(s.voters).toBe(1);
  });
});

describe("rankIdeas (FR-44, D41, V-7)", () => {
  it.each([
    // [description, ideas, expected order]
    ["higher approval wins", [idea("lo", "mp"), idea("hi", "dd")], ["hi", "lo"]],
    ["ties broken by Must-do count", [idea("down", "dd"), idea("must", "md")], ["must", "down"]],
    ["then earliest shared", [idea("late", "md", 2), idea("early", "md", 1)], ["early", "late"]],
    ["then id", [idea("b", "m", 1), idea("a", "m", 1)], ["a", "b"]],
    ["no-vote ideas rank last", [idea("none", ""), idea("zero", "p")], ["zero", "none"]],
    // 2/3 (0.667) vs 3/4 (0.75): exact comparison
    ["exact fractions", [idea("twoThirds", "mmp"), idea("threeQuarters", "dddp")], ["threeQuarters", "twoThirds"]],
    // 1/1 beats 5/6 — denominator is voters only
    ["non-voters don't drag down", [idea("many", "mmmmmp"), idea("one", "d")], ["one", "many"]],
  ] as const)("%s", (_d, ideas, order) => {
    expect(rankIdeas(ideas).map((r) => r.idea.id)).toEqual(order);
  });

  it("assigns 1-based ranks", () => {
    expect(rankIdeas([idea("x", "m"), idea("y", "p")]).map((r) => r.rank)).toEqual([1, 2]);
  });

  it("drops votes from members not attending that Stop", () => {
    const porto = idea("porto", "pppm", 0, ["d"]); // only d attends
    const lisbon = idea("lisbon", "mmp", 0);
    expect(rankIdeas([lisbon, porto]).map((r) => r.idea.id)).toEqual(["porto", "lisbon"]);
  });
});

describe("approvalLabel (FR-44)", () => {
  it.each([
    ["mmdddp", "5 of 6 are in · 2 Must-do 🔥"],
    ["ddp", "2 of 3 are in"],
    ["ppp", "0 of 3 are in"],
    ["", "No votes yet"],
  ])("%s → %s", (spec, label) => expect(approvalLabel(scoreIdea(idea("x", spec)))).toBe(label));
});

describe("isSplitOpinions (FR-44a)", () => {
  it.each([
    ["mmpp", true], // ≥2 must and ≥2 pass
    ["mmmmpp", true],
    ["mddp", false], // 1/4 pass < 1/3
    ["mdp", true], // 1/3 pass with a must
    ["mddddp", false], // 1/6
    ["mddp--", false],
    ["ddp", false], // no must
    ["mp", true], // 1/2
    ["pppp", false],
    ["mmmm", false],
    ["", false],
  ])("%s → %s", (spec, expected) => {
    expect(isSplitOpinions(scoreIdea(idea("x", spec)), "group")).toBe(expected);
  });
  it.each(["solo", "duo"] as const)("never in %s", (size) => {
    expect(isSplitOpinions(scoreIdea(idea("x", "mmpp")), size)).toBe(false);
  });
});

describe("shortlist (FR-44, FR-45)", () => {
  const many = (category: string, n: number, statusOf = (_i: number) => "idea" as const) =>
    Array.from({ length: n }, (_, i) => ({
      ...idea(`${category}${i}`, i % 2 ? "md" : "mp", i),
      category,
      status: statusOf(i),
    }));

  it("suggestShortlist takes top N open ideas with votes", () => {
    const ideas = [
      { ...idea("dropped", "mm"), category: "food", status: "dropped" as const },
      { ...idea("novotes", ""), category: "food", status: "idea" as const },
      { ...idea("good", "md"), category: "food", status: "shortlisted" as const },
      { ...idea("ok", "mp"), category: "food", status: "idea" as const },
    ];
    expect(suggestShortlist(rankIdeas(ideas), 5).map((r) => r.idea.id)).toEqual(["good", "ok"]);
    expect(suggestShortlist(rankIdeas(ideas), 1).map((r) => r.idea.id)).toEqual(["good"]);
  });

  it("flags a category as crowded at 12+ open ideas and suggests the top", () => {
    const ranked = rankIdeas([...many("food", CROWDED_CATEGORY_THRESHOLD), ...many("bar", 11)]);
    const out = crowdedCategoryShortlists(ranked, { n: 4 });
    const food = out.find((c) => c.category === "food")!;
    const bar = out.find((c) => c.category === "bar")!;
    expect(food).toMatchObject({ crowded: true, ideaCount: 12 });
    expect(food.suggested.map((r) => r.idea.id)).toEqual(["food1", "food3", "food5", "food7"]);
    expect(bar).toMatchObject({ crowded: false, ideaCount: 11, suggested: [] });
  });

  it("dropped ideas don't count toward crowding", () => {
    const ranked = rankIdeas(many("food", 12, (i) => (i === 0 ? ("dropped" as never) : "idea")));
    expect(crowdedCategoryShortlists(ranked)[0]).toMatchObject({ crowded: false, ideaCount: 11 });
  });
});

describe("duo ranking (§6.10, FR-T7)", () => {
  const pair = ["me", "sam"];
  const rec = (memberId: string, value: VoteValue, castInSize: "duo" | "group" = "duo"): VoteRecord => ({
    memberId,
    value,
    castInSize,
    openTo: castInSize === "duo" ? pair : [],
  });
  const names = { sam: "Sam" };
  const d = (id: string, vs: VoteRecord[], createdAt = 0) => ({ id, createdAt, votes: vs, eligibleVoterIds: pair });

  it("ideas both want rise to the top, then Must-do count, no percentages", () => {
    const ranked = rankIdeasDuo(
      "me",
      [
        d("oneIn", [rec("me", "must")]),
        d("split", [rec("me", "must"), rec("sam", "pass")]),
        d("bothDown", [rec("me", "down"), rec("sam", "down")]),
        d("bothMust", [rec("me", "must"), rec("sam", "must")]),
        d("none", []),
      ],
      names,
    );
    expect(ranked.map((r) => r.idea.id)).toEqual(["bothMust", "bothDown", "oneIn", "split", "none"]);
    expect(ranked[0]!.label).toBe("You: Must-do · Sam: Must-do");
    expect(ranked[3]!.label).toBe("You: Must-do · Sam: Pass");
    expect(ranked[4]!.label).toBe("No votes yet");
  });

  it("FR-T5: Sam's group-era Pass is not shown on the card", () => {
    expect(duoVoteLabel("me", { votes: [rec("me", "down"), rec("sam", "pass", "group")], eligibleVoterIds: pair }, names)).toBe(
      "You: Down",
    );
    expect(duoVoteLabel("me", { votes: [rec("sam", "down", "group")], eligibleVoterIds: pair }, names)).toBe("Sam: Down");
  });

  it("ignores votes from a member not attending the Stop", () => {
    expect(duoVoteLabel("me", { votes: [rec("sam", "must")], eligibleVoterIds: ["me"] }, names)).toBe("No votes yet");
  });
});

describe("solo ranking (§6.10)", () => {
  it("Must-do, then Maybe, then unprioritized, then Skip; earliest first within a tier", () => {
    const mk = (id: string, value: VoteValue | null, createdAt: number) => ({
      id,
      createdAt,
      votes: value ? [{ memberId: "me", value }] : [],
    });
    const ranked = rankIdeasSolo("me", [
      mk("skip", "pass", 0),
      mk("maybe", "down", 0),
      mk("none", null, 0),
      mk("must2", "must", 2),
      mk("must1", "must", 1),
    ]);
    expect(ranked.map((r) => r.idea.id)).toEqual(["must1", "must2", "maybe", "none", "skip"]);
    expect(ranked.map((r) => r.label)).toEqual(["Must-do", "Must-do", "Maybe", null, "Skip"]);
  });
});

describe("rankingMode", () => {
  it.each([
    ["solo", "personal"],
    ["duo", "duo"],
    ["group", "approval"],
  ] as const)("%s → %s", (size, mode) => expect(rankingMode(size)).toBe(mode));
});

describe("shuffleForViewer (FR-41)", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: `idea-${i}` }));

  it("is deterministic per viewer (stable across reloads)", () => {
    expect(shuffleForViewer("v1", items)).toEqual(shuffleForViewer("v1", [...items].reverse()));
  });
  it("differs between viewers", () => {
    expect(shuffleForViewer("v1", items).map((x) => x.id)).not.toEqual(shuffleForViewer("v2", items).map((x) => x.id));
  });
  it("is a permutation and doesn't mutate the input", () => {
    const copy = [...items];
    const out = shuffleForViewer("v1", items);
    expect(items).toEqual(copy);
    expect(out.map((x) => x.id).sort()).toEqual(copy.map((x) => x.id).sort());
    expect(out.map((x) => x.id)).not.toEqual(copy.map((x) => x.id));
  });
  it("adding an idea doesn't reorder the others", () => {
    const before = shuffleForViewer("v1", items).map((x) => x.id);
    const after = shuffleForViewer("v1", [...items, { id: "new" }])
      .map((x) => x.id)
      .filter((id) => id !== "new");
    expect(after).toEqual(before);
  });
  it("key depends on both viewer and idea", () => {
    expect(shuffleKey("a", "b")).toBe(shuffleKey("a", "b"));
    expect(shuffleKey("a", "b")).not.toBe(shuffleKey("b", "a"));
  });
});
