import { describe, expect, it } from "vitest";
import type { IdeaCard, SaveCard } from "@wandr/api-contract";
import { clipboardOfferLabel, firstUrl, linkKind, rawFromShare, sourceName } from "./links";
import { formatAsTyped, looksLikePhone, sanitizeCode, toE164Guess } from "./phone";
import { duoNotice, groupNames, nextVote, sizeLine, voteButtons, voteSummary, withMyVote } from "./votes";
import { groupSaves, UNSORTED_TITLE } from "./library";
import { defaultShareTarget, hrefForNotification } from "./routing";

const idea = (p: Partial<IdeaCard> = {}): IdeaCard => ({
  id: "i1",
  title: "Sushi Dai",
  category: "Food",
  summary: null,
  status: "idea",
  stopId: null,
  locationLabel: null,
  imageUrl: null,
  imageCredit: null,
  sourceUrl: null,
  processing: false,
  needsReview: false,
  notAPlace: false,
  myVote: null,
  tallyLabel: null,
  namedVotes: [],
  splitOpinions: null,
  rank: null,
  commentCount: 0,
  hiddenFromNames: [],
  ...p,
});

describe("links", () => {
  it("finds the first URL and trims punctuation", () => {
    expect(firstUrl("Look! https://vm.tiktok.com/ZM123/).")).toBe("https://vm.tiktok.com/ZM123/");
    expect(firstUrl("no link")).toBeNull();
  });
  it("names the kind of link", () => {
    expect(linkKind("https://www.tiktok.com/@a/video/1")).toBe("tiktok");
    expect(linkKind("https://www.instagram.com/reel/x")).toBe("instagram");
    expect(linkKind("https://maps.app.goo.gl/abc")).toBe("maps");
    expect(linkKind("https://www.google.com/maps/place/x")).toBe("maps");
    expect(linkKind("https://eviltiktok.com/x")).toBe("link");
    expect(linkKind("not a url")).toBe("link");
    expect(clipboardOfferLabel("https://vm.tiktok.com/x")).toBe("Add the TikTok you copied?");
    expect(clipboardOfferLabel(null)).toBe("Add the link you copied?");
    expect(sourceName("https://www.timeout.com/lisbon")).toBe("timeout.com");
  });
  it("builds raw text from a share", () => {
    expect(rawFromShare({ text: "Must go https://t.co/x", webUrl: "https://t.co/x" })).toBe("Must go https://t.co/x");
    expect(rawFromShare({ text: "Caption", webUrl: "https://t.co/x" })).toBe("https://t.co/x\nCaption");
    expect(rawFromShare({ text: "  ", webUrl: null })).toBeNull();
    expect(rawFromShare({ text: "x".repeat(5000) })!.length).toBe(4000);
  });
});

describe("phone", () => {
  it("guesses E.164 for US numbers", () => {
    expect(toE164Guess("(555) 123-4567")).toBe("+15551234567");
    expect(toE164Guess("1 555 123 4567")).toBe("+15551234567");
    expect(toE164Guess("+44 20 7946 0958")).toBe("+442079460958");
    expect(looksLikePhone("555-1234")).toBe(false);
    expect(looksLikePhone("5551234567")).toBe(true);
  });
  it("formats while typing and sanitises codes", () => {
    expect(formatAsTyped("555")).toBe("555");
    expect(formatAsTyped("5551234")).toBe("(555) 123-4");
    expect(formatAsTyped("5551234567")).toBe("(555) 123-4567");
    expect(sanitizeCode("12 34-5678")).toBe("123456");
  });
});

describe("votes", () => {
  it("uses solo labels from @wandr/core (D55)", () => {
    expect(voteButtons("solo", null, "X").map((b) => b.label)).toEqual(["Must-do", "Maybe", "Skip"]);
    expect(voteButtons("group", "down", "X").map((b) => b.label)).toEqual(["Must-do", "Down", "Pass"]);
    const [must] = voteButtons("duo", "must", "Sushi Dai");
    expect(must!.selected).toBe(true);
    expect(must!.accessibilityLabel).toBe("Must-do: Sushi Dai");
  });
  it("tapping the current vote clears it", () => {
    expect(nextVote("must", "must")).toBeNull();
    expect(nextVote("must", "pass")).toBe("pass");
    expect(nextVote(null, "down")).toBe("down");
  });
  it("summarises per trip size", () => {
    expect(voteSummary(idea({ myVote: "must" }), "solo")).toBeNull();
    const duo = idea({ namedVotes: [{ name: "Sam", label: "Down", isMe: false }, { name: "Nick", label: "Must-do", isMe: true }] });
    expect(voteSummary(duo, "duo")).toBe("You: Must-do · Sam: Down");
    expect(voteSummary(idea(), "group")).toBe("Vote to see how the group voted");
    expect(voteSummary(idea({ myVote: "down", tallyLabel: "3 of 4 are in" }), "group")).toBe("3 of 4 are in");
  });
  it("lists group names for Must-do and Down only after voting", () => {
    const named = [
      { name: "Sam", label: "Must-do", isMe: false },
      { name: "Nick", label: "Must-do", isMe: true },
      { name: "Ana", label: "Down", isMe: false },
    ];
    expect(groupNames(idea({ namedVotes: named }), "group")).toBeNull();
    expect(groupNames(idea({ myVote: "must", namedVotes: named }), "group")).toBe("Must-do: Sam, You · Down: Ana");
  });
  it("applies an optimistic vote without leaking a group Pass", () => {
    const g = withMyVote(idea(), "pass", "group", "Nick");
    expect(g.myVote).toBe("pass");
    expect(g.namedVotes).toEqual([]);
    const d = withMyVote(idea(), "pass", "duo", "Nick");
    expect(d.namedVotes).toEqual([{ name: "Nick", label: "Pass", isMe: true }]);
    expect(withMyVote(idea({ myVote: "must" }), null, "duo", "Nick").namedVotes).toEqual([]);
  });
  it("describes the trip size and the duo notice (FR-T6)", () => {
    const members = [
      { id: "a", displayName: "Nick", role: "owner" },
      { id: "b", displayName: "Sam", role: "member" },
    ];
    const me = { memberId: "a", role: "owner" as const, displayName: "Nick" };
    expect(sizeLine({ size: "duo", members, me })).toBe("You and Sam");
    expect(duoNotice({ size: "duo", members, me })).toBe("Sam sees your votes, and you see theirs.");
    expect(duoNotice({ size: "group", members, me })).toBeNull();
    expect(sizeLine({ size: "solo", members: members.slice(0, 1), me })).toBe("Just you");
  });
});

describe("library", () => {
  const save = (p: Partial<SaveCard>): SaveCard => ({
    id: Math.random().toString(),
    title: "x",
    category: "Food",
    summary: null,
    country: null,
    regionOrCity: null,
    imageUrl: null,
    imageCredit: null,
    processing: false,
    sourceUrl: null,
    ...p,
  });
  it("groups by city, biggest first, unsorted last", () => {
    const sections = groupSaves([
      save({ regionOrCity: "Kyoto", country: "Japan" }),
      save({}),
      save({ regionOrCity: "Lisbon", country: "Portugal" }),
      save({ regionOrCity: "Lisbon", country: "Portugal" }),
      save({ country: "Mexico" }),
    ]);
    expect(sections.map((s) => s.title)).toEqual(["Lisbon", "Kyoto", "Mexico", UNSORTED_TITLE]);
    expect(sections[0]!.subtitle).toBe("Portugal");
    expect(sections[2]!.subtitle).toBeNull();
  });
});

describe("routing", () => {
  it("maps notification data to a screen", () => {
    expect(hrefForNotification({ tripId: "t1" })).toBe("/trip/t1");
    expect(hrefForNotification({ tripId: "t1", ideaId: "i 2" })).toBe("/trip/t1?idea=i%202");
    expect(hrefForNotification({ url: "wandr://trip/abc" })).toBe("/trip/abc");
    expect(hrefForNotification({ url: "https://wandr.app/trip/abc" })).toBe("/trip/abc");
    expect(hrefForNotification({ screen: "library" })).toBe("/library");
    expect(hrefForNotification(null)).toBeNull();
    expect(hrefForNotification({ tripId: 42 })).toBeNull();
  });
  it("defaults shares to the most recent trip, else the library (FR-21)", () => {
    const trips = [
      { id: "a", name: "A", size: "solo" as const },
      { id: "b", name: "B", size: "duo" as const },
    ];
    expect(defaultShareTarget(trips, "b")).toEqual({ type: "trip", tripId: "b" });
    expect(defaultShareTarget(trips, "gone")).toEqual({ type: "trip", tripId: "a" });
    expect(defaultShareTarget([], null)).toEqual({ type: "library" });
  });
});
