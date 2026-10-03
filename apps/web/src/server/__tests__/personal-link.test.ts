/**
 * Personal links: opening never joins (Q37), name confirmed once (Q1), second device refused (Q38).
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asService, memberLinks, members, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { acceptLinkTx, createPersonalLink, declineLinkTx, openLinkTx } from "@/lib/auth/personal-link";
import { createTrip } from "../trips";

let d: Db;
beforeEach(async () => {
  const { db } = await createPglite();
  d = db as unknown as Db;
});

async function invited() {
  const owner = randomUUID();
  await asService(d, (tx) => tx.insert(users).values({ id: owner, displayName: "Nick" }));
  const { tripId } = await createTrip(d, { userId: owner, ownerName: "Nick", name: "Nick & Sam", city: "Lisbon" });
  const [m] = await asService(d, (tx) =>
    tx.insert(members).values({ tripId, displayName: "Sam", status: "invited" }).returning({ id: members.id }),
  );
  const { token } = await asService(d, (tx) => createPersonalLink(tx, m!.id));
  return { tripId, memberId: m!.id, token };
}

const statusOf = async (id: string) =>
  (await asService(d, (tx) => tx.select({ s: members.status, n: members.displayName }).from(members).where(eq(members.id, id))))[0]!;

describe("personal links (Q1, Q37, Q38)", () => {
  it("opening shows a preview and doesn't join; accepting does", async () => {
    const t = await invited();
    const r = await asService(d, (tx) => openLinkTx(tx, t.token, "dev-1"));
    expect(r).toMatchObject({
      ok: true,
      kind: "confirm",
      step: "accept_invite",
      preview: { tripName: "Nick & Sam", yourName: "Sam", people: ["Nick"], ideaCount: 0 },
    });
    expect((await statusOf(t.memberId)).s).toBe("invited");
    // Another device can't accept (or open) it.
    expect(await asService(d, (tx) => acceptLinkTx(tx, { token: t.token, deviceHash: "dev-2" }))).toEqual({
      ok: false,
      error: "other_device",
    });
    const a = await asService(d, (tx) => acceptLinkTx(tx, { token: t.token, deviceHash: "dev-1", name: "Samantha" }));
    expect(a).toMatchObject({ ok: true, tripId: t.tripId, memberId: t.memberId });
    expect(await statusOf(t.memberId)).toEqual({ s: "active", n: "Samantha" });
    // Later opens go straight in.
    expect(await asService(d, (tx) => openLinkTx(tx, t.token, "dev-1"))).toMatchObject({ ok: true, kind: "open" });
  });

  it("a fresh link for someone who already confirmed opens directly (asked once per person)", async () => {
    const t = await invited();
    await asService(d, (tx) => openLinkTx(tx, t.token, "dev-1"));
    await asService(d, (tx) => acceptLinkTx(tx, { token: t.token, deviceHash: "dev-1" }));
    const { token } = await asService(d, (tx) => createPersonalLink(tx, t.memberId));
    expect(await asService(d, (tx) => openLinkTx(tx, token, "dev-1"))).toMatchObject({ ok: true, kind: "open" });
  });

  it("an active member's first open asks 'You're Sam?'", async () => {
    const t = await invited();
    await asService(d, (tx) => tx.update(members).set({ status: "active" }).where(eq(members.id, t.memberId)));
    expect(await asService(d, (tx) => openLinkTx(tx, t.token, "dev-1"))).toMatchObject({ kind: "confirm", step: "confirm_name" });
  });

  it("'Not me' joins nothing and frees the link for the real invitee", async () => {
    const t = await invited();
    await asService(d, (tx) => openLinkTx(tx, t.token, "dev-x"));
    expect(await asService(d, (tx) => declineLinkTx(tx, { token: t.token, deviceHash: "dev-x" }))).toBe(true);
    expect((await statusOf(t.memberId)).s).toBe("invited");
    const [l] = await asService(d, (tx) => tx.select().from(memberLinks).where(eq(memberLinks.memberId, t.memberId)));
    expect(l!.boundDeviceHash).toBeNull();
    expect(await asService(d, (tx) => openLinkTx(tx, t.token, "dev-sam"))).toMatchObject({ kind: "confirm" });
  });

  it("rejects a bad edited name", async () => {
    const t = await invited();
    await asService(d, (tx) => openLinkTx(tx, t.token, "dev-1"));
    expect(await asService(d, (tx) => acceptLinkTx(tx, { token: t.token, deviceHash: "dev-1", name: "   " }))).toEqual({
      ok: false,
      error: "bad_name",
    });
  });
});
