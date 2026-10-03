/**
 * Where to go for a notification tap or a share (pure helpers; FR-21, FR-87).
 */
import type { TripSummary } from "@wandr/api-contract";

export type AppHref = "/" | `/trip/${string}` | `/trip/${string}?idea=${string}` | "/library";

/**
 * Notification payloads (the server's push sender decides the exact shape; we accept the obvious
 * ones): { tripId, ideaId? }, { url: "wandr://trip/…" | "https://…/t/…" }, or { screen: "library" }.
 */
export function hrefForNotification(data: unknown): AppHref | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length < 200 ? v : null);
  const tripId = str(d.tripId);
  const ideaId = str(d.ideaId);
  if (tripId) {
    const t = encodeURIComponent(tripId);
    return ideaId ? `/trip/${t}?idea=${encodeURIComponent(ideaId)}` : `/trip/${t}`;
  }
  if (d.screen === "library") return "/library";
  const url = str(d.url);
  if (url) {
    const m = /(?:^wandr:\/\/|\/)trip\/([A-Za-z0-9_-]+)/.exec(url);
    if (m?.[1]) return `/trip/${m[1]}`;
  }
  return null;
}

/**
 * FR-21 default target: the most recently active trip if there is one, otherwise the library.
 * `lastTripId` is the trip this phone last opened or added to; otherwise the API's first trip
 * (assumed most recent first; see README open questions).
 */
export function defaultShareTarget(
  trips: readonly TripSummary[],
  lastTripId: string | null,
): { type: "trip"; tripId: string } | { type: "library" } {
  const remembered = lastTripId ? trips.find((t) => t.id === lastTripId) : undefined;
  const pick = remembered ?? trips[0];
  return pick ? { type: "trip", tripId: pick.id } : { type: "library" };
}
