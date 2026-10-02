/**
 * Trip sections (nav). Slices register here instead of editing the layout.
 * `show` keeps features hidden until needed (§2a P2); it gets the caller's trip view.
 */
import type { TripView } from "@/server/trips";

export interface TripSection {
  /** Path segment after /t/[tripId]; "" for the ideas feed. */
  segment: string;
  label: string;
  /** Label for solo trips, if different. */
  soloLabel?: string;
  show?: (view: TripView) => boolean;
}

export const TRIP_SECTIONS: TripSection[] = [
  { segment: "", label: "Ideas" },
  { segment: "plan", label: "Plan" },
  { segment: "people", label: "People", soloLabel: "Invite" },
  // FR-80a group-chat sharing; no group features in solo trips (§6.10).
  { segment: "share", label: "Share", show: (v) => v.trip.size !== "solo" },
  // FR-6/7/10, FR-2: organizers only (P2: hidden until needed).
  { segment: "settings", label: "Settings", show: (v) => v.me.role !== "member" },
];

export function visibleSections(view: TripView): TripSection[] {
  return TRIP_SECTIONS.filter((s) => !s.show || s.show(view));
}
