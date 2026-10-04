import { describe, expect, it } from "vitest";
import {
  KIND_WINDOWS,
  arrangeDays,
  defaultTravelTime,
  haversineKm,
  type ArrangeInput,
  type ItemInput,
} from "../../src/optimizer";
import { ALFAMA, BAIXA, BELEM, find, item, lcg, near, placed, stop, totalTravel } from "./fixtures";

const WEEK = ["2026-10-05", "2026-10-06", "2026-10-07"]; // Mon, Tue, Wed

describe("default travel estimator", () => {
  it("walks up to 1.2 km at 4.8 km/h", () => {
    const a = { id: "a", ...ALFAMA };
    const b = { id: "b", ...near(ALFAMA, 8) }; // ~0.8 km
    const km = haversineKm(a, b);
    expect(km).toBeLessThan(1.2);
    expect(defaultTravelTime(a, b)).toEqual({ minutes: Math.ceil((km / 4.8) * 60), mode: "walk" });
  });
  it("uses transit at 20 km/h + 8 min beyond 1.2 km", () => {
    const a = { id: "a", ...ALFAMA };
    const b = { id: "b", ...BELEM };
    const km = haversineKm(a, b);
    expect(defaultTravelTime(a, b)).toEqual({
      minutes: Math.ceil((km / 20) * 60 + 8),
      mode: "transit",
    });
  });
});

describe("arrangeDays: determinism (same input → same output)", () => {
  const items: ItemInput[] = [
    item("museum", { ...near(ALFAMA, 1), category: "sight", priority: { must: true, rank: 3 } }),
    item("castle", { ...near(ALFAMA, 3), category: "sight", priority: { must: false, rank: 1 } }),
    item("tower", { ...BELEM, category: "sight", priority: { must: false, rank: 2 } }),
    item("pasteis", { ...near(BELEM, 2), category: "food", priority: { must: true, rank: 1 } }),
    item("tasca", { ...near(ALFAMA, -2), category: "food", priority: { must: false, rank: 4 } }),
    item("bar", { ...near(BAIXA, 1), category: "nightlife", priority: { must: false, rank: 5 } }),
    item("tie-a", { ...near(BAIXA, 4), priority: { must: false, rank: 7 } }),
    item("tie-b", { ...near(BAIXA, 4), priority: { must: false, rank: 7 } }),
  ];
  const input: ArrangeInput = { stop: stop({ days: 2, lodging: BAIXA }), items };

  it("returns identical plans on repeated runs", () => {
    expect(arrangeDays(input)).toEqual(arrangeDays(input));
  });

  it("does not depend on input order (ties break by id)", () => {
    const shuffled = { ...input, items: [...items].reverse() };
    const a = arrangeDays(input);
    const b = arrangeDays(shuffled);
    expect(b.days).toEqual(a.days);
    expect(b.didntFit).toEqual(a.didntFit);
  });

  it("does not mutate its input", () => {
    const snapshot = JSON.stringify(input);
    arrangeDays(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("locked and fixed-time items (FR-O4, FR-O8)", () => {
  const base: ItemInput[] = [
    item("dinner-res", {
      ...near(BELEM, 1),
      category: "food",
      fixedStart: { dayIndex: 1, minute: 20 * 60 },
    }),
    item("locked-tour", { ...near(ALFAMA, 2), locked: { dayIndex: 0, startMinute: 10 * 60 + 15 } }),
    item("a", { ...near(ALFAMA, 1), priority: { must: true, rank: 1 } }),
    item("b", { ...near(BELEM, 2), priority: { must: false, rank: 2 } }),
  ];

  it("never moves pinned items, even when more items are added", () => {
    const more = [
      ...base,
      ...Array.from({ length: 10 }, (_, i) =>
        item(`x${i}`, { ...near(BAIXA, i), category: i % 2 ? "food" : "sight", priority: { must: i < 3, rank: i } }),
      ),
    ];
    for (const items of [base, more]) {
      const plan = arrangeDays({ stop: stop({ days: 2, lodging: BAIXA }), items });
      const res = find(plan, "dinner-res")!;
      const tour = find(plan, "locked-tour")!;
      expect(res).toMatchObject({ dayIndex: 1, startMinute: 20 * 60, pinned: true });
      expect(tour).toMatchObject({ dayIndex: 0, startMinute: 10 * 60 + 15, pinned: true });
      expect(res.reason.startsWith("Reservation at 8pm")).toBe(true);
      expect(res.reasonCodes.some((r) => r.code === "meal_window")).toBe(false);
      expect(tour.reason.startsWith("Locked in place")).toBe(true);
    }
  });

  it("schedules flexible items around pinned ones without overlap", () => {
    const plan = arrangeDays({ stop: stop({ days: 2, lodging: BAIXA }), items: base });
    for (const d of plan.days) {
      const timed = d.items.filter((i) => i.startMinute !== null).sort((a, b) => a.startMinute! - b.startMinute!);
      for (let i = 1; i < timed.length; i++) {
        expect(timed[i]!.startMinute!).toBeGreaterThanOrEqual(timed[i - 1]!.startMinute! + timed[i - 1]!.durationMinutes);
      }
    }
  });

  it("keeps a day-locked item on its day", () => {
    const items = [item("day-locked", { ...BELEM, locked: { dayIndex: 1, startMinute: null } }), item("other", { ...BELEM })];
    const plan = arrangeDays({ stop: stop({ days: 3 }), items });
    expect(find(plan, "day-locked")!.dayIndex).toBe(1);
  });

  it("reports a lock on a day that no longer exists", () => {
    const plan = arrangeDays({ stop: stop({ days: 2 }), items: [item("gone", { locked: { dayIndex: 4, startMinute: 600 } })] });
    expect(plan.didntFit).toEqual([
      expect.objectContaining({ itemId: "gone", reason: "no_slot", suggestion: "add_day" }),
    ]);
  });
});

describe("opening hours on dated days (FR-O8, FR-O13)", () => {
  it("sends an item closed on every trip day to didntFit with reason 'closed'", () => {
    const sundayOnly = item("market", { ...ALFAMA, openingHours: { 0: [{ open: 9 * 60, close: 14 * 60 }] } });
    const plan = arrangeDays({ stop: stop({ days: WEEK }), items: [sundayOnly] });
    expect(placed(plan)).toHaveLength(0);
    expect(plan.didntFit).toEqual([
      {
        itemId: "market",
        reason: "closed",
        suggestion: "drop",
        detail: "Closed on Mondays, Tuesdays and Wednesdays",
      },
    ]);
  });

  it("suggests adding a day when it's open the day after the trip", () => {
    const thursdayOnly = item("market", { ...ALFAMA, openingHours: { 4: [{ open: 9 * 60, close: 14 * 60 }] } });
    const plan = arrangeDays({ stop: stop({ days: WEEK }), items: [thursdayOnly] });
    expect(plan.didntFit[0]).toMatchObject({ reason: "closed", suggestion: "add_day" });
  });

  it("places an item only on the weekday it's open, within its hours", () => {
    const museum = item("museum", {
      ...ALFAMA,
      durationMinutes: 120,
      openingHours: { 3: [{ open: 10 * 60, close: 18 * 60 }] }, // Wednesday only
    });
    const plan = arrangeDays({ stop: stop({ days: WEEK }), items: [museum] });
    const p = find(plan, "museum")!;
    expect(p.dayIndex).toBe(2);
    expect(p.startMinute!).toBeGreaterThanOrEqual(10 * 60);
    expect(p.startMinute! + p.durationMinutes).toBeLessThanOrEqual(18 * 60);
    expect(p.reason).toContain("Closes at 6pm");
  });

  it("ignores hours in undated mode and labels days without dates", () => {
    const closedAlways = item("market", { ...ALFAMA, openingHours: {} });
    const plan = arrangeDays({ stop: stop({ days: 2 }), items: [closedAlways] });
    expect(plan.days.map((d) => d.date)).toEqual([null, null]);
    expect(plan.days.map((d) => d.weekday)).toEqual([null, null]);
    expect(find(plan, "market")).toBeDefined();
    expect(plan.didntFit).toEqual([]);
  });
});

describe("meals and time of day (FR-O9)", () => {
  const items: ItemInput[] = [
    item("cafe", { ...near(BAIXA, 1), category: "food", timeOfDay: "breakfast" }),
    item("tasca", { ...near(BAIXA, 2), category: "food" }),
    item("marisqueira", { ...near(BAIXA, 3), category: "food" }),
    item("club", { ...near(BAIXA, 4), category: "nightlife" }),
    item("castle", { ...near(BAIXA, 5), category: "sight" }),
  ];
  const plan = arrangeDays({ stop: stop({ days: 1, lodging: BAIXA }), items, pace: "packed" });

  const inWindow = (id: string, kind: keyof typeof KIND_WINDOWS) => {
    const p = find(plan, id)!;
    const w = KIND_WINDOWS[kind];
    expect(p.startMinute!).toBeGreaterThanOrEqual(w.earliest ?? 0);
    expect(p.startMinute!).toBeLessThanOrEqual(w.latestStart);
  };

  it("puts breakfast in the morning", () => inWindow("cafe", "breakfast"));
  it("puts unhinted food at lunch and dinner, one each", () => {
    const starts = ["tasca", "marisqueira"].map((id) => find(plan, id)!.startMinute!).sort((a, b) => a - b);
    expect(starts[0]!).toBeGreaterThanOrEqual(KIND_WINDOWS.lunch.earliest!);
    expect(starts[0]!).toBeLessThanOrEqual(KIND_WINDOWS.lunch.latestStart);
    expect(starts[1]!).toBeGreaterThanOrEqual(KIND_WINDOWS.dinner.earliest!);
    expect(starts[1]!).toBeLessThanOrEqual(KIND_WINDOWS.dinner.latestStart);
  });
  it("puts nightlife at night", () => inWindow("club", "night"));
  it("orders the day breakfast → … → dinner → night", () => {
    const order = plan.days[0]!.items.map((i) => i.itemId);
    expect(order[0]).toBe("cafe");
    expect(order[order.length - 1]).toBe("club");
  });
  it("explains a dinner near the lodging", () => {
    const dinner = placed(plan).find((p) => p.reasonCodes.some((r) => r.code === "meal_window" && r.meal === "dinner"))!;
    expect(dinner.reason).toContain("Dinner window near your stay");
  });
  it("never puts two lunches on one day", () => {
    const lunches = [1, 2, 3].map((i) => item(`l${i}`, { ...near(BAIXA, i), category: "food", timeOfDay: "lunch" }));
    const p = arrangeDays({ stop: stop({ days: 1 }), items: lunches, pace: "packed" });
    expect(placed(p)).toHaveLength(1);
    expect(p.didntFit.map((d) => d.reason)).toEqual(["day_full", "day_full"]);
  });
});

describe("geographic clustering (FR-O7)", () => {
  // Interleaved ranks across two neighbourhoods ~6.5 km apart.
  const items: ItemInput[] = [
    item("a1", { ...near(ALFAMA, 0), priority: { must: false, rank: 1 } }),
    item("b1", { ...near(BELEM, 0), priority: { must: false, rank: 2 } }),
    item("a2", { ...near(ALFAMA, 3), priority: { must: false, rank: 3 } }),
    item("b2", { ...near(BELEM, 3), priority: { must: false, rank: 4 } }),
    item("a3", { ...near(ALFAMA, 0, 3), priority: { must: false, rank: 5 } }),
    item("b3", { ...near(BELEM, 0, 3), priority: { must: false, rank: 6 } }),
  ];
  const plan = arrangeDays({ stop: stop({ days: 2 }), items });

  it("keeps each neighbourhood on one day", () => {
    for (const d of plan.days) {
      const prefixes = new Set(d.items.map((i) => i.itemId[0]));
      expect(prefixes.size).toBe(1);
      expect(d.items).toHaveLength(3);
    }
  });

  it("has fewer travel minutes than the naive rank order", () => {
    // Naive: rank order, chunked 3 per day.
    const byRank = [...items].sort((a, b) => a.priority.rank - b.priority.rank);
    let naive = 0;
    for (const chunk of [byRank.slice(0, 3), byRank.slice(3)]) {
      for (let i = 1; i < chunk.length; i++) {
        const a = chunk[i - 1]!;
        const b = chunk[i]!;
        naive += defaultTravelTime({ id: a.id, lat: a.lat!, lng: a.lng! }, { id: b.id, lat: b.lat!, lng: b.lng! }).minutes;
      }
    }
    expect(totalTravel(plan)).toBeLessThan(naive);
    expect(totalTravel(plan) * 3).toBeLessThan(naive);
  });

  it("explains grouping", () => {
    expect(find(plan, "a1")!.reason).toContain("Grouped with 2 other spots nearby");
  });

  it("starts and ends at the lodging when known", () => {
    const p = arrangeDays({ stop: stop({ days: 2, lodging: ALFAMA }), items });
    const day = p.days.find((d) => d.items[0]!.itemId.startsWith("b"))!;
    expect(day.items[0]!.travelFromPrev!.mode).toBe("transit");
    expect(day.returnToLodging).not.toBeNull();
  });

  it("uses the injected travel-time function", () => {
    const p = arrangeDays({
      stop: stop({ days: 2 }),
      items,
      travelTime: () => ({ minutes: 7, mode: "drive" }),
    });
    const legs = placed(p).map((i) => i.travelFromPrev).filter((l) => l !== null);
    expect(legs.length).toBeGreaterThan(0);
    for (const l of legs) expect(l).toEqual({ minutes: 7, mode: "drive" });
  });

  it("flags a far-off item as too far when it can't fit", () => {
    // ~22 km away: the 6h visit plus ~75 min back to the stay misses the 4pm cutoff.
    const far = item("sintra", { lat: 38.7975, lng: -9.3906, durationMinutes: 360, priority: { must: false, rank: 1 } });
    const p = arrangeDays({
      stop: stop({ days: 1, lodging: ALFAMA, departure: { minute: 17 * 60 } }),
      items: [far],
    });
    expect(p.didntFit[0]).toMatchObject({ itemId: "sintra", reason: "too_far", suggestion: "drop" });
  });
});

describe("arrival and departure days (FR-O15)", () => {
  const items: ItemInput[] = [
    item("museum", { ...ALFAMA, priority: { must: true, rank: 1 } }),
    item("castle", { ...near(ALFAMA, 2), priority: { must: true, rank: 2 } }),
    item("tasca", { ...near(ALFAMA, 1), category: "food" }),
    item("marisqueira", { ...near(ALFAMA, 3), category: "food" }),
    item("bar", { ...near(ALFAMA, 4), category: "nightlife" }),
  ];

  it("gives a late arrival dinner only", () => {
    const plan = arrangeDays({ stop: stop({ days: 2, arrival: { minute: 18 * 60 + 30 } }), items });
    const d0 = plan.days[0]!;
    expect(d0).toMatchObject({ kind: "arrival", dinnerOnly: true });
    expect(d0.items).toHaveLength(1);
    const only = d0.items[0]!;
    expect(only.reasonCodes).toContainEqual({ code: "meal_window", meal: "dinner", nearLodging: false });
    expect(only.startMinute!).toBeGreaterThanOrEqual(19 * 60 + 30);
    expect(only.reason).toContain("Late arrival, so just dinner");
  });

  it("ends the departure day before the departure buffer", () => {
    const plan = arrangeDays({
      stop: stop({ days: 2, lodging: BAIXA, departure: { minute: 11 * 60 } }),
      items: [...items, item("breakfast", { ...BAIXA, category: "food", timeOfDay: "breakfast" })],
    });
    const last = plan.days[1]!;
    expect(last.kind).toBe("departure");
    expect(last.window.end).toBe(10 * 60);
    for (const i of last.items) expect(i.startMinute! + i.durationMinutes).toBeLessThanOrEqual(10 * 60);
    expect(find(plan, "museum")!.dayIndex).toBe(0);
  });
});

describe("pace caps (FR-O9)", () => {
  const sights = Array.from({ length: 7 }, (_, i) =>
    item(`s${i}`, { ...near(BAIXA, i), durationMinutes: 60, priority: { must: false, rank: i } }),
  );
  const count = (pace: "relaxed" | "balanced" | "packed") =>
    placed(arrangeDays({ stop: stop({ days: 1 }), items: sights, pace })).length;

  it("caps activities per day by pace", () => {
    expect(count("relaxed")).toBe(2);
    expect(count("balanced")).toBe(3);
    expect(count("packed")).toBe(5);
  });

  it("drops lowest ranks first and suggests adding a day", () => {
    const plan = arrangeDays({ stop: stop({ days: 1 }), items: sights, pace: "relaxed" });
    expect(placed(plan).map((p) => p.itemId).sort()).toEqual(["s0", "s1"]);
    expect(plan.didntFit.map((d) => d.itemId)).toEqual(["s2", "s3", "s4", "s5", "s6"]);
    expect(plan.didntFit[0]).toMatchObject({ reason: "day_full", suggestion: "add_day" });
  });

  it("schedules Must-dos before higher-ranked non-musts", () => {
    const items = [...sights.slice(0, 3), item("must", { ...near(BAIXA, 9), priority: { must: true, rank: 99 } })];
    const plan = arrangeDays({ stop: stop({ days: 1 }), items, pace: "relaxed" });
    expect(find(plan, "must")).toBeDefined();
    expect(find(plan, "s0")).toBeDefined();
    expect(plan.didntFit.map((d) => d.itemId)).toEqual(["s1", "s2"]);
  });

  it("leaves free time between items", () => {
    const plan = arrangeDays({ stop: stop({ days: 1 }), items: sights, pace: "relaxed" });
    const [a, b] = plan.days[0]!.items;
    expect(b!.startMinute! - (a!.startMinute! + a!.durationMinutes)).toBeGreaterThanOrEqual(45);
  });
});

describe("items without a location (FR-O14)", () => {
  const items: ItemInput[] = [
    item("street-food", { category: "food" }),
    item("rooftop-drinks", { category: "drink" }),
    item("vague-idea", { category: "activity" }),
    item("morning-swim", { category: "activity", timeOfDay: "morning" }),
    item("anchor", { ...ALFAMA }),
  ];
  const plan = arrangeDays({ stop: stop({ days: 1, lodging: BAIXA }), items });

  it("places them only by meal or time-of-day hints, without travel legs", () => {
    for (const id of ["street-food", "rooftop-drinks", "morning-swim"]) {
      const p = find(plan, id)!;
      expect(p).toBeDefined();
      expect(p.travelFromPrev).toBeNull();
      expect(p.reasonCodes).toContainEqual({ code: "no_location" });
    }
    expect(find(plan, "morning-swim")!.startMinute!).toBeLessThanOrEqual(11 * 60);
  });

  it("leaves hint-less ones for the user to place", () => {
    expect(find(plan, "vague-idea")).toBeUndefined();
    expect(plan.didntFit).toContainEqual(
      expect.objectContaining({ itemId: "vague-idea", reason: "no_slot", suggestion: "place_manually" }),
    );
  });

  it("never invents a location", () => {
    const json = JSON.stringify(plan);
    expect(json).not.toMatch(/"lat"|"lng"/);
  });
});

describe("suggested Must-dos (FR-O1)", () => {
  it("adds them only if there's room, clearly flagged", () => {
    const items = [
      item("p1", { ...BAIXA, priority: { must: false, rank: 5 } }),
      item("s-must", { ...near(BAIXA, 1), status: "suggested", priority: { must: true, rank: 1 } }),
      item("s-maybe", { ...near(BAIXA, 2), status: "suggested", priority: { must: false, rank: 1 } }),
    ];
    const plan = arrangeDays({ stop: stop({ days: 1 }), items });
    expect(find(plan, "s-must")).toMatchObject({ suggested: true });
    expect(find(plan, "s-must")!.reason).toContain("Suggested Must-do");
    expect(find(plan, "s-maybe")).toBeUndefined();
    expect(find(plan, "p1")).toMatchObject({ suggested: false });
  });

  it("never bumps planned items, and silently skips when full", () => {
    const planned = [0, 1].map((i) => item(`p${i}`, { ...near(BAIXA, i), priority: { must: false, rank: 50 } }));
    const items = [...planned, item("s-must", { ...BAIXA, status: "suggested", priority: { must: true, rank: 1 } })];
    const plan = arrangeDays({ stop: stop({ days: 1 }), items, pace: "relaxed" });
    expect(placed(plan).map((p) => p.itemId).sort()).toEqual(["p0", "p1"]);
    expect(plan.didntFit).toEqual([]);
  });
});

describe("attendance and surprises (FR-O10)", () => {
  const members = ["ana", "ben", "cy", "dee"];
  const items: ItemInput[] = [
    item("brunch-all", { ...BAIXA, category: "food", fixedStart: { dayIndex: 0, minute: 10 * 60 } }),
    item("spa", { ...near(BAIXA, 2), category: "activity", timeOfDay: "afternoon", durationMinutes: 240, attendees: ["ana", "ben"], priority: { must: true, rank: 1 } }),
    item("golf", { ...near(BAIXA, 3), category: "activity", timeOfDay: "afternoon", durationMinutes: 240, attendees: ["cy", "dee"], priority: { must: true, rank: 2 } }),
    item("surprise", { ...near(BAIXA, 1), category: "food", timeOfDay: "dinner", hiddenFrom: ["dee"] }),
  ];
  const plan = arrangeDays({ stop: stop({ days: 1 }), items, memberIds: members });

  it("runs disjoint side plans in parallel", () => {
    const spa = find(plan, "spa")!;
    const golf = find(plan, "golf")!;
    expect(spa.startMinute! < golf.startMinute! + golf.durationMinutes).toBe(true);
    expect(golf.startMinute! < spa.startMinute! + spa.durationMinutes).toBe(true);
    expect(spa.track).not.toBe(golf.track);
    const side = spa.track > 0 ? spa : golf;
    expect(side.reason).toContain("Side plan for 2 people");
    expect(plan.warnings.filter((w) => w.code === "overlap")).toEqual([]);
  });

  it("does not overlap items that share people", () => {
    const more = [
      ...items,
      item("tour", { ...near(BAIXA, 4), category: "activity", timeOfDay: "afternoon", durationMinutes: 240, attendees: ["ana", "cy"], priority: { must: true, rank: 3 } }),
    ];
    const p = arrangeDays({ stop: stop({ days: 1 }), items: more, memberIds: members });
    expect(find(p, "tour")).toBeUndefined();
    expect(p.didntFit.map((d) => d.itemId)).toEqual(["tour"]);
  });

  it("treats attendees covering everyone as the whole group", () => {
    const p = arrangeDays({
      stop: stop({ days: 1 }),
      items: [item("x", { ...BAIXA, attendees: ["dee", "cy", "ben", "ana"] })],
      memberIds: members,
    });
    expect(find(p, "x")!.attendees).toBeNull();
  });

  it("passes hiddenFrom through for surprise blocks", () => {
    expect(find(plan, "surprise")!.hiddenFrom).toEqual(["dee"]);
    expect(find(plan, "spa")!.hiddenFrom).toEqual([]);
  });
});

describe("misc", () => {
  it("skips stays with a warning", () => {
    const plan = arrangeDays({ stop: stop(), items: [item("airbnb", { ...BAIXA, category: "stay" })] });
    expect(placed(plan)).toHaveLength(0);
    expect(plan.warnings).toContainEqual(expect.objectContaining({ code: "stay_skipped", itemId: "airbnb" }));
  });

  it("ignores duplicate ids with a warning", () => {
    const plan = arrangeDays({ stop: stop(), items: [item("a", { ...BAIXA }), item("a", { ...BELEM })] });
    expect(placed(plan)).toHaveLength(1);
    expect(plan.warnings).toContainEqual(expect.objectContaining({ code: "duplicate_item" }));
  });

  it("handles zero days", () => {
    const plan = arrangeDays({ stop: stop({ days: 0 }), items: [item("a", { ...BAIXA })] });
    expect(plan.days).toEqual([]);
    expect(plan.didntFit).toHaveLength(1);
  });
});

describe("performance", () => {
  it("arranges 200 items over 7 days in < 200ms", () => {
    const rnd = lcg(42);
    const cats = ["food", "sight", "activity", "shopping", "drink", "nightlife", "other"] as const;
    const items: ItemInput[] = Array.from({ length: 200 }, (_, i) => {
      const category = cats[Math.floor(rnd() * cats.length)]!;
      const hasHours = rnd() < 0.5;
      const openingHours = hasHours
        ? Object.fromEntries(
            [0, 1, 2, 3, 4, 5, 6]
              .filter(() => rnd() < 0.85)
              .map((w) => [w, [{ open: 9 * 60 + Math.floor(rnd() * 4) * 30, close: 17 * 60 + Math.floor(rnd() * 12) * 30 }]]),
          )
        : undefined;
      return item(`i${String(i).padStart(3, "0")}`, {
        category,
        lat: 38.7 + rnd() * 0.08,
        lng: -9.22 + rnd() * 0.12,
        openingHours,
        priority: { must: rnd() < 0.15, rank: Math.floor(rnd() * 100) },
        fixedStart: i % 50 === 0 ? { dayIndex: (i / 50) % 7, minute: 13 * 60 } : null,
      });
    });
    const input: ArrangeInput = {
      stop: stop({
        days: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"],
        lodging: BAIXA,
        arrival: { minute: 14 * 60 },
        departure: { minute: 16 * 60 },
      }),
      items,
    };
    arrangeDays(input); // warm-up (JIT)
    const t0 = performance.now();
    const plan = arrangeDays(input);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(200);
    expect(placed(plan).length + plan.didntFit.length).toBe(200);
  });
});
