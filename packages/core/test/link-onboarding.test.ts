import { describe, expect, it } from "vitest";
import { linkOpenStep, PHONE_PROMPT, shouldShowPhonePrompt } from "../src/link-onboarding";
import {
  deleteConfirmationMatches,
  deleteConfirmationWord,
  deletionPreviewLines,
} from "../src/trip-deletion";

const HOUR = 3_600_000;

describe("linkOpenStep (Q1, Q37)", () => {
  it("invited people accept explicitly; opening never joins", () => {
    expect(linkOpenStep({ memberStatus: "invited", nameConfirmedAt: null })).toBe("accept_invite");
    expect(linkOpenStep({ memberStatus: "invited", nameConfirmedAt: new Date() })).toBe("accept_invite");
  });
  it("members confirm their name on first open, then go straight in", () => {
    expect(linkOpenStep({ memberStatus: "active", nameConfirmedAt: null })).toBe("confirm_name");
    expect(linkOpenStep({ memberStatus: "active", nameConfirmedAt: new Date() })).toBe("open");
    expect(linkOpenStep({ memberStatus: "not_attending", nameConfirmedAt: new Date() })).toBe("open");
  });
  it("pending and removed people get nothing", () => {
    expect(linkOpenStep({ memberStatus: "removed", nameConfirmedAt: null })).toBe("not_available");
    expect(linkOpenStep({ memberStatus: "pending", nameConfirmedAt: null })).toBe("not_available");
  });
});

describe("shouldShowPhonePrompt (Q1)", () => {
  const now = Date.UTC(2026, 9, 2, 12);
  it("only for personal-link sessions after a few votes", () => {
    expect(shouldShowPhonePrompt({ scope: "link", votesCast: 0, dismissedAt: null, now })).toBe(false);
    expect(shouldShowPhonePrompt({ scope: "link", votesCast: PHONE_PROMPT.afterVotes - 1, dismissedAt: null, now })).toBe(false);
    expect(shouldShowPhonePrompt({ scope: "link", votesCast: PHONE_PROMPT.afterVotes, dismissedAt: null, now })).toBe(true);
    expect(shouldShowPhonePrompt({ scope: "full", votesCast: 10, dismissedAt: null, now })).toBe(false);
  });
  it("dismissed: back at most once a day", () => {
    const base = { scope: "link" as const, votesCast: 5, now };
    expect(shouldShowPhonePrompt({ ...base, dismissedAt: now - 23 * HOUR })).toBe(false);
    expect(shouldShowPhonePrompt({ ...base, dismissedAt: now - 24 * HOUR })).toBe(true);
  });
});

describe("trip deletion (JR3)", () => {
  it("typed confirmation matches the trip name, case and spacing aside", () => {
    expect(deleteConfirmationMatches("nick & sam", "Nick & Sam")).toBe(true);
    expect(deleteConfirmationMatches("  Nick   &  Sam ", "Nick & Sam")).toBe(true);
    expect(deleteConfirmationMatches("Nick", "Nick & Sam")).toBe(false);
    expect(deleteConfirmationMatches("", "Nick & Sam")).toBe(false);
  });
  it("a blank trip name asks for the word delete", () => {
    expect(deleteConfirmationWord("  ")).toBe("delete");
    expect(deleteConfirmationMatches("DELETE", " ")).toBe(true);
    expect(deleteConfirmationWord("Lisbon  trip")).toBe("Lisbon trip");
  });
  it("preview lines skip zeros and say money history is kept", () => {
    expect(
      deletionPreviewLines({ tripName: "x", otherMembers: 1, ideas: 3, votes: 0, polls: 0, planItems: 0, expenses: 2, payments: 1 }),
    ).toEqual(["1 person loses access", "3 ideas", "2 expenses and 1 payment (hidden, but the record is kept)"]);
    expect(
      deletionPreviewLines({ tripName: "x", otherMembers: 0, ideas: 0, votes: 0, polls: 0, planItems: 0, expenses: 0, payments: 0 }),
    ).toEqual([]);
  });
});
