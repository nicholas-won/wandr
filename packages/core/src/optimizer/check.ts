import {
  PACE_RULES,
  WEEKDAY_NAMES,
  arrivalStart,
  attendeesIntersect,
  bucketOf,
  dayCount,
  departureEnd,
  formatMinute,
  hasLocation,
  intervalsOn,
  kindsFor,
  normalizeAttendees,
  weekdayOf,
  type Bucket,
} from "./rules";
import { defaultTravelTime } from "./travel";
import type {
  ItemInput,
  Pace,
  PlanLike,
  PlanWarning,
  StopInput,
  TravelTimeFn,
  Weekday,
} from "./types";

export interface CheckPlanOptions {
  pace?: Pace;
  travelTime?: TravelTimeFn;
  memberIds?: readonly string[];
  /** Consecutive items at least this many minutes apart get a "far_apart" hint. Default 45. */
  farApartMinutes?: number;
}

const MODE_TEXT = { walk: "on foot", transit: "by transit", drive: "by car" };

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Live hints between runs (FR-O6). Pure: looks at a plan (possibly hand-edited)
 * and reports problems without moving anything.
 */
export function checkPlan(
  plan: PlanLike,
  items: readonly ItemInput[],
  stop: StopInput,
  options: CheckPlanOptions = {},
): PlanWarning[] {
  const pace = options.pace ?? plan.pace ?? "balanced";
  const caps = PACE_RULES[pace];
  const travel = options.travelTime ?? defaultTravelTime;
  const farApart = options.farApartMinutes ?? 45;
  const byId = new Map(items.map((i) => [i.id, i]));
  const n = dayCount(stop);
  const arr = arrivalStart(stop);
  const dep = departureEnd(stop);
  const warnings: PlanWarning[] = [];

  const days = plan.days.slice().sort((a, b) => a.dayIndex - b.dayIndex);
  for (const day of days) {
    const date =
      typeof stop.days === "number" ? null : (stop.days[day.dayIndex] ?? null);
    const weekday: Weekday | null = date ? weekdayOf(date) : null;

    const entries = day.items
      .map((pi) => {
        const item = byId.get(pi.itemId);
        if (!item) return null;
        return {
          pi,
          item,
          att: normalizeAttendees(item.attendees, options.memberIds),
          start: pi.startMinute,
          end: pi.startMinute === null ? null : pi.startMinute + pi.durationMinutes,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort(
        (a, b) =>
          (a.start ?? Infinity) - (b.start ?? Infinity) ||
          (a.pi.track ?? 0) - (b.pi.track ?? 0) ||
          (a.pi.itemId < b.pi.itemId ? -1 : a.pi.itemId > b.pi.itemId ? 1 : 0),
      );

    for (const e of entries) {
      const base = { dayIndex: day.dayIndex, itemId: e.item.id };
      // Hours (only when dated, FR-O13).
      const ivs = intervalsOn(e.item, weekday);
      if (ivs && weekday !== null) {
        if (ivs.length === 0) {
          warnings.push({
            ...base,
            code: "closed_that_day",
            detail: `Closed on ${WEEKDAY_NAMES[weekday]}s`,
          });
        } else if (e.start !== null && e.end !== null) {
          const s = e.start;
          const en = e.end;
          const ok = ivs.some((iv) => s >= iv.open && en <= iv.close);
          if (!ok) {
            const containing = ivs.find((iv) => s >= iv.open && s < iv.close);
            const nextOpen = ivs.find((iv) => iv.open > s);
            warnings.push({
              ...base,
              code: "outside_hours",
              detail: containing
                ? `Closes at ${formatMinute(containing.close)}`
                : nextOpen
                  ? `Opens at ${formatMinute(nextOpen.open)}`
                  : "Closed at that time",
            });
          }
        }
      }
      // Arrival / departure.
      if (e.start !== null && e.end !== null) {
        if (day.dayIndex === 0 && arr !== null && e.start < arr && stop.arrival) {
          warnings.push({
            ...base,
            code: "overlaps_arrival",
            detail: `This overlaps your arrival (${formatMinute(stop.arrival.minute)})`,
          });
        }
        if (day.dayIndex === n - 1 && dep !== null && e.end > dep && stop.departure) {
          warnings.push({
            ...base,
            code: "overlaps_departure",
            detail: `This overlaps your departure (${formatMinute(stop.departure.minute)})`,
          });
        }
      }
    }

    // Overlaps and travel between consecutive items that share people.
    const timed = entries.filter((e) => e.start !== null);
    for (let i = 0; i < timed.length; i++) {
      const b = timed[i]!;
      let prev: (typeof timed)[number] | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const a = timed[j]!;
        if (!attendeesIntersect(a.att, b.att)) continue;
        if (prev === null) prev = a;
        if (a.end! > b.start!) {
          warnings.push({
            code: "overlap",
            dayIndex: day.dayIndex,
            itemId: b.item.id,
            otherItemId: a.item.id,
            detail: `Overlaps ${a.item.title}`,
          });
        }
      }
      if (prev && hasLocation(prev.item) && hasLocation(b.item)) {
        const leg = travel(
          { id: prev.item.id, lat: prev.item.lat!, lng: prev.item.lng! },
          { id: b.item.id, lat: b.item.lat!, lng: b.item.lng! },
        );
        if (leg.minutes >= farApart) {
          warnings.push({
            code: "far_apart",
            dayIndex: day.dayIndex,
            itemId: b.item.id,
            otherItemId: prev.item.id,
            detail: `${Math.round(leg.minutes)} min apart ${MODE_TEXT[leg.mode]}`,
          });
        }
      }
    }

    // Pace (counted per person-track: main plan + the busiest side plan).
    const counts = new Map<number, Record<Bucket, number>>();
    for (const e of entries) {
      const t = e.pi.track ?? 0;
      const c = counts.get(t) ?? { activity: 0, meal: 0, night: 0 };
      c[bucketOf(kindsFor(e.item)[0]!)]++;
      counts.set(t, c);
    }
    const main = counts.get(0) ?? { activity: 0, meal: 0, night: 0 };
    let worst = { ...main };
    for (const [t, c] of counts) {
      if (t === 0) continue;
      const total = {
        activity: main.activity + c.activity,
        meal: main.meal + c.meal,
        night: main.night + c.night,
      };
      if (total.activity + total.meal + total.night > worst.activity + worst.meal + worst.night)
        worst = total;
    }
    if (worst.activity > caps.activities || worst.meal > caps.meals || worst.night > caps.night) {
      warnings.push({
        code: "packed_day",
        dayIndex: day.dayIndex,
        detail: `${plural(worst.activity, "activity", "activities")} and ${plural(worst.meal, "meal", "meals")}; that's a packed day`,
      });
    }
  }
  return warnings;
}
