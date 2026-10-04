import { describe, expect, it } from "vitest";
import {
  addDays,
  centroid,
  currentOrNextStopId,
  foldCity,
  ideasForCity,
  moveInOrder,
  newCitySuggestions,
  resolveDateChange,
  sameCity,
  shouldShowStageChips,
  stopDateChangeImpact,
  stopDateWarnings,
  stopDayCount,
  stopLabel,
  stopNights,
  stopRemovalImpact,
  validateStopDates,
  type CityIdea,
} from "../src/stop-planning";

const LISBON = { lat: 38.7223, lng: -9.1393 };
const PORTO = { lat: 41.1579, lng: -8.6291 };
const SINTRA = { lat: 38.8029, lng: -9.3817 };

const idea = (id: string, over: Partial<CityIdea>): CityIdea => ({
  id,
  stopId: null,
  cityHint: null,
  category: "food",
  status: "idea",
  lat: null,
  lng: null,
  ...over,
});

describe("foldCity / sameCity", () => {
  it("ignores case, accents and punctuation", () => {
    expect(foldCity("São Paulo!")).toBe("sao paulo");
    expect(sameCity("Porto", "porto")).toBe(true);
    expect(sameCity("Porto", "Porto, Portugal")).toBe(true);
    expect(sameCity("Lisbon", "Porto")).toBe(false);
    expect(sameCity("", "Porto")).toBe(false);
    expect(sameCity(null, null)).toBe(false);
  });
  it("does not match short fragments", () => {
    expect(sameCity("Po", "Porto")).toBe(false);
  });
});

describe("newCitySuggestions (FR-S6, S-2, S-15)", () => {
  const lisbon = { id: "L", name: "Lisbon", lat: null, lng: null };

  it("suggests Unsorted ideas grouped by city hint", () => {
    const s = newCitySuggestions(
      [
        idea("1", { cityHint: "Porto", ...PORTO }),
        idea("2", { cityHint: "porto" }),
        idea("3", { cityHint: "Madrid" }),
      ],
      [lisbon],
    );
    expect(s.map((x) => x.city)).toEqual(["Porto", "Madrid"]);
    expect(s[0]!.ideaIds).toEqual(["1", "2"]);
    expect(s[0]!.center).toEqual(PORTO);
    expect(s[0]!.fromStopIds).toEqual([null]);
  });

  it("flags ideas filed into a named Stop of another city when far away", () => {
    const s = newCitySuggestions(
      [
        idea("a", { stopId: "L", cityHint: "Lisbon", ...LISBON }),
        idea("b", { stopId: "L", cityHint: "Porto", ...PORTO }),
      ],
      [lisbon],
    );
    expect(s).toHaveLength(1);
    expect(s[0]!.city).toBe("Porto");
    expect(s[0]!.fromStopIds).toEqual(["L"]);
  });

  it("never suggests day trips within the radius (S-2)", () => {
    const s = newCitySuggestions(
      [
        idea("a", { stopId: "L", cityHint: "Lisbon", ...LISBON }),
        idea("b", { stopId: "L", cityHint: "Sintra", ...SINTRA }),
      ],
      [lisbon],
    );
    expect(s).toEqual([]);
  });

  it("uses the Stop's own pin when it has one", () => {
    const s = newCitySuggestions([idea("b", { stopId: "L", cityHint: "Sintra", ...SINTRA })], [
      { ...lisbon, ...LISBON },
    ]);
    expect(s).toEqual([]);
  });

  it("falls back to a name mismatch without coordinates", () => {
    const s = newCitySuggestions([idea("b", { stopId: "L", cityHint: "Porto" })], [lisbon]);
    expect(s.map((x) => x.city)).toEqual(["Porto"]);
  });

  it("skips hidden unnamed Stops, known cities, city ideas and dropped ideas", () => {
    const s = newCitySuggestions(
      [
        idea("1", { stopId: "D", cityHint: "Porto" }),
        idea("2", { cityHint: "Lisbon" }),
        idea("3", { cityHint: "Faro", category: "city" }),
        idea("4", { cityHint: "Faro", status: "dropped" }),
      ],
      [{ id: "D", name: "", lat: null, lng: null }, lisbon],
    );
    expect(s).toEqual([]);
  });

  it("ideasForCity returns the matching ideas", () => {
    const list = [idea("1", { cityHint: "Porto" }), idea("2", { cityHint: "Faro" })];
    expect(ideasForCity(list, [lisbon], "porto")).toEqual(["1"]);
    expect(ideasForCity(list, [lisbon], "Nowhere")).toEqual([]);
  });

  it("centroid ignores unpinned points", () => {
    expect(centroid([{ lat: null, lng: null }])).toBeNull();
    expect(centroid([{ lat: 0, lng: 0 }, { lat: 2, lng: 4 }, { lat: null, lng: 1 }])).toEqual({ lat: 1, lng: 2 });
  });
});

describe("Stop dates (FR-S10, S-3, S-4, S-17)", () => {
  it("counts nights and days", () => {
    expect(stopNights({ startDate: "2027-04-03", endDate: "2027-04-06", nights: null })).toBe(3);
    expect(stopNights({ startDate: null, endDate: null, nights: 2 })).toBe(2);
    expect(stopDayCount({ startDate: "2027-04-03", endDate: "2027-04-06", nights: 9 })).toBe(4);
    expect(stopDayCount({ startDate: null, endDate: null, nights: null })).toBeNull();
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("validates", () => {
    expect(validateStopDates({ startDate: "2027-04-05", endDate: "2027-04-03", nights: null })).toBe("end_before_start");
    expect(validateStopDates({ startDate: null, endDate: null, nights: -1 })).toBe("nights_out_of_range");
    expect(validateStopDates({ startDate: null, endDate: null, nights: 61 })).toBe("nights_out_of_range");
    expect(validateStopDates({ startDate: "2027-04-03", endDate: "2027-04-03", nights: null })).toBeNull();
    expect(validateStopDates({ startDate: "2027-02-30", endDate: null, nights: null })).toBe("invalid_date");
  });

  const before = { startDate: "2027-04-03", endDate: "2027-04-06", nights: 3 };
  const items = [
    { id: "p0", dayIndex: 0 },
    { id: "p3", dayIndex: 3 },
  ];
  it("no change → null", () => {
    expect(stopDateChangeImpact(before, { ...before }, items)).toBeNull();
  });

  it("moving the start lists every placed item; polls are left alone (ST2)", () => {
    const imp = stopDateChangeImpact(before, { startDate: "2027-04-05", endDate: "2027-04-08", nights: 3 }, items)!;
    expect(imp.deltaDays).toBe(2);
    expect(imp.planItems).toEqual([
      { id: "p0", dayIndex: 0, canShift: true },
      { id: "p3", dayIndex: 3, canShift: true },
    ]);
    expect(imp).not.toHaveProperty("polls");
  });

  it("shortening lists only items past the new last day, which can't shift", () => {
    const imp = stopDateChangeImpact(before, { startDate: "2027-04-03", endDate: "2027-04-04", nights: 1 }, items)!;
    expect(imp.deltaDays).toBe(0);
    expect(imp.planItems).toEqual([{ id: "p3", dayIndex: 3, canShift: false }]);
  });

  it("requires a choice for every item and rejects impossible shifts", () => {
    const imp = stopDateChangeImpact(before, { startDate: "2027-04-04", endDate: "2027-04-05", nights: 1 }, items)!;
    expect(resolveDateChange(imp, {})).toEqual({ ok: false, missing: ["p0", "p3"], invalid: [] });
    expect(resolveDateChange(imp, { p0: "shift", p3: "shift" })).toMatchObject({ ok: false, invalid: ["p3"] });
    expect(resolveDateChange(imp, { p0: "shift", p3: "unschedule" })).toEqual({ ok: true, unscheduleItemIds: ["p3"] });
  });

  it("removing a city (ST5): ideas to Unsorted, open polls close, plan items go, expenses unlink", () => {
    expect(stopRemovalImpact({ stopCount: 1, ideaIds: [], polls: [], planItemIds: [], expenseIds: [] })).toEqual({
      ok: false,
      reason: "last_stop",
    });
    const quiet = stopRemovalImpact({ stopCount: 2, ideaIds: ["i1"], polls: [], planItemIds: [], expenseIds: [] });
    expect(quiet).toMatchObject({ ok: true, ideasToUnsorted: ["i1"], requiresConfirm: false });
    const busy = stopRemovalImpact({
      stopCount: 3,
      ideaIds: ["i1", "i2"],
      polls: [
        { id: "q1", open: true },
        { id: "q2", open: false },
      ],
      planItemIds: ["p1"],
      expenseIds: ["e1"],
    });
    expect(busy).toEqual({
      ok: true,
      ideasToUnsorted: ["i1", "i2"],
      pollsToClose: ["q1"],
      pollsToUnlink: ["q1", "q2"],
      planItemsRemoved: ["p1"],
      expensesUnlinked: ["e1"],
      requiresConfirm: true,
    });
  });

  it("labels Stops with dates (S-3)", () => {
    expect(stopLabel({ name: "Lisbon", ...before })).toBe("Lisbon (Apr 3–6)");
    expect(stopLabel({ name: "Porto", startDate: "2027-04-30", endDate: "2027-05-02", nights: null })).toBe(
      "Porto (Apr 30–May 2)",
    );
    expect(stopLabel({ name: "Porto", startDate: null, endDate: null, nights: 1 })).toBe("Porto (1 night)");
    expect(stopLabel({ name: "", startDate: null, endDate: null, nights: null })).toBe("First stop");
  });

  it("warns on overlaps and gaps (S-17)", () => {
    const w = stopDateWarnings([
      { id: "a", name: "A", position: 0, startDate: "2027-04-01", endDate: "2027-04-04", nights: null },
      { id: "b", name: "B", position: 1, startDate: "2027-04-03", endDate: "2027-04-06", nights: null },
      { id: "c", name: "C", position: 2, startDate: "2027-04-09", endDate: "2027-04-10", nights: null },
      { id: "d", name: "D", position: 3, startDate: "2027-04-10", endDate: "2027-04-12", nights: null },
    ]);
    expect(w).toEqual([
      { stopId: "b", kind: "overlap", days: 1 },
      { stopId: "c", kind: "gap", days: 2 },
    ]);
  });
});

describe("moveInOrder", () => {
  it("swaps neighbours and ignores moves off the ends", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a"], "x", 1)).toEqual(["a"]);
  });
});

describe("currentOrNextStopId (FR-S9)", () => {
  const stops = [
    { id: "L", position: 0, startDate: "2027-04-03", endDate: "2027-04-06", nights: null },
    { id: "P", position: 1, startDate: "2027-04-06", endDate: "2027-04-08", nights: null },
  ];
  it("opens on the current Stop, then the next one", () => {
    expect(currentOrNextStopId(stops, "2027-04-04")).toBe("L");
    expect(currentOrNextStopId(stops, "2027-04-07")).toBe("P");
    expect(currentOrNextStopId(stops, "2027-03-01")).toBe("L");
  });
  it("whole trip when undated, over or single-Stop", () => {
    expect(currentOrNextStopId(stops, "2027-05-01")).toBeNull();
    expect(currentOrNextStopId(stops.map((s) => ({ ...s, startDate: null, endDate: null })), "2027-04-04")).toBeNull();
    expect(currentOrNextStopId([stops[0]!], "2027-04-04")).toBeNull();
  });
});

describe("shouldShowStageChips (P2)", () => {
  const created = new Date("2027-01-01T00:00:00Z");
  const fresh = [{ kind: "where" as const, status: "set" as const, updatedAt: created }];
  it("hidden on a brand-new trip", () => {
    expect(shouldShowStageChips({ stages: fresh, tripCreatedAt: created, stopCount: 1, openStagePolls: 0 })).toBe(false);
  });
  it("shown after an organizer moves a stage, with 2+ Stops or with an open stage poll", () => {
    const moved = [{ ...fresh[0]!, updatedAt: new Date("2027-01-02T00:00:00Z") }];
    expect(shouldShowStageChips({ stages: moved, tripCreatedAt: created, stopCount: 1, openStagePolls: 0 })).toBe(true);
    expect(shouldShowStageChips({ stages: fresh, tripCreatedAt: created, stopCount: 2, openStagePolls: 0 })).toBe(true);
    expect(shouldShowStageChips({ stages: fresh, tripCreatedAt: created, stopCount: 1, openStagePolls: 1 })).toBe(true);
  });
});
