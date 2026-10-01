import { normalizeAttendees } from "./rules";
import type { ArrangeInput, PlanBasis } from "./types";

/** Canonical JSON: object keys sorted, undefined dropped. */
function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** 64-bit (two 32-bit FNV-style lanes) hex digest of canonical JSON. Not cryptographic. */
export function stableHash(v: unknown): string {
  const s = canonical(v);
  let h1 = 0x811c9dc5;
  let h2 = 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 13);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Snapshot of what a plan was arranged from (FR-O17). Only `planned` items
 * count: votes reshuffling the suggested shortlist, rank changes and the
 * user's own locks/drags don't make a plan stale.
 */
export function computePlanBasis(input: ArrangeInput): PlanBasis {
  const items: PlanBasis["items"] = {};
  const planned = input.items
    .filter((i) => i.status === "planned" && i.category !== "stay")
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const i of planned) {
    items[i.id] = {
      d: stableHash({
        category: i.category,
        lat: i.lat ?? null,
        lng: i.lng ?? null,
        durationMinutes: i.durationMinutes ?? null,
        openingHours: i.openingHours ?? null,
        timeOfDay: i.timeOfDay ?? null,
        fixedStart: i.fixedStart ?? null,
      }),
      a: stableHash(normalizeAttendees(i.attendees, input.memberIds)),
    };
  }
  return {
    version: 1,
    items,
    membersHash: stableHash(input.memberIds ? [...new Set(input.memberIds)].sort() : null),
    stopHash: stableHash({
      days: input.stop.days,
      lodging: input.stop.lodging ?? null,
      arrival: input.stop.arrival ?? null,
      departure: input.stop.departure ?? null,
      timezone: input.stop.timezone,
    }),
  };
}

export interface PlanFreshness {
  /** true → show "Plan may be out of date: re-arrange?" (never auto-rearranged). */
  outOfDate: boolean;
  addedItemIds: string[];
  removedItemIds: string[];
  /** Kept items whose hours, location, duration, time hint or reservation changed. */
  changedItemIds: string[];
  /** Who's going changed (member list, or a kept item's attendees). */
  attendanceChanged: boolean;
  /** Stop dates/days, lodging or arrival/departure changed (FR-S10). */
  stopChanged: boolean;
}

export function checkPlanFreshness(basis: PlanBasis, current: ArrangeInput): PlanFreshness {
  const now = computePlanBasis(current);
  const beforeIds = Object.keys(basis.items).sort();
  const afterIds = Object.keys(now.items).sort();
  const addedItemIds = afterIds.filter((id) => !(id in basis.items));
  const removedItemIds = beforeIds.filter((id) => !(id in now.items));
  const kept = afterIds.filter((id) => id in basis.items);
  const changedItemIds = kept.filter((id) => basis.items[id]!.d !== now.items[id]!.d);
  const attendanceChanged =
    basis.membersHash !== now.membersHash ||
    kept.some((id) => basis.items[id]!.a !== now.items[id]!.a);
  const stopChanged = basis.stopHash !== now.stopHash;
  return {
    outOfDate:
      addedItemIds.length > 0 ||
      removedItemIds.length > 0 ||
      changedItemIds.length > 0 ||
      attendanceChanged ||
      stopChanged,
    addedItemIds,
    removedItemIds,
    changedItemIds,
    attendanceChanged,
    stopChanged,
  };
}
