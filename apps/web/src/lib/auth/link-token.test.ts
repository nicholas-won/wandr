import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateLinkToken, hashDeviceId, hashLinkToken, isWellFormedLinkToken } from "./link-token";

describe("personal link tokens (FR-4)", () => {
  it("are 32 random bytes in base64url (43 chars)", () => {
    const t = generateLinkToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(isWellFormedLinkToken(t)).toBe(true);
  });

  it("are unique", () => {
    const set = new Set(Array.from({ length: 200 }, generateLinkToken));
    expect(set.size).toBe(200);
  });

  it("store only the sha256 hex of the token", () => {
    const t = generateLinkToken();
    const h = hashLinkToken(t);
    expect(h).toBe(createHash("sha256").update(t).digest("hex"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
  });

  it("rejects malformed tokens before touching the DB", () => {
    for (const bad of ["", "short", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}/`, `${"a".repeat(42)}=`]) {
      expect(isWellFormedLinkToken(bad)).toBe(false);
    }
  });

  it("hashes device ids with a key, deterministically", () => {
    expect(hashDeviceId("dev-1")).toBe(hashDeviceId("dev-1"));
    expect(hashDeviceId("dev-1")).not.toBe(hashDeviceId("dev-2"));
    expect(hashDeviceId("dev-1")).not.toBe(createHash("sha256").update("device:dev-1").digest("hex"));
  });
});
