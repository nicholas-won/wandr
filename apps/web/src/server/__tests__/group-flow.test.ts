/** Group trip (3+): blind until you vote, Pass as count only (FR-41/42/44). */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asService, ideas, members, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { castVote, createTrip, getTripView } from "../trips";

describe("group hero flow", () => {
  it("is blind until you vote, then shows approval and hides Pass names", async () => {
    const { db } = await createPglite();
    const d = db as unknown as Db;
    const ids = { a: randomUUID(), b: randomUUID(), c: randomUUID() };
    await asService(d, (tx) =>
      tx.insert(users).values([
        { id: ids.a, displayName: "Ana" },
        { id: ids.b, displayName: "Ben" },
        { id: ids.c, displayName: "Cy" },
      ]),
    );
    const { tripId, memberId: ana, stopId } = await createTrip(d, { userId: ids.a, ownerName: "Ana", name: "Bach" });
    const { ben, cy, ideaIds } = await asService(d, async (tx) => {
      const rows = await tx
        .insert(members)
        .values([
          { tripId, userId: ids.b, displayName: "Ben", status: "active" },
          { tripId, userId: ids.c, displayName: "Cy", status: "active" },
        ])
        .returning({ id: members.id });
      const ideaRows = await tx
        .insert(ideas)
        .values(["Bar A", "Bar B"].map((title) => ({ tripId, stopId, title, extraction: "resolved" as const })))
        .returning({ id: ideas.id });
      return { ben: rows[0]!.id, cy: rows[1]!.id, ideaIds: ideaRows.map((r) => r.id) };
    });
    const [x] = ideaIds as [string, string];
    await castVote(d, { sub: ids.b }, { tripId, ideaId: x, memberId: ben, value: "must" });
    await castVote(d, { sub: ids.c }, { tripId, ideaId: x, memberId: cy, value: "pass" });

    let view = await getTripView(d, { sub: ids.a }, tripId);
    expect(view!.trip.size).toBe("group");
    for (const c of view!.ideas) {
      expect(c.tallyLabel).toBeNull();
      expect(c.namedVotes).toEqual([]);
    }

    await castVote(d, { sub: ids.a }, { tripId, ideaId: x, memberId: ana, value: "down" });
    view = await getTripView(d, { sub: ids.a }, tripId);
    const card = view!.ideas.find((c) => c.id === x)!;
    expect(card.tallyLabel).toBe("2 of 3 are in · 1 Must-do 🔥");
    expect(card.namedVotes.map((v) => v.name).sort()).toEqual(["Ben", "You"]); // Cy's Pass is anonymous
    // Un-voted card comes first (blind shuffle), voted card is ranked.
    expect(view!.ideas[0]!.myVote).toBeNull();
    expect(card.rank).toBe(1);
  });
});
