import { describe, expect, it } from "vitest";
import {
  arrangeDays,
  checkPlan,
  checkPlanFreshness,
  computePlanBasis,
  formatMinute,
  kMedoids,
  type ArrangeInput,
  type PlanLike,
} from "../../src/optimizer";
import { ALFAMA, BAIXA, BELEM, item, near, stop } from "./fixtures";

const MON_TUE = ["2026-10-05", "2026-10-06"];

describe("checkPlan live hints (FR-O6)", () => {
  const items = [
    item("museum", { ...ALFAMA, openingHours: { 2: [{ open: 600, close: 1080 }] } }), // Tuesdays only
    item("tower", { ...BELEM }),
    item("castle", { ...near(ALFAMA, 2), openingHours: { 1: [{ open: 600, close: 1080 }] } }),
    item("late", { ...near(ALFAMA, 3), category: "food" }),
  ];

  it("flags closed weekdays and outside-hours slots", () => {
    const plan: PlanLike = {
      days: [
        {
          dayIndex: 0,
          items: [
            { itemId: "museum", startMinute: 600, durationMinutes: 90 },
            { itemId: "castle", startMinute: 1020, durationMinutes: 120 },
          ],
        },
      ],
    };
    const w = checkPlan(plan, items, stop({ days: MON_TUE }));
    expect(w).toContainEqual(
      expect.objectContaining({ code: "closed_that_day", itemId: "museum", detail: "Closed on Mondays" }),
    );
    expect(w).toContainEqual(
      expect.objectContaining({ code: "outside_hours", itemId: "castle", detail: "Closes at 6pm" }),
    );
  });

  it("does not check hours when undated", () => {
    const plan: PlanLike = { days: [{ dayIndex: 0, items: [{ itemId: "museum", startMinute: 600, durationMinutes: 90 }] }] };
    expect(checkPlan(plan, items, stop({ days: 2 }))).toEqual([]);
  });

  it("flags consecutive items 45+ minutes apart", () => {
    const plan: PlanLike = {
      days: [
        {
          dayIndex: 0,
          items: [
            { itemId: "tower", startMinute: 600, durationMinutes: 60 },
            { itemId: "museum", startMinute: 720, durationMinutes: 60 },
          ],
        },
      ],
    };
    const far = checkPlan(plan, items, stop(), { travelTime: () => ({ minutes: 45, mode: "transit" }) });
    expect(far).toContainEqual(
      expect.objectContaining({ code: "far_apart", itemId: "museum", detail: "45 min apart by transit" }),
    );
    const close = checkPlan(plan, items, stop(), { travelTime: () => ({ minutes: 44, mode: "transit" }) });
    expect(close.filter((x) => x.code === "far_apart")).toEqual([]);
  });

  it("flags a packed day for the chosen pace", () => {
    const plan: PlanLike = {
      days: [
        {
          dayIndex: 0,
          items: [
            { itemId: "museum", startMinute: 600, durationMinutes: 60 },
            { itemId: "castle", startMinute: 700, durationMinutes: 60 },
            { itemId: "tower", startMinute: 800, durationMinutes: 60 },
            { itemId: "late", startMinute: 1200, durationMinutes: 60 },
          ],
        },
      ],
    };
    const relaxed = checkPlan(plan, items, stop(), { pace: "relaxed" });
    expect(relaxed).toContainEqual(
      expect.objectContaining({ code: "packed_day", detail: "3 activities and 1 meal; that's a packed day" }),
    );
    expect(checkPlan(plan, items, stop(), { pace: "balanced" }).filter((x) => x.code === "packed_day")).toEqual([]);
  });

  it("flags overlaps with arrival and departure", () => {
    const plan: PlanLike = {
      days: [
        { dayIndex: 0, items: [{ itemId: "tower", startMinute: 15 * 60, durationMinutes: 60 }] },
        { dayIndex: 1, items: [{ itemId: "museum", startMinute: 10 * 60, durationMinutes: 120 }] },
      ],
    };
    const w = checkPlan(plan, items, stop({ days: 2, arrival: { minute: 14 * 60 + 30 }, departure: { minute: 12 * 60 } }));
    expect(w).toContainEqual(expect.objectContaining({ code: "overlaps_arrival", itemId: "tower", detail: "This overlaps your arrival (2:30pm)" }));
    expect(w).toContainEqual(expect.objectContaining({ code: "overlaps_departure", itemId: "museum" }));
  });

  it("flags overlapping items that share people", () => {
    const plan: PlanLike = {
      days: [
        {
          dayIndex: 0,
          items: [
            { itemId: "tower", startMinute: 600, durationMinutes: 120 },
            { itemId: "castle", startMinute: 660, durationMinutes: 60 },
          ],
        },
      ],
    };
    expect(checkPlan(plan, items, stop())).toContainEqual(
      expect.objectContaining({ code: "overlap", itemId: "castle", otherItemId: "tower" }),
    );
  });

  it("returns no hints for a fresh engine plan of nearby spots", () => {
    const input: ArrangeInput = {
      stop: stop({ days: 1, lodging: BAIXA }),
      items: [item("a", { ...near(BAIXA, 1) }), item("b", { ...near(BAIXA, 2), category: "food" })],
    };
    expect(arrangeDays(input).warnings).toEqual([]);
  });
});

describe("plan freshness (FR-O17)", () => {
  const base: ArrangeInput = {
    stop: stop({ days: MON_TUE, lodging: BAIXA }),
    items: [
      item("a", { ...ALFAMA, attendees: ["ana"] }),
      item("b", { ...BELEM }),
      item("s", { ...BAIXA, status: "suggested", priority: { must: true, rank: 1 } }),
    ],
    memberIds: ["ana", "ben"],
  };
  const basis = arrangeDays(base).basis;

  it("is fresh for the same input", () => {
    expect(checkPlanFreshness(basis, base).outOfDate).toBe(false);
    expect(computePlanBasis(base)).toEqual(basis);
  });

  it("ignores rank changes, locks and suggested churn", () => {
    const next: ArrangeInput = {
      ...base,
      items: [
        { ...base.items[0]!, priority: { must: true, rank: 1 }, locked: { dayIndex: 1, startMinute: 600 } },
        base.items[1]!,
        item("s2", { status: "suggested" }),
      ],
    };
    expect(checkPlanFreshness(basis, next).outOfDate).toBe(false);
  });

  it("detects added and removed items", () => {
    const next = { ...base, items: [base.items[0]!, item("c", { ...BAIXA })] };
    expect(checkPlanFreshness(basis, next)).toMatchObject({
      outOfDate: true,
      addedItemIds: ["c"],
      removedItemIds: ["b"],
    });
  });

  it("detects attendance changes", () => {
    const next = { ...base, items: [{ ...base.items[0]!, attendees: ["ana", "ben"] }, ...base.items.slice(1)] };
    expect(checkPlanFreshness(basis, next)).toMatchObject({ outOfDate: true, attendanceChanged: true });
    expect(checkPlanFreshness(basis, { ...base, memberIds: ["ana", "ben", "cy"] })).toMatchObject({
      outOfDate: true,
      attendanceChanged: true,
    });
  });

  it("detects Stop date changes and item detail changes", () => {
    expect(checkPlanFreshness(basis, { ...base, stop: { ...base.stop, days: ["2026-10-06", "2026-10-07"] } })).toMatchObject({
      outOfDate: true,
      stopChanged: true,
    });
    const moved = { ...base, items: [base.items[0]!, { ...base.items[1]!, lat: 38.7 }, base.items[2]!] };
    expect(checkPlanFreshness(basis, moved)).toMatchObject({ outOfDate: true, changedItemIds: ["b"] });
  });
});

describe("helpers", () => {
  it("formats minutes as short local times", () => {
    expect(formatMinute(18 * 60)).toBe("6pm");
    expect(formatMinute(19 * 60 + 30)).toBe("7:30pm");
    expect(formatMinute(12 * 60)).toBe("12pm");
    expect(formatMinute(0)).toBe("12am");
    expect(formatMinute(25 * 60)).toBe("1am");
  });

  it("k-medoids separates two neighbourhoods deterministically", () => {
    const pts = [
      { id: "a1", ...ALFAMA },
      { id: "a2", ...near(ALFAMA, 2) },
      { id: "b1", ...BELEM },
      { id: "b2", ...near(BELEM, 2) },
    ];
    const r = kMedoids(pts, 2, null);
    expect(r.assignment[0]).toBe(r.assignment[1]);
    expect(r.assignment[2]).toBe(r.assignment[3]);
    expect(r.assignment[0]).not.toBe(r.assignment[2]);
    expect(kMedoids(pts, 2, null)).toEqual(r);
  });
});
