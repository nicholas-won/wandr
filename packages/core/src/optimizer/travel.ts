import type { LatLng, TravelLeg, TravelPoint, TravelTimeFn } from "./types";

/**
 * Default travel estimator (used only when the caller injects no routing data):
 * - straight-line (haversine) distance between the two points;
 * - <= 1.2 km: walk at 4.8 km/h;
 * - otherwise: transit at an average 20 km/h plus 8 minutes of overhead
 *   (walking to the stop, waiting).
 * Minutes are rounded up. These are rough estimates; real routing should be
 * injected by the caller via `TravelTimeFn`.
 */
export const WALK_MAX_KM = 1.2;
export const WALK_KMH = 4.8;
export const TRANSIT_KMH = 20;
export const TRANSIT_OVERHEAD_MINUTES = 8;

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const defaultTravelTime: TravelTimeFn = (from, to) => {
  const km = haversineKm(from, to);
  if (km <= WALK_MAX_KM) return { minutes: Math.ceil((km / WALK_KMH) * 60), mode: "walk" };
  return {
    minutes: Math.ceil((km / TRANSIT_KMH) * 60 + TRANSIT_OVERHEAD_MINUTES),
    mode: "transit",
  };
};

const MODES = ["walk", "transit", "drive"] as const;

/** Memoizes an injected travel function over a fixed set of points (by index). */
export class TravelCache {
  private readonly minutes: Float64Array;
  private readonly modes: Uint8Array;
  private readonly n: number;

  constructor(
    private readonly points: readonly TravelPoint[],
    private readonly fn: TravelTimeFn,
  ) {
    this.n = points.length;
    this.minutes = new Float64Array(this.n * this.n).fill(-1);
    this.modes = new Uint8Array(this.n * this.n);
  }

  get(a: number, b: number): TravelLeg {
    if (a === b) return { minutes: 0, mode: "walk" };
    const k = a * this.n + b;
    let m = this.minutes[k]!;
    if (m < 0) {
      const leg = this.fn(this.points[a]!, this.points[b]!);
      m = Number.isFinite(leg.minutes) ? Math.max(0, Math.round(leg.minutes)) : 0;
      this.minutes[k] = m;
      const mi = MODES.indexOf(leg.mode);
      this.modes[k] = mi < 0 ? 1 : mi;
    }
    return { minutes: m, mode: MODES[this.modes[k]!]! };
  }

  point(i: number): TravelPoint {
    return this.points[i]!;
  }
}
