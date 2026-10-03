/** What's new (D65): counts only what the caller can see, excluding their own activity. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asService, comments, ideas, members, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { createTrip } from "../trips";
import { isEmpty, whatsNew } from "../whats-new";

describe("what's new", () => {
  it("lists others' new ideas and comments since the last visit; hides surprises", async () => {
    const { db } = await createPglite();
    const d = db as unknown as Db;
    const u = { a: randomUUID(), b: randomUUID(), c: randomUUID() };
    await asService(d, (tx) =>
      tx.insert(users).values([{ id: u.a, displayName: "Ana" }, { id: u.b, displayName: "Ben" }, { id: u.c, displayName: "Cy" }]),
    );
    const t = await createTrip(d, { userId: u.a, ownerName: "Ana", name: "Trip" });
    const since = new Date(Date.now() - 60_000);
    const ids = await asService(d, async (tx) => {
      const [ben, cy] = await tx
        .insert(members)
        .values([
          { tripId: t.tripId, userId: u.b, displayName: "Ben", status: "active" },
          { tripId: t.tripId, userId: u.c, displayName: "Cy", status: "active" },
        ])
        .returning({ id: members.id });
      const [idea] = await tx
        .insert(ideas)
        .values([
          { tripId: t.tripId, title: "Bar", createdByMemberId: ben!.id, extraction: "resolved" },
          { tripId: t.tripId, title: "Surprise", createdByMemberId: ben!.id, extraction: "resolved", hiddenFrom: [cy!.id] },
          { tripId: t.tripId, title: "Mine", createdByMemberId: t.memberId, extraction: "resolved" },
        ])
        .returning({ id: ideas.id });
      await tx.insert(comments).values({ tripId: t.tripId, ideaId: idea!.id, memberId: ben!.id, body: "Looks fun" });
      return { ben: ben!.id, cy: cy!.id };
    });

    const forAna = await whatsNew(d, { sub: u.a }, { tripId: t.tripId, myMemberId: t.memberId, since });
    expect(forAna).toMatchObject({ newIdeas: { count: 2, by: ["Ben"] }, newComments: 1 });
    const forCy = await whatsNew(d, { sub: u.c }, { tripId: t.tripId, myMemberId: ids.cy, since });
    expect(forCy!.newIdeas.count).toBe(2); // Ben's visible idea + Ana's; never the surprise
    expect(await whatsNew(d, { sub: u.a }, { tripId: t.tripId, myMemberId: t.memberId, since: null })).toBeNull();
    expect(isEmpty(null)).toBe(true);
  });
});
