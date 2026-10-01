import { describe, expect, it } from "vitest";
import { attemptsExhausted, decideOtpRequest, needsRecycledNumberCheck, type OtpCounts } from "./rate-limit";

const zero: OtpCounts = { destination10m: 0, destinationDay: 0, ip10m: 0, ipDay: 0, tripDay: 0 };

describe("code request limits (FR-15, J-16)", () => {
  it("allows a first request without CAPTCHA", () => {
    expect(decideOtpRequest(zero)).toEqual({ kind: "allow", captcha: false });
  });

  it("asks for CAPTCHA on a repeat to the same number", () => {
    expect(decideOtpRequest({ ...zero, destination10m: 1, destinationDay: 1 })).toEqual({ kind: "allow", captcha: true });
  });

  it("asks for CAPTCHA when one IP requests several codes", () => {
    expect(decideOtpRequest({ ...zero, ip10m: 3, ipDay: 3 })).toEqual({ kind: "allow", captcha: true });
  });

  it("limits a number to 3 per 10 minutes and 10 per day", () => {
    expect(decideOtpRequest({ ...zero, destination10m: 3, destinationDay: 3 })).toEqual({ kind: "limited", scope: "destination" });
    expect(decideOtpRequest({ ...zero, destinationDay: 10 })).toEqual({ kind: "limited", scope: "destination" });
  });

  it("limits per IP and per trip", () => {
    expect(decideOtpRequest({ ...zero, ip10m: 10 })).toEqual({ kind: "limited", scope: "ip" });
    expect(decideOtpRequest({ ...zero, ipDay: 30 })).toEqual({ kind: "limited", scope: "ip" });
    expect(decideOtpRequest({ ...zero, tripDay: 40 })).toEqual({ kind: "limited", scope: "trip" });
  });

  it("allows 5 code attempts (J-17)", () => {
    expect(attemptsExhausted(4)).toBe(false);
    expect(attemptsExhausted(5)).toBe(true);
  });
});

describe("recycled-number check (FR-16, J-4)", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it("flags a known number inactive for more than 60 days", () => {
    expect(needsRecycledNumberCheck(daysAgo(61), false, now)).toBe(true);
    expect(needsRecycledNumberCheck(daysAgo(59), false, now)).toBe(false);
  });

  it("never flags a brand-new person", () => {
    expect(needsRecycledNumberCheck(null, true, now)).toBe(false);
    expect(needsRecycledNumberCheck(daysAgo(400), true, now)).toBe(false);
  });
});
