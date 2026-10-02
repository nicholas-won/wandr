import { describe, expect, it } from "vitest";
import {
  balanceDirections,
  buildShareSnapshot,
  channelFor,
  digestDay,
  digestEnabled,
  pickActiveTrip,
  pollFallbackDue,
  pollNudgeDue,
  pollTextRecipients,
  scrubShareText,
  shareCopy,
  shareMessage,
  sharePromptLabel,
  ShareRefusedError,
} from "../src/messaging";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const H = 3_600_000;
const D = 24 * H;

describe("channels (FR-80, §6.10)", () => {
  it("routes personal things to SMS and group news to the group chat", () => {
    expect(channelFor("expense", { hasApp: false, size: "group" })).toEqual(["sms"]);
    expect(channelFor("poll_closing", { hasApp: false, size: "duo" })).toEqual(["sms"]);
    expect(channelFor("new_poll", { hasApp: false, size: "group" })).toEqual(["group_share"]);
    expect(channelFor("digest", { hasApp: true, size: "group" })).toEqual(["email"]);
    expect(channelFor("digest", { hasApp: false, size: "group" })).toEqual(["group_share"]);
  });
  it("sends nothing in solo trips", () => {
    expect(channelFor("expense", { hasApp: false, size: "solo" })).toEqual([]);
  });
  it("digest defaults: group on, duo and solo off", () => {
    expect(digestEnabled("group")).toBe(true);
    expect(digestEnabled("duo")).toBe(false);
    expect(digestEnabled("solo")).toBe(false);
  });
  it("duo share prompts read 'Send to Sam'", () => {
    expect(sharePromptLabel("duo", ["Sam Lee"])).toBe("Send to Sam");
    expect(sharePromptLabel("group", ["Sam", "Ana"])).toBe("Share to the group chat");
  });
});

describe("active trip routing (FR-83, §14 default)", () => {
  const trip = (tripId: string, lastActivityAt: number, stopDates: { start: string | null; end: string | null }[] = []) => ({
    tripId,
    lastActivityAt,
    stopDates,
  });
  it("picks the most recently active trip within 14 days", () => {
    expect(pickActiveTrip([trip("a", NOW - 3 * D), trip("b", NOW - 1 * D)], NOW)).toBe("b");
  });
  it("stale trips route to the library (null)", () => {
    expect(pickActiveTrip([trip("a", NOW - 20 * D)], NOW)).toBeNull();
    expect(pickActiveTrip([], NOW)).toBeNull();
  });
  it("a stale trip with dates in the next 60 days counts", () => {
    expect(pickActiveTrip([trip("a", NOW - 90 * D, [{ start: "2026-11-15", end: "2026-11-20" }])], NOW)).toBe("a");
    expect(pickActiveTrip([trip("a", NOW - 90 * D, [{ start: "2027-03-01", end: null }])], NOW)).toBeNull();
  });
  it("a trip happening now counts; a finished one doesn't", () => {
    expect(pickActiveTrip([trip("a", NOW - 90 * D, [{ start: "2026-09-28", end: "2026-10-03" }])], NOW)).toBe("a");
    expect(pickActiveTrip([trip("a", NOW - 90 * D, [{ start: "2026-09-01", end: "2026-09-05" }])], NOW)).toBeNull();
  });
});

describe("poll timing (FR-47, FR-80c, N-5)", () => {
  const base = { createdAt: NOW - 13 * H, closesAt: NOW + 2 * H, closedAt: null, sharedAt: null, hiddenFrom: [] };
  it("nudges only inside the closing window", () => {
    expect(pollNudgeDue(base, NOW)).toBe(true);
    expect(pollNudgeDue({ ...base, closesAt: NOW + 5 * H }, NOW)).toBe(false);
    expect(pollNudgeDue({ ...base, closesAt: null }, NOW)).toBe(false);
    expect(pollNudgeDue({ ...base, closedAt: NOW - H }, NOW)).toBe(false);
    expect(pollNudgeDue({ ...base, closesAt: NOW - 1 }, NOW)).toBe(false);
  });
  it("falls back after ~12h unshared", () => {
    expect(pollFallbackDue(base, NOW)).toBe(true);
    expect(pollFallbackDue({ ...base, createdAt: NOW - 2 * H }, NOW)).toBe(false);
    expect(pollFallbackDue({ ...base, sharedAt: NOW - H }, NOW)).toBe(false);
  });
  it("surprise polls go by personal text right away (FR-80d)", () => {
    expect(pollFallbackDue({ ...base, createdAt: NOW, hiddenFrom: ["goh"] }, NOW)).toBe(true);
  });
  it("texts only non-voters not yet texted", () => {
    expect(pollTextRecipients({ eligible: ["a", "b", "c", "d"], voted: ["a"], alreadyTexted: ["b"], exclude: ["d"] })).toEqual(["c"]);
  });
});

describe("money texts", () => {
  it("gives a direction per currency, never amounts", () => {
    const r = balanceDirections({ USD: { a: -1250, b: 1250 }, EUR: { a: 300, b: -300 }, MXN: { a: 0 } }, "a");
    expect(r).toEqual([
      { currency: "EUR", direction: "owed" },
      { currency: "MXN", direction: "settled" },
      { currency: "USD", direction: "owes" },
    ]);
  });
});

describe("share snapshots (FR-80b/d/e)", () => {
  it("refuses surprise ideas, polls and decisions", () => {
    expect(() =>
      buildShareSnapshot({ kind: "idea", tripName: "T", idea: { title: "x", category: null, city: null, summary: null, imageUrl: null, hiddenFrom: ["g"] } }),
    ).toThrow(ShareRefusedError);
    expect(() =>
      buildShareSnapshot({ kind: "poll", tripName: "T", poll: { question: "q", options: ["a"], closesAt: null, hiddenFrom: ["g"] } }),
    ).toThrow(ShareRefusedError);
    expect(() =>
      buildShareSnapshot({ kind: "decision", tripName: "T", poll: { question: "q", winner: "a", hiddenFrom: ["g"] } }),
    ).toThrow(ShareRefusedError);
  });
  it("digest drops surprise ideas, including from the count", () => {
    const s = buildShareSnapshot({
      kind: "digest",
      tripName: "Lisbon",
      day: "2026-10-01",
      ideas: [
        { title: "Time Out Market", hiddenFrom: [] },
        { title: "Secret party boat", hiddenFrom: ["goh"] },
      ],
    });
    expect(s).toMatchObject({ kind: "digest", count: 1, titles: ["Time Out Market"] });
    expect(JSON.stringify(s)).not.toContain("Secret");
  });
  it("a digest of only surprise items is refused", () => {
    expect(() =>
      buildShareSnapshot({ kind: "digest", tripName: "T", day: "d", ideas: [{ title: "x", hiddenFrom: ["g"] }] }),
    ).toThrow(ShareRefusedError);
  });
  it("scrubs phone numbers and emails from user text", () => {
    expect(scrubShareText("Call Sam +1 (415) 555-0100 or sam@x.com", 80)).toBe("Call Sam or");
    const s = buildShareSnapshot({
      kind: "poll",
      tripName: "Trip 415-555-0100",
      poll: { question: "Dinner?", options: ["A 4155550100", "B"], closesAt: NOW, hiddenFrom: [] },
    });
    expect(JSON.stringify(s)).not.toMatch(/555/);
  });
  it("poll cards have options and deadline but no tally fields", () => {
    const s = buildShareSnapshot({
      kind: "poll",
      tripName: "Lisbon",
      poll: { question: "Saturday dinner", options: ["Taberna", "Ramiro"], closesAt: NOW, hiddenFrom: [] },
    });
    expect(Object.keys(s).sort()).toEqual(["closesAt", "kind", "options", "question", "tripName"]);
    expect(shareCopy(s).cta).toBe("Tap to vote");
    expect(shareMessage(s, "https://x/s/poll/1")).toBe("Vote: Saturday dinner Tap to vote: https://x/s/poll/1");
  });
  it("drops non-https images", () => {
    const s = buildShareSnapshot({
      kind: "idea",
      tripName: "T",
      idea: { title: "x", category: null, city: null, summary: null, imageUrl: "http://169.254.169.254/x", hiddenFrom: [] },
    });
    expect(s).toMatchObject({ imageUrl: null });
  });
  it("digest day is a UTC date", () => {
    expect(digestDay(NOW)).toBe("2026-10-01");
  });
});
