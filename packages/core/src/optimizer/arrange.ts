/**
 * "Arrange my days" (REQUIREMENTS.md §6.11): a deterministic day planner.
 *
 * Pipeline:
 *  1. Normalize items. Locked/reservation items are pinned exactly where they
 *     are and are never moved (FR-O4, FR-O8). `stay` items aren't scheduled.
 *  2. Priority order (FR-O10): day-locked items, then planned Must-dos, then
 *     planned items by rank, then suggested Must-dos (only if room, FR-O1).
 *     Ties break by id.
 *  3. Geography (FR-O7): deterministic k-medoids over located items, one
 *     cluster per usable day; days that already hold pinned items get the
 *     nearest cluster. Each item gets a "preferred day".
 *  4. Cheapest feasible insertion: each item (in priority order) is tried at
 *     every position of every day, in each of its time-window kinds (meal
 *     windows, nights, time-of-day hints, FR-O9), against opening hours on
 *     that weekday when dated (FR-O13), pace caps, arrival/departure frames
 *     (FR-O15), and travel times from the injected function. The cost is the
 *     added travel minutes (days start and end at lodging when known), plus a
 *     penalty for leaving the preferred day and a small per-item load term.
 *     Items for a subset of people may go on a parallel side track when the
 *     main plan has no room, overlapping only items with disjoint attendees.
 *  5. Intra-day relocate pass to cut travel further.
 *  6. Anything left goes to "Didn't fit" with a reason and suggestion (FR-O5);
 *     placed items get reason facts + default English (FR-O2).
 *
 * The engine never invents hours, travel times or locations (FR-O14).
 */
import { kMedoids } from "./cluster";
import { checkPlan } from "./check";
import { computePlanBasis } from "./freshness";
import { summarizeReasons } from "./reasons";
import {
  KIND_WINDOWS,
  PACE_RULES,
  WEEKDAY_NAMES,
  attendeesIntersect,
  bucketOf,
  buildDayFrames,
  durationFor,
  hasLocation,
  intervalsOn,
  kindsFor,
  mealSlotOf,
  normalizeAttendees,
  windowsFor,
  type Bucket,
  type DayFrame,
  type Kind,
  type MealSlot,
} from "./rules";
import { TravelCache, defaultTravelTime, haversineKm } from "./travel";
import type {
  ArrangeInput,
  DidntFitItem,
  ItemInput,
  OpeningInterval,
  Plan,
  PlanDay,
  PlanWarning,
  PlannedItem,
  ReasonCode,
  TravelLeg,
  TravelPoint,
  Weekday,
} from "./types";

/** Extra cost (minutes) for placing an item off its geographic cluster's day. */
export const OFF_CLUSTER_PENALTY = 20;
/** Cost (minutes) per item already on a day; spreads untied items across days. */
export const LOAD_COST = 1;
/** An item this many minutes from everything else counts as "too far". */
export const TOO_FAR_MINUTES = 60;
/** Radius for "Grouped with N other spots nearby". */
export const NEARBY_KM = 1.5;
/** "Near your stay" threshold. */
export const NEAR_LODGING_MINUTES = 15;
/** Places closing at or before this get a "Closes at …" reason. */
export const CLOSES_EARLY_MINUTE = 20 * 60;
const IMPROVE_PASSES = 4;
const EPS = 1e-9;

interface Prep {
  item: ItemInput;
  order: number;
  pt: number;
  attendees: string[] | null;
  hiddenFrom: string[];
  suggested: boolean;
  pin: { dayIndex: number; start: number; kind: "locked" | "reservation" } | null;
  dayLock: number | null;
  kinds: Kind[];
  pref: number;
}

interface Slot {
  p: Prep;
  kind: Kind;
  bucket: Bucket;
  mealSlot: MealSlot | null;
  duration: number;
  windows: Array<[number, number]>;
  fixed: number | null;
  intervals: OpeningInterval[] | null;
  start: number;
  leg: TravelLeg | null;
}

interface Track {
  slots: Slot[];
  total: number;
  ret: TravelLeg | null;
}

interface DayState {
  f: DayFrame;
  tracks: Track[];
  unscheduled: Prep[];
}

interface Evaluation {
  total: number;
  starts: number[];
  legs: Array<TravelLeg | null>;
  ret: TravelLeg | null;
}

type DayStatus = "closed" | "cap" | "window" | "time";

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function arrangeDays(input: ArrangeInput): Plan {
  const pace = input.pace ?? "balanced";
  const rules = PACE_RULES[pace];
  const frames = buildDayFrames(input.stop, pace);
  const nDays = frames.length;
  const warnings: PlanWarning[] = [];
  const didntFit: Array<DidntFitItem & { order: number }> = [];

  // ---- 1. Normalize -------------------------------------------------------
  const seen = new Set<string>();
  const unique: ItemInput[] = [];
  for (const it of input.items) {
    if (seen.has(it.id)) {
      warnings.push({ code: "duplicate_item", itemId: it.id, detail: "Listed twice; used the first" });
      continue;
    }
    seen.add(it.id);
    unique.push(it);
  }
  unique.sort(byId);

  const lodging = input.stop.lodging && hasLocation(input.stop.lodging) ? input.stop.lodging : null;
  const points: TravelPoint[] = [];
  if (lodging) points.push({ id: "lodging", lat: lodging.lat, lng: lodging.lng });
  const lodgingPt = lodging ? 0 : -1;

  const preps: Prep[] = [];
  for (const item of unique) {
    if (item.category === "stay") {
      warnings.push({
        code: "stay_skipped",
        itemId: item.id,
        detail: "Stays aren't scheduled; set it as the Stop's lodging",
      });
      continue;
    }
    let pin: Prep["pin"] = null;
    let dayLock: number | null = null;
    if (item.locked && item.locked.startMinute != null) {
      pin = { dayIndex: item.locked.dayIndex, start: item.locked.startMinute, kind: "locked" };
    } else if (item.fixedStart) {
      pin = { dayIndex: item.fixedStart.dayIndex, start: item.fixedStart.minute, kind: "reservation" };
    } else if (item.locked) {
      dayLock = item.locked.dayIndex;
    }
    const pinnedish = pin !== null || dayLock !== null;
    if (!pinnedish && item.status === "suggested" && !item.priority.must) continue;

    const located = hasLocation(item);
    let pt = -1;
    if (located) {
      pt = points.length;
      points.push({ id: item.id, lat: item.lat!, lng: item.lng! });
    }
    const p: Prep = {
      item,
      order: 0,
      pt,
      attendees: normalizeAttendees(item.attendees, input.memberIds),
      hiddenFrom: item.hiddenFrom ? [...item.hiddenFrom] : [],
      suggested: !pinnedish && item.status === "suggested",
      pin,
      dayLock,
      kinds: kindsFor(item),
      pref: -1,
    };
    // FR-O14: a plain-text idea with no time hint is left for the user to place.
    if (!located && p.kinds.length === 1 && p.kinds[0] === "day") p.kinds = [];
    const lockDay = pin?.dayIndex ?? dayLock;
    if (lockDay !== null && (lockDay < 0 || lockDay >= nDays || !Number.isInteger(lockDay))) {
      didntFit.push({
        order: -1,
        itemId: item.id,
        reason: "no_slot",
        suggestion: "add_day",
        detail: `Locked to Day ${lockDay + 1}, which isn't in this Stop`,
      });
      continue;
    }
    preps.push(p);
  }

  // ---- 2. Priority order --------------------------------------------------
  const group = (p: Prep) =>
    p.pin ? -1 : p.dayLock !== null ? 0 : p.suggested ? 3 : p.item.priority.must ? 1 : 2;
  const rankOf = (p: Prep) =>
    Number.isFinite(p.item.priority.rank) ? p.item.priority.rank : Number.POSITIVE_INFINITY;
  preps.sort((a, b) => group(a) - group(b) || rankOf(a) - rankOf(b) || byId(a.item, b.item));
  preps.forEach((p, i) => (p.order = i));

  const travelFn = input.travelTime ?? defaultTravelTime;
  const cache = new TravelCache(points, travelFn);
  const buffer = rules.bufferMinutes;
  const days: DayState[] = frames.map((f) => ({ f, tracks: [{ slots: [], total: 0, ret: null }], unscheduled: [] }));

  // ---- Timeline evaluation -------------------------------------------------
  const evaluate = (day: DayState, slots: Slot[]): Evaluation | null => {
    const f = day.f;
    let t = f.hardStart;
    let last = lodgingPt;
    let total = 0;
    let flexSincePin = false;
    let any = false;
    const starts = new Array<number>(slots.length);
    const legs = new Array<TravelLeg | null>(slots.length);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      const leg = last >= 0 && s.p.pt >= 0 ? cache.get(last, s.p.pt) : null;
      const arrive = t + (leg ? leg.minutes : 0);
      let start: number;
      if (s.fixed !== null) {
        start = s.fixed;
        if (arrive > start && flexSincePin) return null;
        flexSincePin = false;
      } else {
        const earliest = arrive + (any ? buffer : 0);
        start = -1;
        for (const [es, ls] of s.windows) {
          const c = Math.max(es, earliest);
          if (c <= ls) {
            start = c;
            break;
          }
        }
        if (start < 0 || start + s.duration > f.hardEnd) return null;
        flexSincePin = true;
      }
      starts[i] = start;
      legs[i] = leg;
      if (leg) total += leg.minutes;
      t = Math.max(t, start + s.duration);
      any = true;
      if (s.p.pt >= 0) last = s.p.pt;
    }
    let ret: TravelLeg | null = null;
    if (lodgingPt >= 0 && last >= 0 && last !== lodgingPt) {
      ret = cache.get(last, lodgingPt);
      total += ret.minutes;
      if (f.isDeparture && flexSincePin && t + ret.minutes > f.hardEnd) return null;
    }
    return { total, starts, legs, ret };
  };

  /** Parallel tracks may only overlap items whose attendees are disjoint. */
  const conflicts = (day: DayState, trackIdx: number, slots: Slot[], starts: number[]): boolean => {
    if (day.tracks.length <= 1 && trackIdx === 0) return false;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      if (s.fixed !== null) continue;
      const a = starts[i]!;
      const b = a + s.duration;
      for (let t = 0; t < day.tracks.length; t++) {
        if (t === trackIdx) continue;
        for (const o of day.tracks[t]!.slots) {
          if (o.start < b && a < o.start + o.duration && attendeesIntersect(s.p.attendees, o.p.attendees))
            return true;
        }
      }
    }
    return false;
  };

  const apply = (track: Track, ev: Evaluation) => {
    track.slots.forEach((s, i) => {
      s.start = ev.starts[i]!;
      s.leg = ev.legs[i]!;
    });
    track.total = ev.total;
    track.ret = ev.ret;
  };

  const countIn = (track: Track | undefined, bucket: Bucket) =>
    track ? track.slots.reduce((n, s) => n + (s.bucket === bucket ? 1 : 0), 0) : 0;
  const mealIn = (track: Track | undefined, ms: MealSlot) =>
    track ? track.slots.some((s) => s.mealSlot === ms) : false;

  const capOk = (day: DayState, trackIdx: number, bucket: Bucket, ms: MealSlot | null): boolean => {
    const cap = day.f.caps[bucket];
    const main = day.tracks[0]!;
    let used = countIn(main, bucket);
    let slotTaken = ms !== null && mealIn(main, ms);
    if (trackIdx > 0) {
      const t = day.tracks[trackIdx];
      used += countIn(t, bucket);
      slotTaken = slotTaken || (ms !== null && mealIn(t, ms));
    } else {
      let side = 0;
      for (let t = 1; t < day.tracks.length; t++) {
        side = Math.max(side, countIn(day.tracks[t], bucket));
        if (ms !== null && mealIn(day.tracks[t], ms)) slotTaken = true;
      }
      used += side;
    }
    return used < cap && !slotTaken;
  };

  const makeSlot = (p: Prep, kind: Kind, f: DayFrame, fixed: number | null): Slot | null => {
    const duration = durationFor(p.item, kind);
    const intervals = intervalsOn(p.item, f.weekday);
    const windows = fixed !== null ? [[fixed, fixed] as [number, number]] : windowsFor(p.item, kind, duration, f, intervals);
    if (windows.length === 0) return null;
    return {
      p,
      kind,
      bucket: bucketOf(kind),
      mealSlot: mealSlotOf(kind),
      duration,
      windows,
      fixed,
      intervals,
      start: fixed ?? 0,
      leg: null,
    };
  };

  // ---- Pinned items (never moved) -----------------------------------------
  for (const p of preps.filter((x) => x.pin).sort((a, b) => a.pin!.dayIndex - b.pin!.dayIndex || a.pin!.start - b.pin!.start || byId(a.item, b.item))) {
    const day = days[p.pin!.dayIndex]!;
    const start = p.pin!.start;
    // Pick the kind whose window holds the pinned time (an 8pm food reservation is dinner).
    const kind =
      p.kinds.find((k) => start >= (KIND_WINDOWS[k].earliest ?? 0) && start <= KIND_WINDOWS[k].latestStart) ??
      p.kinds[0] ??
      "day";
    const slot = makeSlot(p, kind, day.f, start)!;
    const overlaps = (tr: Track) =>
      tr.slots.filter((o) => o.start < slot.start + slot.duration && slot.start < o.start + o.duration);
    let ti = 0;
    const mainOverlap = overlaps(day.tracks[0]!);
    if (
      p.attendees &&
      mainOverlap.length > 0 &&
      mainOverlap.every((o) => !attendeesIntersect(o.p.attendees, p.attendees))
    ) {
      ti = day.tracks.findIndex((tr, i) => i > 0 && overlaps(tr).length === 0);
      if (ti < 0) {
        day.tracks.push({ slots: [], total: 0, ret: null });
        ti = day.tracks.length - 1;
      }
    }
    const tr = day.tracks[ti]!;
    let pos = tr.slots.findIndex((o) => o.start > slot.start);
    if (pos < 0) pos = tr.slots.length;
    tr.slots.splice(pos, 0, slot);
  }
  for (const day of days) for (const tr of day.tracks) apply(tr, evaluate(day, tr.slots)!);

  // ---- 3. Clustering → preferred day ------------------------------------------
  const flex = preps.filter((p) => !p.pin);
  /** Days that own a geographic cluster; only these charge the off-cluster penalty. */
  const clusteredDays = new Set<number>();
  const clusterable = flex.filter((p) => p.dayLock === null && p.pt >= 0 && p.kinds.length > 0);
  const usable = frames.filter((f) => f.caps.activity > 0);
  const k = Math.min(clusterable.length, usable.length);
  if (k > 0) {
    const cpts = clusterable.map((p) => cache.point(p.pt));
    const { assignment, medoids } = kMedoids(cpts, k, lodging);
    const clusterDay = new Array<number>(medoids.length).fill(-1);
    const freeDays = new Set(usable.map((f) => f.index));
    // Days anchored by pinned located items take the nearest cluster first.
    for (const f of usable) {
      const anchors = days[f.index]!.tracks.flatMap((t) => t.slots).filter((s) => s.p.pt >= 0);
      if (anchors.length === 0) continue;
      const c = {
        lat: anchors.reduce((a, s) => a + cache.point(s.p.pt).lat, 0) / anchors.length,
        lng: anchors.reduce((a, s) => a + cache.point(s.p.pt).lng, 0) / anchors.length,
      };
      let best = -1;
      let bestD = Infinity;
      medoids.forEach((m, ci) => {
        if (clusterDay[ci] !== -1) return;
        const d = haversineKm(c, cpts[m]!);
        if (d < bestD - EPS) {
          bestD = d;
          best = ci;
        }
      });
      if (best >= 0) {
        clusterDay[best] = f.index;
        freeDays.delete(f.index);
      }
    }
    const sizes = medoids.map((_, ci) => assignment.filter((a) => a === ci).length);
    const remainingClusters = medoids
      .map((m, ci) => ci)
      .filter((ci) => clusterDay[ci] === -1)
      .sort((a, b) => sizes[b]! - sizes[a]! || byId(cpts[medoids[a]!]!, cpts[medoids[b]!]!));
    const remainingDays = usable
      .filter((f) => freeDays.has(f.index))
      .sort((a, b) => b.caps.activity - a.caps.activity || a.index - b.index);
    remainingClusters.forEach((ci, i) => {
      const d = remainingDays[i];
      if (d) clusterDay[ci] = d.index;
    });
    clusterable.forEach((p, i) => (p.pref = clusterDay[assignment[i]!] ?? -1));
    for (const d of clusterDay) if (d >= 0) clusteredDays.add(d);
  }

  // ---- 4. Cheapest feasible insertion ---------------------------------------
  interface Candidate {
    cost: number;
    day: number;
    track: number;
    pos: number;
    slot: Slot;
    ev: Evaluation;
  }

  const dayLoad = (day: DayState) => day.tracks.reduce((n, t) => n + t.slots.length, 0);

  const bestInsertion = (p: Prep, statuses: Map<number, DayStatus> | null): Candidate | null => {
    let best: Candidate | null = null;
    const dayIdxs = p.dayLock !== null ? [p.dayLock] : days.map((d) => d.f.index);
    for (const di of dayIdxs) {
      const day = days[di]!;
      const f = day.f;
      const ivs = intervalsOn(p.item, f.weekday);
      if (ivs && ivs.length === 0) {
        statuses?.set(di, "closed");
        continue;
      }
      let status: DayStatus = "window";
      const rank = (s: DayStatus) => ({ closed: 0, window: 1, cap: 2, time: 3 })[s];
      const bump = (s: DayStatus) => {
        if (rank(s) > rank(status)) status = s;
      };
      const offCluster = p.pref >= 0 && p.pref !== di && clusteredDays.has(di);
      const base = (offCluster ? OFF_CLUSTER_PENALTY : 0) + LOAD_COST * dayLoad(day);
      for (const kind of p.kinds) {
        if (f.dinnerOnly && kind !== "dinner") {
          bump("cap");
          continue;
        }
        const slot = makeSlot(p, kind, f, null);
        if (!slot) continue;
        const tryTrack = (ti: number): boolean => {
          const tr = day.tracks[ti] ?? { slots: [], total: 0, ret: null };
          if (!capOk(day, ti, slot.bucket, slot.mealSlot)) {
            bump("cap");
            return false;
          }
          let found = false;
          for (let pos = 0; pos <= tr.slots.length; pos++) {
            const seq = tr.slots.slice();
            seq.splice(pos, 0, slot);
            const ev = evaluate(day, seq);
            if (!ev || conflicts(day, ti, seq, ev.starts)) {
              bump("time");
              continue;
            }
            found = true;
            const cost = ev.total - tr.total + base;
            if (!best || cost < best.cost - EPS) best = { cost, day: di, track: ti, pos, slot, ev };
          }
          return found;
        };
        if (tryTrack(0)) continue;
        if (p.attendees) {
          let placed = false;
          for (let ti = 1; ti < day.tracks.length && !placed; ti++) placed = tryTrack(ti);
          if (!placed) tryTrack(day.tracks.length);
        }
      }
      statuses?.set(di, status);
    }
    return best;
  };

  const commit = (c: Candidate) => {
    const day = days[c.day]!;
    if (c.track >= day.tracks.length) day.tracks.push({ slots: [], total: 0, ret: null });
    const tr = day.tracks[c.track]!;
    tr.slots.splice(c.pos, 0, c.slot);
    apply(tr, c.ev);
  };

  const failed: Array<{ p: Prep; statuses: Map<number, DayStatus> }> = [];
  for (const p of flex) {
    if (p.kinds.length === 0) {
      if (p.dayLock !== null) days[p.dayLock]!.unscheduled.push(p);
      else if (!p.suggested)
        didntFit.push({
          order: p.order,
          itemId: p.item.id,
          reason: "no_slot",
          suggestion: "place_manually",
          detail: "No location or time hint; place it yourself",
        });
      continue;
    }
    const statuses = new Map<number, DayStatus>();
    const c = bestInsertion(p, statuses);
    if (c) commit(c);
    else if (p.dayLock !== null) days[p.dayLock]!.unscheduled.push(p);
    else if (!p.suggested) failed.push({ p, statuses });
  }

  // ---- 5. Intra-day relocate pass ----------------------------------------------
  for (const day of days) {
    for (let ti = 0; ti < day.tracks.length; ti++) {
      const tr = day.tracks[ti]!;
      for (let pass = 0; pass < IMPROVE_PASSES; pass++) {
        let improved = false;
        const movable = tr.slots.filter((s) => s.fixed === null).sort((a, b) => byId(a.p.item, b.p.item));
        for (const s of movable) {
          const i = tr.slots.indexOf(s);
          const rest = tr.slots.slice();
          rest.splice(i, 1);
          let bestEv: Evaluation | null = null;
          let bestSeq: Slot[] | null = null;
          for (let pos = 0; pos <= rest.length; pos++) {
            if (pos === i) continue;
            const seq = rest.slice();
            seq.splice(pos, 0, s);
            const ev = evaluate(day, seq);
            if (!ev || conflicts(day, ti, seq, ev.starts)) continue;
            if (ev.total < (bestEv?.total ?? tr.total) - EPS) {
              bestEv = ev;
              bestSeq = seq;
            }
          }
          if (bestEv && bestSeq) {
            tr.slots = bestSeq;
            apply(tr, bestEv);
            improved = true;
          }
        }
        if (!improved) break;
      }
    }
  }

  // ---- 6. Didn't fit -------------------------------------------------------------
  const scheduled = days.flatMap((d) => d.tracks.flatMap((t) => t.slots.map((s) => ({ s, day: d.f.index }))));
  const lastWeekday = frames[nDays - 1]?.weekday ?? null;
  for (const { p, statuses } of failed) {
    const st = [...statuses.values()];
    const id = p.item.id;
    if (st.length > 0 && st.every((s) => s === "closed")) {
      const names = [...new Set(frames.map((f) => f.weekday).filter((w): w is Weekday => w !== null))]
        .map((w) => `${WEEKDAY_NAMES[w]}s`);
      const nextDay = lastWeekday === null ? null : (((lastWeekday + 1) % 7) as Weekday);
      const openNext = nextDay !== null && (intervalsOn(p.item, nextDay)?.length ?? 0) > 0;
      didntFit.push({
        order: p.order,
        itemId: id,
        reason: "closed",
        suggestion: openNext ? "add_day" : "drop",
        detail: `Closed on ${joinList(names)}`,
      });
      continue;
    }
    if (st.includes("time")) {
      let minTravel = Infinity;
      if (p.pt >= 0) {
        if (lodgingPt >= 0) minTravel = cache.get(lodgingPt, p.pt).minutes;
        for (const { s } of scheduled) if (s.p.pt >= 0) minTravel = Math.min(minTravel, cache.get(s.p.pt, p.pt).minutes);
      }
      if (Number.isFinite(minTravel) && minTravel > TOO_FAR_MINUTES) {
        didntFit.push({
          order: p.order,
          itemId: id,
          reason: "too_far",
          suggestion: p.item.priority.must ? "add_day" : "drop",
          detail: `About ${minTravel} min from ${lodgingPt >= 0 ? "your stay" : "the rest of the plan"}`,
        });
        continue;
      }
    }
    if (st.includes("time") || st.includes("cap")) {
      const buckets = new Set(p.kinds.map(bucketOf));
      const swap = scheduled
        .filter(
          ({ s, day }) =>
            s.fixed === null &&
            s.p.dayLock === null &&
            s.p.order > p.order &&
            buckets.has(s.bucket) &&
            statuses.get(day) !== "closed",
        )
        .sort((a, b) => b.s.p.order - a.s.p.order)[0];
      didntFit.push(
        swap
          ? {
              order: p.order,
              itemId: id,
              reason: "day_full",
              suggestion: "swap",
              detail: `Days are full; swap with ${swap.s.p.item.title}`,
              swapWithItemId: swap.s.p.item.id,
            }
          : {
              order: p.order,
              itemId: id,
              reason: "day_full",
              suggestion: "add_day",
              detail: "Every day is full at this pace",
            },
      );
      continue;
    }
    didntFit.push({
      order: p.order,
      itemId: id,
      reason: "no_slot",
      suggestion: "drop",
      detail: "Its hours don't line up with free time on any day",
    });
  }

  // ---- Output ---------------------------------------------------------------------
  const outDays: PlanDay[] = days.map((day) => {
    const f = day.f;
    const entries = day.tracks
      .flatMap((tr, ti) => tr.slots.map((s, si) => ({ s, ti, first: si === 0, last: si === tr.slots.length - 1 })))
      .sort((a, b) => a.s.start - b.s.start || a.ti - b.ti || byId(a.s.p.item, b.s.p.item));
    const items: PlannedItem[] = entries.map(({ s, ti, first, last }) => {
      const p = s.p;
      const codes: ReasonCode[] = [];
      if (p.pin?.kind === "locked" || p.dayLock !== null) codes.push({ code: "locked" });
      if (p.pin?.kind === "reservation") codes.push({ code: "reservation", minute: p.pin.start });
      if (p.suggested) codes.push({ code: "suggested" });
      if (ti > 0 && p.attendees) codes.push({ code: "parallel", attendeeCount: p.attendees.length });
      if (f.kind === "arrival" || f.kind === "arrival_departure")
        codes.push({ code: "arrival_day", dinnerOnly: f.dinnerOnly });
      if (f.kind === "departure") codes.push({ code: "departure_day" });
      const iv = s.intervals?.find((x) => s.start >= x.open && s.start < x.close);
      if (iv && iv.close <= CLOSES_EARLY_MINUTE) codes.push({ code: "closes_at", minute: iv.close });
      const nearLodging =
        lodgingPt >= 0 && p.pt >= 0 && cache.get(lodgingPt, p.pt).minutes <= NEAR_LODGING_MINUTES;
      const meal = s.kind;
      if (s.fixed === null) {
        if (meal === "breakfast" || meal === "brunch" || meal === "lunch" || meal === "dinner")
          codes.push({ code: "meal_window", meal, nearLodging });
        if (s.kind === "morning" || s.kind === "afternoon" || s.kind === "evening" || s.kind === "night")
          codes.push({ code: "time_of_day", timeOfDay: s.kind });
        if (s.kind === "drinks") codes.push({ code: "time_of_day", timeOfDay: "evening" });
      }
      if (p.pt >= 0) {
        const here = cache.point(p.pt);
        const nearby = entries.filter(
          (e) => e.s !== s && e.s.p.pt >= 0 && haversineKm(here, cache.point(e.s.p.pt)) <= NEARBY_KM,
        ).length;
        if (nearby > 0) codes.push({ code: "clustered", nearbyCount: nearby });
        if (nearLodging && s.mealSlot === null && (first || last)) codes.push({ code: "near_lodging" });
      } else {
        codes.push({ code: "no_location" });
      }
      if (p.item.priority.must && !p.suggested) codes.push({ code: "must_do" });
      const r = summarizeReasons(codes);
      return {
        itemId: p.item.id,
        startMinute: s.start,
        durationMinutes: s.duration,
        travelFromPrev: s.leg,
        reason: r.text,
        reasonCodes: r.codes,
        track: ti,
        pinned: p.pin !== null,
        suggested: p.suggested,
        attendees: p.attendees,
        hiddenFrom: p.hiddenFrom,
      };
    });
    for (const p of day.unscheduled.slice().sort((a, b) => a.order - b.order)) {
      const r = summarizeReasons([{ code: "locked" }, { code: "time_unassigned" }]);
      items.push({
        itemId: p.item.id,
        startMinute: null,
        durationMinutes: durationFor(p.item, p.kinds[0] ?? "day"),
        travelFromPrev: null,
        reason: r.text,
        reasonCodes: r.codes,
        track: 0,
        pinned: false,
        suggested: false,
        attendees: p.attendees,
        hiddenFrom: p.hiddenFrom,
      });
    }
    return {
      dayIndex: f.index,
      date: f.date,
      weekday: f.weekday,
      kind: f.kind,
      dinnerOnly: f.dinnerOnly,
      window: { start: f.hardStart, end: f.hardEnd },
      items,
      returnToLodging: day.tracks[0]!.slots.length > 0 ? day.tracks[0]!.ret : null,
    };
  });

  const plan: Plan = {
    pace,
    days: outDays,
    didntFit: didntFit
      .sort((a, b) => a.order - b.order || (a.itemId < b.itemId ? -1 : 1))
      .map(({ order: _order, ...rest }) => rest),
    warnings,
    basis: computePlanBasis(input),
  };
  plan.warnings = [
    ...warnings,
    ...checkPlan(plan, input.items, input.stop, {
      pace,
      travelTime: travelFn,
      memberIds: input.memberIds,
    }),
  ];
  return plan;
}

function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "every day of the trip";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
