/**
 * Hero slice against real Postgres + RLS: a duo trip (the founder's first test, D54).
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asService, ideas, ideaSources, members, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { castVote, createTrip, getTripView } from "../trips";

async function setup() {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const nick = randomUUID();
  const sam = randomUUID();
  await asService(d, async (tx) => {
    await tx.insert(users).values([
      { id: nick, displayName: "Nick", phone: "+12025550101" },
      { id: sam, displayName: "Sam", phone: "+12025550102" },
    ]);
  });
  const { tripId, memberId: nickMember, stopId } = await createTrip(d, {
    userId: nick,
    ownerName: "Nick",
    name: "Lisbon with Sam",
    city: "Lisbon",
  });
  const samMember = await asService(d, async (tx) => {
    const [m] = await tx
      .insert(members)
      .values({ tripId, userId: sam, displayName: "Sam", status: "active", joinedAt: new Date() })
      .returning({ id: members.id });
    const [idea] = await tx
      .insert(ideas)
      .values({ tripId, stopId, title: "Time Out Market", category: "food", extraction: "resolved", confidence: 0.9, createdByMemberId: nickMember })
      .returning({ id: ideas.id });
    await tx.insert(ideaSources).values({ ideaId: idea!.id, kind: "tiktok", url: "https://www.tiktok.com/@x/video/1", sharedByMemberId: nickMember });
    return { memberId: m!.id, ideaId: idea!.id };
  });
  return { d, nick, sam, tripId, nickMember, samMember: samMember.memberId, ideaId: samMember.ideaId };
}

describe("duo hero flow", () => {
  it("shows both votes openly in a duo (§6.10, FR-T7)", async () => {
    const s = await setup();
    let view = await getTripView(s.d, { sub: s.nick }, s.tripId);
    expect(view!.trip.size).toBe("duo");
    expect(view!.ideas).toHaveLength(1);
    expect(view!.ideas[0]!.sharedBy).toEqual(["You"]);

    await castVote(s.d, { sub: s.nick }, { tripId: s.tripId, ideaId: s.ideaId, memberId: s.nickMember, value: "must" });
    // Sam votes through a personal link session (view + vote only, FR-5).
    await castVote(s.d, { link_member: s.samMember }, { tripId: s.tripId, ideaId: s.ideaId, memberId: s.samMember, value: "pass" });

    view = await getTripView(s.d, { sub: s.nick }, s.tripId);
    const card = view!.ideas[0]!;
    expect(card.myVote).toBe("must");
    expect(card.namedVotes.map((v) => `${v.name}: ${v.label}`)).toEqual(["You: Must-do", "Sam: Pass"]);
    expect(card.tallyLabel).toBeNull(); // no percentages in duo

    const samView = await getTripView(s.d, { link_member: s.samMember }, s.tripId);
    expect(samView!.ideas[0]!.namedVotes.map((v) => v.name)).toEqual(["You", "Nick"]);
  });

  it("a stranger can't see the trip", async () => {
    const s = await setup();
    const view = await getTripView(s.d, { sub: randomUUID() }, s.tripId);
    expect(view).toBeNull();
  });

  it("can't vote as someone else", async () => {
    const s = await setup();
    await expect(
      castVote(s.d, { link_member: s.samMember }, { tripId: s.tripId, ideaId: s.ideaId, memberId: s.nickMember, value: "must" }),
    ).rejects.toThrow();
  });
});
