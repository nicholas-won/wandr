import { describe, expect, it } from "vitest";
import {
  activeMemberIds,
  countsTowardSize,
  noticeBeforeGrowingFromSolo,
  noticeBeforeVote,
  transitionNotices,
  tripSize,
  tripSizeOf,
} from "../src/trip-size";
import type { MemberStatus, TripSize } from "../src/domain";

describe("tripSize (FR-T1)", () => {
  it.each<[number, TripSize]>([
    [0, "solo"],
    [1, "solo"],
    [2, "duo"],
    [3, "group"],
    [12, "group"],
  ])("%i active → %s", (n, size) => expect(tripSize(n)).toBe(size));

  it.each([-1, 1.5, Number.NaN])("rejects %s", (n) => expect(() => tripSize(n)).toThrow(RangeError));

  it.each<[MemberStatus, boolean]>([
    ["active", true],
    ["invited", false],
    ["pending", false],
    ["removed", false],
    ["not_attending", false],
  ])("status %s counts: %s", (s, c) => expect(countsTowardSize(s)).toBe(c));

  it("counts managed members (they are active rows) and ignores pending/removed", () => {
    const members = [
      { memberId: "a", status: "active" as const },
      { memberId: "kid", status: "active" as const }, // managed (FR-11)
      { memberId: "p", status: "pending" as const },
      { memberId: "r", status: "removed" as const },
    ];
    expect(tripSizeOf(members)).toBe("duo");
    expect(activeMemberIds(members)).toEqual(["a", "kid"]);
  });
});

describe("size-change notices (FR-T3..T6)", () => {
  it("FR-T3: owner sees solo→duo notice once, before the second person joins", () => {
    expect(noticeBeforeGrowingFromSolo("solo", [])).toEqual({ id: "solo_to_duo", audience: "owner", fr: "FR-T3" });
    expect(noticeBeforeGrowingFromSolo("solo", ["solo_to_duo"])).toBeNull();
    expect(noticeBeforeGrowingFromSolo("duo", [])).toBeNull();
  });

  it.each<[TripSize, TripSize, string[]]>([
    ["duo", "group", ["duo_to_group"]],
    ["group", "duo", ["group_to_duo"]],
    ["solo", "duo", []],
    ["solo", "group", []],
    ["group", "solo", []],
    ["duo", "solo", []],
    ["duo", "duo", []],
  ])("transition %s → %s", (from, to, ids) => {
    expect(transitionNotices(from, to).map((n) => n.id)).toEqual(ids);
  });

  it("FR-T6: duo vote notice shown once before the first duo vote", () => {
    expect(noticeBeforeVote("duo", [])?.id).toBe("duo_votes_visible");
    expect(noticeBeforeVote("duo", ["duo_votes_visible"])).toBeNull();
    expect(noticeBeforeVote("group", [])).toBeNull();
    expect(noticeBeforeVote("solo", [])).toBeNull();
  });

  it("FR-T5: after shrinking from a group, the group→duo notice comes first", () => {
    expect(noticeBeforeVote("duo", ["duo_votes_visible"], { shrankFromGroup: true })?.id).toBe("group_to_duo");
    expect(noticeBeforeVote("duo", ["group_to_duo"], { shrankFromGroup: true })?.id).toBe("duo_votes_visible");
    expect(noticeBeforeVote("duo", ["group_to_duo", "duo_votes_visible"], { shrankFromGroup: true })).toBeNull();
  });
});
