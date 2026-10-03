"use client";

import { useSyncExternalStore } from "react";
import { clocksDiffer, timeZoneOffsetMinutes } from "@wandr/core";

/** The viewer's own zone on the client; null during the server pass. */
function useViewerZone(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

/**
 * Deadlines are absolute instants shown in the viewer's own time zone (S-14), e.g.
 * "closes Fri 9 PM EDT". FR-O16: when the trip's city (`city`) keeps a different clock, its
 * time follows as secondary text: "closes Fri 9 PM EDT (Sat 2 AM in Lisbon)". Rendered on the
 * client; the server pass may differ, hence suppressHydrationWarning.
 */
export function ClosesLabel({
  at,
  prefix = "closes",
  city = null,
}: {
  at: string;
  prefix?: string;
  city?: { name: string; timeZone: string } | null;
}) {
  const d = new Date(at);
  const viewerZone = useViewerZone();
  const text = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: d.getMinutes() ? "2-digit" : undefined,
    timeZoneName: "short",
  }).format(d);
  let cityText = "";
  if (city && viewerZone && clocksDiffer(viewerZone, city.timeZone, d)) {
    const there = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: (d.getUTCMinutes() + timeZoneOffsetMinutes(city.timeZone, d)) % 60 ? "2-digit" : undefined,
      timeZone: city.timeZone,
    }).format(d);
    cityText = ` (${there} in ${city.name || "the trip's city"})`;
  }
  return (
    <time dateTime={at} suppressHydrationWarning>
      {prefix} {text}
      {cityText ? <span className="text-muted-foreground">{cityText}</span> : null}
    </time>
  );
}
