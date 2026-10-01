/**
 * Stops: multi-city structure, filing ideas, attendance (§5, §6.0 FR-S3, FR-S6, FR-S7, P2,
 * S-1, S-2, S-3, S-12).
 */
import type { MemberId, MemberStatus } from "./domain";

export interface StopLike {
  id: string;
  /** "" for the hidden default Stop of a single-city trip. */
  name: string;
  isDefault: boolean;
  /** Order in the route. */
  position: number;
  lat: number | null;
  lng: number | null;
}

/**
 * P2: "Stops appear only when a second city shows up." A single-city trip has one (hidden) Stop,
 * so the Stops UI shows once there are 2 or more.
 */
export function shouldShowStops(stops: readonly StopLike[]): boolean {
  return stops.length >= 2;
}

/**
 * §5: "A single-city trip has one hidden Stop." Returns the Stop new ideas go to by default:
 * the only Stop if there is exactly one, else the `isDefault` Stop if it exists, else null
 * (multi-Stop trips file by location, see fileIdea).
 */
export function defaultStop<T extends StopLike>(stops: readonly T[]): T | null {
  if (stops.length === 1) return stops[0]!;
  return stops.find((s) => s.isDefault) ?? null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Default filing radius. Configurable per call; S-2 (day trips) may want ~90 min by road. */
export const DEFAULT_STOP_RADIUS_KM = 60;

export type FilingResult =
  | {
      kind: "stop";
      stopId: string;
      /** Null when filed without coordinates (single-Stop trip). */
      distanceKm: number | null;
      /** Other Stops also within the radius → "Also near Porto, move?" chip (S-1). */
      alsoNearStopIds: string[];
    }
  | {
      kind: "unsorted";
      /** FR-S6: the place is outside every Stop → ask "New city: Porto, add as a Stop?". */
      suggestNewCity: boolean;
    };

/**
 * FR-S3 / FR-S6: choose the Stop for an idea.
 * - Idea has coordinates and some Stops have coordinates: nearest Stop within `radiusKm`
 *   (ties → earlier route position, S-3), else Unsorted with a "new city?" suggestion.
 * - Idea has no coordinates (non-place idea, still processing): the default Stop if there is one
 *   (single-city trip), else Unsorted (no suggestion).
 * - Idea has coordinates but no Stop has any (zero-setup trip with a hidden Stop): default Stop.
 */
export function fileIdea(
  idea: LatLng | null,
  stops: readonly StopLike[],
  opts: { radiusKm?: number } = {},
): FilingResult {
  const radius = opts.radiusKm ?? DEFAULT_STOP_RADIUS_KM;
  const fallback = defaultStop(stops);
  const located = stops.filter((s): s is StopLike & LatLng => s.lat != null && s.lng != null);

  if (!idea || located.length === 0) {
    return fallback
      ? { kind: "stop", stopId: fallback.id, distanceKm: null, alsoNearStopIds: [] }
      : { kind: "unsorted", suggestNewCity: false };
  }

  const within = located
    .map((s) => ({ s, d: distanceKm(idea, s) }))
    .filter((x) => x.d <= radius)
    .sort((a, b) => a.d - b.d || a.s.position - b.s.position);

  const best = within[0];
  if (!best) return { kind: "unsorted", suggestNewCity: true };
  return {
    kind: "stop",
    stopId: best.s.id,
    distanceKm: best.d,
    alsoNearStopIds: within.slice(1).map((x) => x.s.id),
  };
}

// ---------------------------------------------------------------------------
// Attendance (FR-S7, S-12)
// ---------------------------------------------------------------------------

export interface AttendanceRow {
  stopId: string;
  memberId: MemberId;
  attending: boolean;
}

/** S-12: attending unless explicitly marked not attending. */
export function isAttending(memberId: MemberId, stopId: string, rows: readonly AttendanceRow[]): boolean {
  const row = rows.find((r) => r.memberId === memberId && r.stopId === stopId);
  return row ? row.attending : true;
}

/**
 * FR-S7 / FR-47: active members attending a Stop (eligible for its polls, nudges and default
 * splits), excluding anyone the item is hidden from (FR-91). Input order is preserved.
 */
export function attendingMemberIds(
  members: readonly { memberId: MemberId; status: MemberStatus }[],
  stopId: string,
  rows: readonly AttendanceRow[],
  hiddenFrom: readonly MemberId[] = [],
): MemberId[] {
  const hidden = new Set(hiddenFrom);
  return members
    .filter((m) => m.status === "active" && !hidden.has(m.memberId) && isAttending(m.memberId, stopId, rows))
    .map((m) => m.memberId);
}
