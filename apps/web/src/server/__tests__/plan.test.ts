/** "Arrange my days" end to end on PGlite (FR-O1/O3/O4/O17). */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asService, ideas, planItems, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { eq } from "drizzle-orm";
import { createTrip } from "../trips";
import { addToPlan, applyPlan, getPlanContext, isPlanOutOfDate, previewPlan, unplacedItems, updatePlanItem } from "../plan";

const SPOTS = [
  { title: "Time Out Market", category: "food" as const, lat: 38.7069, lng: -9.1457 },
  { title: "Belém Tower", category: "sight" as const, lat: 38.6916, lng: -9.216 },
  { title: "Jerónimos", category: "sight" as const, lat: 38.6979, lng: -9.2068 },
  { title: "Park Bar", category: "drink" as const, lat: 38.7116, lng: -9.1461 },
];

async function setup() {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const uid = randomUUID();
  await asService(d, (tx) => tx.insert(users).values({ id: uid, displayName: "Nick" }));
  const t = await createTrip(d, { userId: uid, ownerName: "Nick", name: "Lisbon", city: "Lisbon" });
  await asService(d, (tx) =>
    tx.insert(ideas).values(SPOTS.map((s) => ({ ...s, tripId: t.tripId, stopId: t.stopId, status: "planned" as const, extraction: "resolved" as const }))),
  );
  return { d, uid, ...t };
}

describe("plan", () => {
  it("previews without saving, then applies; locks survive re-runs", async () => {
    const s = await setup();
    const claims = { sub: s.uid };
    const ctx = (await getPlanContext(s.d, claims, s.tripId))!;
    expect(ctx.canApply).toBe(true);
    const plan = previewPlan(ctx);
    expect(plan.days.flatMap((d) => d.items)).toHaveLength(4);
    expect(await asService(s.d, (tx) => tx.select().from(planItems))).toHaveLength(0);

    await applyPlan(s.d, claims, s.tripId, null);
    const rows = await asService(s.d, (tx) => tx.select().from(planItems));
    expect(rows).toHaveLength(4);

    const target = rows[0]!;
    await updatePlanItem(s.d, claims, { planItemId: target.id, locked: true, dayIndex: 2 });
    await applyPlan(s.d, claims, s.tripId, null);
    const after = await asService(s.d, (tx) => tx.select().from(planItems));
    expect(after).toHaveLength(4);
    const kept = after.find((r) => r.id === target.id)!;
    expect(kept.dayIndex).toBe(2);
    expect(kept.locked).toBe(true);

    const fresh = (await getPlanContext(s.d, claims, s.tripId))!;
    expect(await isPlanOutOfDate(s.d, claims, s.tripId, fresh)).toBe(false);
    await asService(s.d, (tx) => tx.update(ideas).set({ status: "dropped" }).where(eq(ideas.title, "Park Bar")));
    const changed = (await getPlanContext(s.d, claims, s.tripId))!;
    expect(await isPlanOutOfDate(s.d, claims, s.tripId, changed)).toBe(true);
  });

  it("builds the plan by hand; hand-placed items survive Arrange my days (D70)", async () => {
    const s = await setup();
    const claims = { sub: s.uid };
    let ctx = (await getPlanContext(s.d, claims, s.tripId))!;
    expect(unplacedItems(ctx)).toHaveLength(4);
    const [bar] = await asService(s.d, (tx) => tx.select().from(ideas).where(eq(ideas.title, "Park Bar")));
    await addToPlan(s.d, claims, { tripId: s.tripId, stopId: s.stopId, ideaId: bar!.id, dayIndex: 2, startMinute: 21 * 60 });
    ctx = (await getPlanContext(s.d, claims, s.tripId))!;
    expect(unplacedItems(ctx).map((i) => i.title)).not.toContain("Park Bar");

    await applyPlan(s.d, claims, s.tripId, null);
    const rows = await asService(s.d, (tx) => tx.select().from(planItems));
    const barRow = rows.find((r) => r.ideaId === bar!.id)!;
    expect(barRow).toMatchObject({ dayIndex: 2, startMinute: 1260, locked: true });
    expect(rows.filter((r) => r.ideaId === bar!.id)).toHaveLength(1);
  });

  it("non-organizers can't apply (FR-O3)", async () => {
    const s = await setup();
    await expect(applyPlan(s.d, { link_member: s.memberId }, s.tripId, null)).rejects.toThrow();
  });
});
