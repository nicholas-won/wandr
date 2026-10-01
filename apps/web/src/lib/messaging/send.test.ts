import { describe, expect, it } from "vitest";
import { APP_NAME } from "@wandr/core/config";
import { safeNextPath } from "@/lib/http";
import { smsSegments } from "./cost";
import { emailBodyFromText, redactLinks } from "./send";
import { texts } from "./templates";

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

describe("outbound logging", () => {
  it("never stores live personal-link tokens", () => {
    const body = texts.invite({ to: { name: "Jess", link: `https://x.app/l/${TOKEN}` }, inviterName: "Sam", tripName: "Lisbon" });
    const stored = redactLinks(body);
    expect(stored).not.toContain(TOKEN);
    expect(stored).toContain("/l/[redacted]");
  });

  it("turns a text into an email body without the SMS-only footer", () => {
    const body = texts.invite({ to: { name: "Jess", link: `https://x.app/l/${TOKEN}` }, inviterName: "Sam", tripName: "Lisbon" });
    const email = emailBodyFromText(body);
    expect(email.startsWith(`${APP_NAME}:`)).toBe(false);
    expect(email).not.toContain("Reply WRONG");
    expect(email).toContain(TOKEN);
  });
});

describe("SMS segments (cost estimate)", () => {
  it("counts GSM-7 and UCS-2 segments", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("€".repeat(80))).toBe(1);
    expect(smsSegments("€".repeat(81))).toBe(2);
    expect(smsSegments("hi 🌮")).toBe(1);
    expect(smsSegments(`${"a".repeat(70)}🌮`)).toBe(2);
  });

  it("keeps a typical invite to 2 segments or fewer", () => {
    const body = texts.invite({ to: { name: "Jessica", link: `https://wandr.example/l/${TOKEN}` }, inviterName: "Samantha", tripName: "Lisbon and Porto 2027" });
    expect(smsSegments(body)).toBeLessThanOrEqual(2);
  });
});

describe("safeNextPath", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNextPath("/t/abc")).toBe("/t/abc");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
