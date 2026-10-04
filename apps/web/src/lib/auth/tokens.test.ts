import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  MAX_LINK_GRANTS,
  mergeGrant,
  SESSION_TTL_SECONDS,
  shouldRefresh,
  signPayload,
  verifyPayload,
} from "./tokens";

const DAY = 24 * 60 * 60 * 1000;

describe("session cookies (J-6)", () => {
  it("round-trips a full session", async () => {
    const t = await signPayload({ k: "full", userId: "u1", needsRecheck: true }, SESSION_TTL_SECONDS);
    const v = await verifyPayload(t, "full");
    expect(v?.userId).toBe("u1");
    expect(v?.needsRecheck).toBe(true);
    expect(v!.exp - v!.iat).toBe(60 * 24 * 60 * 60);
  });

  it("refuses the wrong kind (a link grant is never a full session, FR-5)", async () => {
    const t = await signPayload({ k: "links", grants: [] }, SESSION_TTL_SECONDS);
    expect(await verifyPayload(t, "full")).toBeNull();
    expect(await verifyPayload(t, "links")).not.toBeNull();
  });

  it("refuses expired, tampered and foreign-key tokens", async () => {
    const now = Date.now();
    const t = await signPayload({ k: "full", userId: "u1" }, SESSION_TTL_SECONDS, now);
    expect(await verifyPayload(t, "full", now + 61 * DAY)).toBeNull();
    const [h, p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ k: "full", userId: "attacker", iat: 1, exp: 9e9 })).toString("base64url");
    expect(await verifyPayload(`${h}.${forged}.${s}`, "full")).toBeNull();
    expect(p).toBeTruthy();
    const other = await new SignJWT({ k: "full", userId: "u1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("x".repeat(40)));
    expect(await verifyPayload(other, "full")).toBeNull();
    expect(await verifyPayload(undefined, "full")).toBeNull();
    expect(await verifyPayload("garbage", "full")).toBeNull();
  });

  it("refreshes once a day (rolling)", () => {
    const now = Date.now();
    const iat = Math.floor(now / 1000);
    expect(shouldRefresh(iat, now + 1000)).toBe(false);
    expect(shouldRefresh(iat, now + DAY + 1000)).toBe(true);
  });

  it("keeps one grant per trip, newest first, capped", () => {
    let g = mergeGrant([], { memberId: "m1", tripId: "t1", linkId: "l1" });
    g = mergeGrant(g, { memberId: "m2", tripId: "t2", linkId: "l2" });
    g = mergeGrant(g, { memberId: "m1b", tripId: "t1", linkId: "l3" });
    expect(g.map((x) => x.tripId)).toEqual(["t1", "t2"]);
    expect(g[0]!.linkId).toBe("l3");
    for (let i = 0; i < 50; i++) g = mergeGrant(g, { memberId: `m${i}`, tripId: `x${i}`, linkId: `y${i}` });
    expect(g).toHaveLength(MAX_LINK_GRANTS);
  });
});
