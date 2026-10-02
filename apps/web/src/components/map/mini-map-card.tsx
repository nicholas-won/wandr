/**
 * Ideas-feed desktop rail: a small map of the trip's resolved ideas linking to the full map
 * (FR-122). Server component; uses the same RLS-scoped getMapView as /map, so surprise items are
 * already filtered for hidden members (FR-91). Hidden until at least one idea has a pin (§2a).
 */
import Link from "next/link";
import { Map as MapIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { getMapView } from "@/server/planning";
import type { MapPin } from "./map-helpers";
import { TripMap } from "./trip-map";

export async function MiniMapCard({ tripId }: { tripId: string }) {
  const { db, claims } = await tripContext(tripId);
  const groups = await getMapView(db, claims, tripId);
  const pins: MapPin[] = (groups ?? []).flatMap((g) =>
    g.ideas
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, title: i.title, category: i.category, stopId: g.stopId ?? "unsorted" })),
  );
  if (pins.length === 0) return null;
  const href = `${routes.trip(tripId)}/map`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">On the map</CardTitle>
        <p className="text-sm text-muted-foreground">
          {pins.length} {pins.length === 1 ? "place" : "places"} pinned
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Link href={href} tabIndex={-1} aria-hidden className="block">
          <TripMap layout="mini" pins={pins} />
        </Link>
        <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <MapIcon className="size-4" aria-hidden /> Open the map
        </Link>
      </CardContent>
    </Card>
  );
}
