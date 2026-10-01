import { describe, expect, it } from "vitest";
import { APP_NAME } from "@wandr/core/config";
import { smsSegments } from "./cost";
import {
  containsFlaggedTerm,
  outboundText,
  replies,
  sanitizeFirstName,
  sanitizeTripName,
  texts,
  wrongFooter,
} from "./templates";

const LINK = "https://example.app/l/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

describe("trip name sanitizing (FR-86, J-19)", () => {
  it("keeps ordinary names", () => {
    expect(sanitizeTripName("Lisbon 2027")).toBe("Lisbon 2027");
    expect(sanitizeTripName("  Mo's   birthday  ")).toBe("Mo's birthday");
    expect(sanitizeTripName("Café São Paulo")).toBe("Café São Paulo");
  });

  it("strips URLs, bare domains, emails and phone numbers", () => {
    expect(sanitizeTripName("Tokyo https://bit.ly/x1")).toBe("Tokyo");
    expect(sanitizeTripName("Tokyo www.example.com/path")).toBe("Tokyo");
    expect(sanitizeTripName("Tokyo trip.link")).toBe("Tokyo");
    expect(sanitizeTripName("Call 415-555-1234 Tokyo")).toBe("Call Tokyo");
    expect(sanitizeTripName("Tokyo sam@example.com")).toBe("Tokyo");
  });

  it("strips emoji (keeps texts GSM-7 and filter-friendly)", () => {
    expect(sanitizeTripName("Mexico 🌮🌴")).toBe("Mexico");
    expect(smsSegments(sanitizeTripName("Mexico 🌮🌴"))).toBe(1);
  });

  it("falls back to 'your trip' for flagged words", () => {
    for (const name of ["Booze cruise 🍾", "Vegas shots weekend", "420 trip", "STRIP CLUB tour", "Wine country", "Free prize"]) {
      expect(sanitizeTripName(name)).toBe("your trip");
    }
  });

  it("does not flag words that merely contain a flagged term", () => {
    expect(containsFlaggedTerm("Bass fishing")).toBe(false);
    expect(containsFlaggedTerm("Essex")).toBe(false);
    expect(containsFlaggedTerm("Gunnison")).toBe(false);
    expect(containsFlaggedTerm("Rumford")).toBe(false);
  });

  it("falls back when nothing usable is left", () => {
    expect(sanitizeTripName("")).toBe("your trip");
    expect(sanitizeTripName(null)).toBe("your trip");
    expect(sanitizeTripName("https://evil.example")).toBe("your trip");
    expect(sanitizeTripName("🎉🎉")).toBe("your trip");
  });

  it("caps length", () => {
    const s = sanitizeTripName("The Very Long Annual Summer Reunion Road Trip Extravaganza");
    expect(s.length).toBeLessThanOrEqual(30);
    expect(s.endsWith("...")).toBe(true);
  });

  it("removes control characters", () => {
    expect(sanitizeTripName("Rome\u0000‮ trip")).toBe("Rome trip");
  });
});

describe("outbound texts (FR-81, FR-16)", () => {
  it("always include the personal link and a WRONG footer", () => {
    const t = texts.invite({ to: { name: "Jess Park", link: LINK }, inviterName: "Sam", tripName: "Lisbon" });
    expect(t.startsWith(`${APP_NAME}: `)).toBe(true);
    expect(t).toContain("Hi Jess! Sam added you to Lisbon.");
    expect(t).toContain(LINK);
    expect(t.endsWith("Not Jess? Reply WRONG")).toBe(true);
  });

  it("refuses to build a text without a personal link", () => {
    expect(() => outboundText("hi", { name: "Sam", link: "" })).toThrow();
  });

  it("uses a neutral footer when the name is unusable", () => {
    expect(wrongFooter("")).toBe("Not you? Reply WRONG");
    expect(wrongFooter("http://x.com")).toBe("Not you? Reply WRONG");
    expect(sanitizeFirstName("Sam Lee")).toBe("Sam");
  });

  it("sanitizes trip names and idea titles in every template", () => {
    const t = texts.voteQuestion({ to: { name: "Mo", link: LINK }, tripName: "Booze cruise", ideaTitle: "Taberna https://x.co" });
    expect(t).toContain("New idea for your trip: Taberna.");
    expect(t).toContain("Reply 1 Must-do, 2 Down, 3 Pass");
    expect(t).not.toMatch(/booze|x\.co/i);
  });

  it("shows only the last 4 digits of a requester's number (J-20)", () => {
    const t = texts.joinRequest({ to: { name: "Sam", link: LINK }, requesterName: "Mike", requesterLast4: "+1 213 373 4253", tripName: "Lisbon" });
    expect(t).toContain("Mike (4253) wants to join Lisbon. Reply Y to approve or N to deny.");
    expect(t).not.toContain("213");
  });

  it("never carries money amounts or marketing", () => {
    const all = [
      texts.invite({ to: { name: "A", link: LINK }, inviterName: "B", tripName: "C" }),
      texts.expenseAdded({ to: { name: "A", link: LINK }, payerName: "B", tripName: "C" }),
      texts.pollClosing({ to: { name: "A", link: LINK }, tripName: "C", hoursLeft: 2 }),
    ];
    for (const t of all) {
      expect(t).not.toMatch(/\$\d|deal|discount|% off|download the app/i);
    }
  });

  it("confirms votes with UNDO (FR-82)", () => {
    expect(replies.voteRecorded({ ideaTitle: "Taberna", value: "must" })).toBe("Got it: Must-do for Taberna. Reply UNDO to change.");
  });
});
