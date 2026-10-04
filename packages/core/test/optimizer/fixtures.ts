import type { ItemInput, Plan, PlannedItem, StopInput } from "../../src/optimizer";

// Lisbon neighbourhoods (~6.5 km apart).
export const ALFAMA = { lat: 38.7115, lng: -9.1302 };
export const BELEM = { lat: 38.6976, lng: -9.2063 };
export const BAIXA = { lat: 38.7108, lng: -9.1366 };

/** Offset a point by roughly `dx`/`dy` hundred metres. */
export function near(base: { lat: number; lng: number }, dx: number, dy = 0) {
  return { lat: base.lat + dy * 0.0009, lng: base.lng + dx * 0.00115 };
}

export function item(id: string, over: Partial<ItemInput> = {}): ItemInput {
  return {
    id,
    title: over.title ?? id,
    category: "sight",
    priority: { must: false, rank: 10 },
    status: "planned",
    ...over,
  };
}

export function stop(over: Partial<StopInput> = {}): StopInput {
  return { timezone: "Europe/Lisbon", days: 2, ...over };
}

export function placed(plan: Plan): Array<PlannedItem & { dayIndex: number }> {
  return plan.days.flatMap((d) => d.items.map((i) => ({ ...i, dayIndex: d.dayIndex })));
}

export function find(plan: Plan, id: string) {
  return placed(plan).find((i) => i.itemId === id);
}

export function totalTravel(plan: Plan): number {
  return placed(plan).reduce((s, i) => s + (i.travelFromPrev?.minutes ?? 0), 0);
}

/** Deterministic PRNG for fixtures. */
export function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
