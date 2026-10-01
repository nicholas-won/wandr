import { describe, expect, it } from "vitest";
import { decideText, type ThrottleInput } from "./throttle";

const base: ThrottleInput = {
  timeSensitive: false,
  optedOut: false,
  smsSupported: true,
  hasEmail: false,
  sentToPersonLast24h: 0,
  sentToMemberThisTrip: 0,
  spendTodayMicros: 0,
  estimatedCostMicros: 8_300,
  dailyCapMicros: 20_000_000,
};

describe("text throttle (FR-84, FR-85, J-15)", () => {
  it("sends a first text", () => {
    expect(decideText(base)).toEqual({ channel: "sms" });
  });

  it("allows only 1 non-urgent text per person per day, across all trips", () => {
    expect(decideText({ ...base, sentToPersonLast24h: 1 })).toEqual({ channel: "none", reason: "daily_person_cap" });
    expect(decideText({ ...base, sentToPersonLast24h: 1, hasEmail: true })).toEqual({ channel: "email", reason: "daily_person_cap" });
  });

  it("lets time-sensitive texts through the daily and trip caps (N-5)", () => {
    expect(decideText({ ...base, timeSensitive: true, sentToPersonLast24h: 5, sentToMemberThisTrip: 30 })).toEqual({ channel: "sms" });
  });

  it("caps non-urgent texts at 12 per member per trip", () => {
    expect(decideText({ ...base, sentToMemberThisTrip: 11 })).toEqual({ channel: "sms" });
    expect(decideText({ ...base, sentToMemberThisTrip: 12 })).toEqual({ channel: "none", reason: "trip_cap" });
  });

  it("never texts opted-out numbers, even time-sensitive; email instead", () => {
    expect(decideText({ ...base, optedOut: true, timeSensitive: true })).toEqual({ channel: "none", reason: "opted_out" });
    expect(decideText({ ...base, optedOut: true, hasEmail: true })).toEqual({ channel: "email", reason: "opted_out" });
  });

  it("emails non-US/CA numbers (FR-14)", () => {
    expect(decideText({ ...base, smsSupported: false, hasEmail: true })).toEqual({ channel: "email", reason: "sms_unsupported" });
  });

  it("enforces the daily spend cap for every text", () => {
    const atCap = { ...base, spendTodayMicros: 19_995_000 };
    expect(decideText(atCap)).toEqual({ channel: "none", reason: "spend_cap" });
    expect(decideText({ ...atCap, timeSensitive: true })).toEqual({ channel: "none", reason: "spend_cap" });
    expect(decideText({ ...base, spendTodayMicros: 19_990_000 })).toEqual({ channel: "sms" });
  });
});
