/** Edit an idea and move it between cities (founder feedback; FR-23, FR-S6). */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asService, ideas, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { editIdea } from "../ideas";
import { createTrip } from "../trips";

describe("edit idea", () => {
  it("renames, recategorizes and moves an idea between cities; link sessions can't", async () => {
    const { db } = await createPglite();
    const d = db as unknown as Db;
    const uid = randomUUID();
    await asService(d, (tx) => tx.insert(users).values({ id: uid, displayName: "Nick" }));
    const t = await createTrip(d, { userId: uid, ownerName: "Nick", name: "Portugal", destinations: ["Lisbon", "Porto"] });
    const other = await createTrip(d, { userId: uid, ownerName: "Nick", name: "Elsewhere", destinations: ["Rome"] });
    const [idea] = await asService(d, (tx) =>
      tx.insert(ideas).values({ tripId: t.tripId, stopId: t.stopId, title: "Livraria", extraction: "resolved" }).returning(),
    );
    const allStops = await asService(d, (tx) => tx.query.stops.findMany({ where: (s, { eq }) => eq(s.tripId, t.tripId) }));
    const porto = allStops.find((s) => s.name === "Porto")!;

    await editIdea(d, { sub: uid }, { ideaId: idea!.id, title: "Livraria Lello", category: "sight", stopId: porto.id });
    let [row] = await asService(d, (tx) => tx.select().from(ideas).where(eq(ideas.id, idea!.id)));
    expect(row).toMatchObject({ title: "Livraria Lello", category: "sight", stopId: porto.id });

    await editIdea(d, { sub: uid }, { ideaId: idea!.id, stopId: null });
    [row] = await asService(d, (tx) => tx.select().from(ideas).where(eq(ideas.id, idea!.id)));
    expect(row!.stopId).toBeNull();

    await expect(editIdea(d, { sub: uid }, { ideaId: idea!.id, stopId: other.stopId })).rejects.toThrow("bad_stop");
    await expect(editIdea(d, { link_member: t.memberId }, { ideaId: idea!.id, title: "Hacked" })).rejects.toThrow();
  });
});
