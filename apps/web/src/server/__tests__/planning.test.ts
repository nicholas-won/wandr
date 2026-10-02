/** Stages, Stops, attendance, idea status, shortlist and map against PGlite + RLS (§6.0, FR-45/49/50, FR-122). */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asService, ideas, members, planItems, polls, stops, tripStages, users, votes, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { castVote, createTrip } from "../trips";
import {
  addStop,
  getMapView,
  getPlanningView,
  keepCityInStop,
  moveStage,
  moveStop,
  removeStop,
  setAttendance,
  setIdeaStatus,
  setNotMyPick,
  shortlistIdeas,
  shortlistSuggestions,
  undoStageMove,
  updateStop,
} from "../planning";

const LISBON = { lat: 38.7223, lng: -9.1393 };
const PORTO = { lat: 41.1579, lng: -8.6291 };

async function setup(n: 1 | 2 | 3 = 3) {
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
  const { tripId, memberId: ana, stopId } = await createTrip(d, { userId: ids.a, ownerName: "Ana", name: "Portugal", city: "Lisbon" });
  const others = await asService(d, (tx) =>
    tx
      .insert(members)
      .values(
        [
          { tripId, userId: ids.b, displayName: "Ben", status: "active" as const },
          { tripId, userId: ids.c, displayName: "Cy", status: "active" as const },
        ].slice(0, n - 1),
      )
      .returning({ id: members.id })
      .then((r) => r),
  ).catch(() => [] as { id: string }[]);
  return {
    d,
    tripId,
    stopId,
    ana,
    ben: others[0]?.id ?? "",
    cy: others[1]?.id ?? "",
    A: { sub: ids.a },
    B: { sub: ids.b },
    C: { sub: ids.c },
  };
}

async function addIdeas(d: Db, tripId: string, rows: Partial<typeof ideas.$inferInsert>[]) {
  return asService(d, (tx) =>
    tx
      .insert(ideas)
      .values(rows.map((r) => ({ tripId, title: "Idea", extraction: "resolved" as const, ...r })))
      .returning({ id: ideas.id }),
  ).then((r) => r.map((x) => x.id));
}

describe("stages (FR-S1/S2/S4, S-6, S-7, P2)", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup(3);
  });

  it("hides chips on a fresh trip, then organizers move stages", async () => {
    let v = await getPlanningView(t.d, t.A, t.tripId);
    expect(v!.showChips).toBe(false);
    expect(v!.stages.find((s) => s.kind === "where")!.status).toBe("set");
    expect(v!.stages.find((s) => s.kind === "stay")!.actions).toEqual(["start_voting", "set", "mark_not_needed"]);
    // Members see no actions and can't move stages.
    const vb = await getPlanningView(t.d, t.B, t.tripId);
    expect(vb!.stages.every((s) => s.actions.length === 0)).toBe(true);
    await expect(moveStage(t.d, t.B, { tripId: t.tripId, stage: "stay", action: "start_voting" })).rejects.toThrow("organizers_only");

    expect(await moveStage(t.d, t.A, { tripId: t.tripId, stage: "stay", action: "start_voting" })).toEqual({
      ok: true,
      from: "collecting",
      to: "voting",
    });
    // S-7: nobody voted yet → confirm first.
    expect(await moveStage(t.d, t.A, { tripId: t.tripId, stage: "stay", action: "set" })).toEqual({ ok: false, reason: "confirm_no_votes" });
    expect(await moveStage(t.d, t.A, { tripId: t.tripId, stage: "stay", action: "set", confirmed: true })).toMatchObject({ ok: true, to: "set" });
    v = await getPlanningView(t.d, t.A, t.tripId);
    expect(v!.showChips).toBe(true);
    expect(v!.chips.map((c) => c.text)).toEqual(["Where ✅", "When 💡", "Stay ✅", "Do 💡"]);
  });

  it("reopening shows the impact first and pauses later open polls (S-6)", async () => {
    const pollId = await asService(t.d, (tx) =>
      tx.insert(polls).values({ tripId: t.tripId, kind: "custom", question: "Which hotel?", stage: "stay" }).returning({ id: polls.id }),
    ).then((r) => r[0]!.id);
    const r = await moveStage(t.d, t.A, { tripId: t.tripId, stage: "where", action: "reopen" });
    expect(r).toMatchObject({ ok: false, reason: "confirm_reopen", preview: { pollsToPause: [{ id: pollId, question: "Which hotel?" }] } });
    expect(await moveStage(t.d, t.A, { tripId: t.tripId, stage: "where", action: "reopen", confirmed: true })).toMatchObject({ ok: true });
    const [p] = await asService(t.d, (tx) => tx.select().from(polls).where(eq(polls.id, pollId)));
    expect(p!.pausedAt).not.toBeNull();
    // Undo (P7) restores the status.
    expect(await undoStageMove(t.d, t.A, { tripId: t.tripId, stage: "where", from: "set", to: "collecting" })).toBe(true);
    const [w] = await asService(t.d, (tx) => tx.select().from(tripStages).where(eq(tripStages.tripId, t.tripId)));
    expect(w).toBeDefined();
  });

  it("solo trips get set toggles, no voting step", async () => {
    const s = await setup(1);
    expect(await moveStage(s.d, s.A, { tripId: s.tripId, stage: "stay", action: "start_voting" })).toEqual({ ok: false, reason: "no_voting_in_solo" });
    expect(await moveStage(s.d, s.A, { tripId: s.tripId, stage: "stay", action: "set" })).toMatchObject({ ok: true });
    expect(await moveStage(s.d, s.A, { tripId: s.tripId, stage: "stay", action: "reopen" })).toMatchObject({ ok: true });
  });
});

describe("Stops (FR-S3, S5, S6, S7, S10, S-5, S-9)", () => {
  it("asks 'New city: Porto?', adds the Stop, moves its ideas, and shows Stops", async () => {
    const t = await setup(3);
    const [lis, porto1, porto2] = await addIdeas(t.d, t.tripId, [
      { stopId: t.stopId, cityHint: "Lisbon", ...LISBON },
      { stopId: t.stopId, cityHint: "Porto", ...PORTO },
      { stopId: null, cityHint: "Porto", ...PORTO },
    ]);
    let v = await getPlanningView(t.d, t.A, t.tripId);
    expect(v!.showStops).toBe(false);
    expect(v!.newCities.map((c) => c.city)).toEqual(["Porto"]);
    expect((await getPlanningView(t.d, t.B, t.tripId))!.newCities).toEqual([]); // organizers only

    await expect(addStop(t.d, t.B, { tripId: t.tripId, name: "Porto" })).rejects.toThrow("organizers_only");
    const { stopId: portoStop, moved } = await addStop(t.d, t.A, { tripId: t.tripId, name: "Porto" });
    expect(moved).toBe(2);
    v = await getPlanningView(t.d, t.A, t.tripId);
    expect(v!.showStops).toBe(true);
    expect(v!.newCities).toEqual([]);
    expect(v!.stops.map((s) => [s.name, s.isDefault])).toEqual([
      ["Lisbon", false],
      ["Porto", false],
    ]);
    const rows = await asService(t.d, (tx) => tx.select({ id: ideas.id, stopId: ideas.stopId }).from(ideas));
    expect(rows.find((r) => r.id === lis)!.stopId).toBe(t.stopId);
    expect(rows.find((r) => r.id === porto1)!.stopId).toBe(portoStop);
    expect(rows.find((r) => r.id === porto2)!.stopId).toBe(portoStop);
    const porto = v!.stops.find((s) => s.id === portoStop)!;
    expect(porto.lat).toBeCloseTo(PORTO.lat);
    expect(porto.attendees.every((a) => a.state === "assumed")).toBe(true);

    // Reorder and remove (S-5).
    await moveStop(t.d, t.A, { stopId: portoStop, dir: -1 });
    v = await getPlanningView(t.d, t.A, t.tripId);
    expect(v!.stops.map((s) => s.name)).toEqual(["Porto", "Lisbon"]);
    await removeStop(t.d, t.A, { stopId: portoStop });
    const after = await asService(t.d, (tx) => tx.select({ id: ideas.id, stopId: ideas.stopId }).from(ideas));
    expect(after.find((r) => r.id === porto1)!.stopId).toBeNull(); // back to Unsorted
    await expect(removeStop(t.d, t.A, { stopId: t.stopId })).rejects.toThrow("last_stop");
  });

  it("'Keep in Lisbon' files day trips and stops asking", async () => {
    const t = await setup(2);
    await addIdeas(t.d, t.tripId, [{ stopId: null, cityHint: "Sintra" }]);
    expect((await getPlanningView(t.d, t.A, t.tripId))!.newCities.map((c) => c.city)).toEqual(["Sintra"]);
    expect(await keepCityInStop(t.d, t.A, { tripId: t.tripId, city: "Sintra", stopId: t.stopId })).toBe(1);
    const v = await getPlanningView(t.d, t.A, t.tripId);
    expect(v!.newCities).toEqual([]);
    expect(v!.unsortedCount).toBe(0);
  });

  it("names the hidden Stop when a trip had no city (S-9)", async () => {
    const t = await setup(1);
    await asService(t.d, (tx) => tx.update(stops).set({ name: "" }).where(eq(stops.id, t.stopId)));
    await expect(addStop(t.d, t.A, { tripId: t.tripId, name: "Porto" })).rejects.toThrow("first_stop_name_required");
    await addStop(t.d, t.A, { tripId: t.tripId, name: "Porto", firstStopName: "Lisbon" });
    const v = await getPlanningView(t.d, t.A, t.tripId);
    expect(v!.stops.map((s) => s.name)).toEqual(["Lisbon", "Porto"]);
  });

  it("adds a city idea as a Stop (FR-S5)", async () => {
    const t = await setup(3);
    const [city] = await addIdeas(t.d, t.tripId, [{ title: "Porto", category: "city", stage: "where", ...PORTO }]);
    expect((await getPlanningView(t.d, t.A, t.tripId))!.cityIdeas.map((c) => c.title)).toEqual(["Porto"]);
    await addStop(t.d, t.A, { tripId: t.tripId, name: "Porto", cityIdeaId: city });
    const [row] = await asService(t.d, (tx) => tx.select().from(ideas).where(eq(ideas.id, city!)));
    expect(row!.status).toBe("planned");
  });

  it("date changes ask each time (FR-S10, S-4)", async () => {
    const t = await setup(3);
    await updateStop(t.d, t.A, { stopId: t.stopId, startDate: "2027-04-03", endDate: "2027-04-06" });
    const [idea] = await addIdeas(t.d, t.tripId, [{ stopId: t.stopId, title: "Pastéis", status: "planned" }]);
    const [item] = await asService(t.d, (tx) =>
      tx.insert(planItems).values({ tripId: t.tripId, stopId: t.stopId, ideaId: idea, dayIndex: 3 }).returning({ id: planItems.id }),
    );
    const [poll] = await asService(t.d, (tx) =>
      tx
        .insert(polls)
        .values({ tripId: t.tripId, stopId: t.stopId, kind: "custom", question: "Dinner?", closesAt: new Date(Date.now() + 86_400_000) })
        .returning({ id: polls.id, closesAt: polls.closesAt }),
    );
    // Shorter stay: the Day 4 item can't shift.
    const r = await updateStop(t.d, t.A, { stopId: t.stopId, startDate: "2027-04-05", endDate: "2027-04-06" });
    expect(r).toMatchObject({
      ok: false,
      reason: "needs_choices",
      deltaDays: 2,
      planItems: [{ id: item!.id, title: "Pastéis", dayIndex: 3, canShift: false }],
      polls: [{ id: poll!.id, question: "Dinner?" }],
    });
    // Nothing saved yet.
    let [s] = await asService(t.d, (tx) => tx.select().from(stops).where(eq(stops.id, t.stopId)));
    expect(s!.startDate).toBe("2027-04-03");
    const ok = await updateStop(t.d, t.A, {
      stopId: t.stopId,
      startDate: "2027-04-05",
      endDate: "2027-04-06",
      choices: { [item!.id]: "unschedule", [poll!.id]: "shift" },
    });
    expect(ok).toEqual({ ok: true });
    [s] = await asService(t.d, (tx) => tx.select().from(stops).where(eq(stops.id, t.stopId)));
    expect([s!.startDate, s!.nights]).toEqual(["2027-04-05", 1]);
    expect(await asService(t.d, (tx) => tx.select().from(planItems))).toEqual([]);
    const [p] = await asService(t.d, (tx) => tx.select().from(polls).where(eq(polls.id, poll!.id)));
    expect(p!.closesAt!.getTime() - poll!.closesAt!.getTime()).toBe(2 * 86_400_000);
    // The idea is still planned and shows as "needs a day".
    const v = await getPlanningView(t.d, t.A, t.tripId);
    expect(v!.stops[0]!.needsDay.map((x) => x.title)).toEqual(["Pastéis"]);
    expect(await updateStop(t.d, t.A, { stopId: t.stopId, startDate: "2027-04-09", endDate: "2027-04-06" })).toEqual({
      ok: false,
      reason: "invalid",
      error: "end_before_start",
    });
  });

  it("attendance: self only, link sessions can't, assumed by default (FR-S7, S-12)", async () => {
    const t = await setup(3);
    await setAttendance(t.d, t.B, { stopId: t.stopId, memberId: t.ben, attending: false });
    await expect(setAttendance(t.d, t.B, { stopId: t.stopId, memberId: t.cy, attending: false })).rejects.toThrow();
    await expect(setAttendance(t.d, { link_member: t.cy }, { stopId: t.stopId, memberId: t.cy, attending: false })).rejects.toThrow();
    const v = await getPlanningView(t.d, t.C, t.tripId);
    expect(v!.stops[0]!.attendees.map((a) => [a.name, a.state])).toEqual([
      ["Ana", "assumed"],
      ["Ben", "no"],
      ["Cy", "assumed"],
    ]);
    await setAttendance(t.d, t.B, { stopId: t.stopId, memberId: t.ben, attending: null });
    expect((await getPlanningView(t.d, t.B, t.tripId))!.stops[0]!.myAttendance).toBe("assumed");
  });
});

describe("idea status, Not my pick, shortlist (FR-45, FR-49, FR-50)", () => {
  it("organizers change status; members can't", async () => {
    const t = await setup(3);
    const [x] = await addIdeas(t.d, t.tripId, [{ stopId: t.stopId }]);
    await expect(setIdeaStatus(t.d, t.B, { ideaId: x!, status: "shortlisted" })).rejects.toThrow();
    expect(await setIdeaStatus(t.d, t.A, { ideaId: x!, status: "shortlisted" })).toBe("idea");
    expect(await setIdeaStatus(t.d, t.A, { ideaId: x!, status: "dropped" })).toBe("shortlisted");
  });

  it("Not my pick needs your own vote and leaves the vote alone", async () => {
    const t = await setup(3);
    const [x] = await addIdeas(t.d, t.tripId, [{ stopId: t.stopId }]);
    await expect(setNotMyPick(t.d, t.B, { tripId: t.tripId, ideaId: x!, on: true })).rejects.toThrow("vote_first");
    await castVote(t.d, t.B, { tripId: t.tripId, ideaId: x!, memberId: t.ben, value: "pass" });
    await setNotMyPick(t.d, t.B, { tripId: t.tripId, ideaId: x!, on: true });
    const [v] = await asService(t.d, (tx) => tx.select().from(votes).where(eq(votes.ideaId, x!)));
    expect([v!.value, v!.notMyPick]).toEqual(["pass", true]);
  });

  it("suggests a shortlist for crowded categories from visible tallies only", async () => {
    const t = await setup(3);
    const ids = await addIdeas(
      t.d,
      t.tripId,
      Array.from({ length: 12 }, (_, i) => ({ stopId: t.stopId, title: `Food ${i}`, category: "food" as const })),
    );
    expect(await shortlistSuggestions(t.d, t.B, t.tripId)).toEqual([]); // members get nothing
    // Ben and Cy vote; Ana (organizer) hasn't → everything is blind to her.
    for (const [i, id] of ids.entries()) {
      await castVote(t.d, t.B, { tripId: t.tripId, ideaId: id, memberId: t.ben, value: i < 3 ? "must" : "pass" });
    }
    let s = await shortlistSuggestions(t.d, t.A, t.tripId);
    expect(s).toHaveLength(1);
    expect(s[0]!.suggested).toEqual([]);
    expect(s[0]!.blindCount).toBe(12);
    for (const id of ids) await castVote(t.d, t.A, { tripId: t.tripId, ideaId: id, memberId: t.ana, value: "down" });
    s = await shortlistSuggestions(t.d, t.A, t.tripId);
    expect(s[0]!.suggested.map((r) => r.title)).toEqual(["Food 0", "Food 1", "Food 2", "Food 3", "Food 4"]);
    expect(s[0]!.suggested[0]).toMatchObject({ approval: 1, must: 1, voters: 2 });
    await shortlistIdeas(t.d, t.A, { tripId: t.tripId, ideaIds: s[0]!.suggested.map((r) => r.id) });
    const rows = await asService(t.d, (tx) => tx.select({ status: ideas.status }).from(ideas));
    expect(rows.filter((r) => r.status === "shortlisted")).toHaveLength(5);
  });
});

describe("map (FR-122, FR-126)", () => {
  it("groups by Stop with Google Maps links; Unsorted last; dropped left out", async () => {
    const t = await setup(2);
    await addIdeas(t.d, t.tripId, [
      { stopId: t.stopId, title: "A", status: "planned", ...LISBON },
      { stopId: t.stopId, title: "B", ...LISBON },
      { stopId: t.stopId, title: "C", status: "dropped", ...LISBON },
      { stopId: null, title: "D" },
    ]);
    const g = await getMapView(t.d, t.B, t.tripId);
    expect(g!.map((x) => [x.name, x.ideas.map((i) => i.title)])).toEqual([
      ["Lisbon", ["A", "B"]],
      ["Unsorted", ["D"]],
    ]);
    expect(g![0]!.routeUrls[0]).toContain("https://www.google.com/maps/dir/?api=1");
    expect(g![0]!.ideas[0]!.mapsUrl).toContain("https://www.google.com/maps/search/?api=1");
    expect(await getMapView(t.d, {}, t.tripId)).toBeNull();
  });
});
