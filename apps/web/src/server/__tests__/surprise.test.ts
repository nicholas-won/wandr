/** Surprise mode + guest of honor (FR-90/91) against PGlite + RLS. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asService, ideas, members, planItems, pollOptions, polls, users, withSession, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { createTrip, getTripView } from "../trips";
import { setBachMode, setGuestOfHonor, setIdeaHiddenFrom } from "../surprise";

async function setup() {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const u = { ana: randomUUID(), bea: randomUUID(), cy: randomUUID() };
  await asService(d, (tx) =>
    tx.insert(users).values([
      { id: u.ana, displayName: "Ana" },
      { id: u.bea, displayName: "Bea" },
      { id: u.cy, displayName: "Cy" },
    ]),
  );
  const t = await createTrip(d, { userId: u.ana, ownerName: "Ana", name: "Bea's bach", city: "Nashville" });
  const ids = await asService(d, async (tx) => {
    const [bea, cy] = await tx
      .insert(members)
      .values([
        { tripId: t.tripId, userId: u.bea, displayName: "Bea", status: "active" },
        { tripId: t.tripId, userId: u.cy, displayName: "Cy", status: "active" },
      ])
      .returning({ id: members.id });
    const [idea] = await tx
      .insert(ideas)
      .values({ tripId: t.tripId, stopId: t.stopId, title: "Surprise karaoke", extraction: "resolved", status: "planned" })
      .returning({ id: ideas.id });
    await tx.insert(planItems).values({ tripId: t.tripId, stopId: t.stopId, ideaId: idea!.id, dayIndex: 0 });
    const [poll] = await tx.insert(polls).values({ tripId: t.tripId, kind: "ideas", question: "Night 1?" }).returning({ id: polls.id });
    await tx.insert(pollOptions).values({ pollId: poll!.id, ideaId: idea!.id, label: "Surprise karaoke" });
    return { bea: bea!.id, cy: cy!.id, ideaId: idea!.id, pollId: poll!.id };
  });
  return { d, u, ...t, ...ids };
}

describe("surprise mode", () => {
  it("hides the idea, its plan items and polls offering it from the guest of honor", async () => {
    const s = await setup();
    await setBachMode(s.d, { sub: s.u.ana }, { tripId: s.tripId, on: true });
    await setGuestOfHonor(s.d, { sub: s.u.ana }, { tripId: s.tripId, memberId: s.bea, on: true });
    // Ana tries to hide it from herself too: silently dropped so she doesn't lose it.
    const hidden = await setIdeaHiddenFrom(s.d, { sub: s.u.ana }, { ideaId: s.ideaId, memberIds: [s.bea, s.memberId] });
    expect(hidden).toEqual([s.bea]);

    const beaView = await getTripView(s.d, { sub: s.u.bea }, s.tripId);
    expect(beaView!.ideas).toHaveLength(0);
    const beaSees = await withSession(s.d, { sub: s.u.bea }, async (tx) => ({
      plan: await tx.select().from(planItems),
      polls: await tx.select().from(polls),
    }));
    expect(beaSees.plan).toHaveLength(0);
    expect(beaSees.polls).toHaveLength(0);

    const cyView = await getTripView(s.d, { sub: s.u.cy }, s.tripId);
    expect(cyView!.ideas.map((c) => c.title)).toEqual(["Surprise karaoke"]);
    const [p] = await asService(s.d, (tx) => tx.select().from(polls).where(eq(polls.id, s.pollId)));
    expect(p!.hiddenFrom).toEqual([s.bea]);
  });

  it("only organizers can hide things or mark a guest of honor", async () => {
    const s = await setup();
    await expect(setIdeaHiddenFrom(s.d, { sub: s.u.cy }, { ideaId: s.ideaId, memberIds: [s.bea] })).rejects.toThrow();
    await expect(setGuestOfHonor(s.d, { sub: s.u.cy }, { tripId: s.tripId, memberId: s.bea, on: true })).rejects.toThrow();
  });

  it("bach mode is group-only (§6.10)", async () => {
    const { db } = await createPglite();
    const d = db as unknown as Db;
    const uid = randomUUID();
    await asService(d, (tx) => tx.insert(users).values({ id: uid, displayName: "Solo" }));
    const t = await createTrip(d, { userId: uid, ownerName: "Solo", name: "Me" });
    await expect(setBachMode(d, { sub: uid }, { tripId: t.tripId, on: true })).rejects.toThrow("group_only");
  });
});
