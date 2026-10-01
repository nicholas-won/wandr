import { describe, expect, it } from "vitest";
import { maskPhone, normalizeEmail, normalizePhone } from "./phone";

describe("phone normalization (FR-14)", () => {
  it("normalizes US input to E.164", () => {
    for (const input of ["(213) 373-4253", "213-373-4253", "+1 213 373 4253", "12133734253"]) {
      const r = normalizePhone(input);
      expect(r).toMatchObject({ ok: true, e164: "+12133734253", country: "US", smsSupported: true });
    }
  });

  it("supports SMS for Canada", () => {
    expect(normalizePhone("+1 416 979 2345")).toMatchObject({
      ok: true,
      country: "CA",
      smsSupported: true,
    });
  });

  it("parses other countries but routes them to email", () => {
    expect(normalizePhone("+44 20 7946 0958")).toMatchObject({ ok: true, smsSupported: false });
    expect(normalizePhone("+91 98765 43210")).toMatchObject({ ok: true, smsSupported: false });
  });

  it("rejects junk", () => {
    for (const bad of ["", "123", "not a number", "+1 000 000 0000", "9".repeat(40)]) {
      expect(normalizePhone(bad).ok).toBe(false);
    }
  });

  it("masks to the last 4 digits only (NFR-3)", () => {
    expect(maskPhone("+12133734253")).toBe("•••• 4253");
  });

  it("normalizes emails", () => {
    expect(normalizeEmail("  Sam@Example.COM ")).toBe("sam@example.com");
    expect(normalizeEmail("nope")).toBeNull();
  });
});
