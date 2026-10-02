import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddStopForm, CityIdeaRow, NewCityPrompt } from "@/components/trip/planning/new-city";
import { StageManager } from "@/components/trip/planning/stage-manager";
import { StopCard } from "@/components/trip/planning/stop-card";
import { routes } from "@/lib/routes";
import { loadPlanning } from "@/server/planning-context";

/**
 * Stops, attendance and planning stages (§6.0 FR-S1–S10, FR-120).
 * One primary action per Stop for members: "I'm going / Not going" (P3, P8).
 */
export default async function StopsPage({ params }: PageProps<"/t/[tripId]/stops">) {
  const { tripId } = await params;
  const v = await loadPlanning(tripId);
  if (!v) notFound();
  const solo = v.size === "solo";
  const needsFirstName = v.stops.length === 1 && !v.stops[0]!.name;
  const stopRefs = v.stops.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }));
  const warnings = new Map(
    v.dateWarnings.map((w) => [
      w.stopId,
      w.kind === "overlap"
        ? `Overlaps the previous Stop by ${w.days} ${w.days === 1 ? "day" : "days"}`
        : `${w.days} ${w.days === 1 ? "night" : "nights"} between this and the previous Stop`,
    ]),
  );
  // FR-S7 attendance matters once there's someone else and more than one place (or dates).
  const canMark = v.me.verified && !solo;

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:space-y-0">
      <main className="space-y-4">
        {v.newCities.map((c) => (
          <NewCityPrompt key={c.city} tripId={tripId} city={c.city} count={c.ideaIds.length} stops={stopRefs} />
        ))}

        <section aria-labelledby="stops-h" className="space-y-3">
          <h2 id="stops-h" className="font-display text-xl font-bold">
            {v.showStops ? "Stops" : "Where you're going"}
          </h2>
          {!v.me.verified && !solo ? (
            <p className="text-sm text-muted-foreground">
              <Link href={routes.signin(`${routes.trip(tripId)}/stops`)} className="font-semibold text-primary underline-offset-2 hover:underline">
                Confirm your number
              </Link>{" "}
              to mark which Stops you&apos;ll be at.
            </p>
          ) : null}
          <ul className="grid gap-3 xl:grid-cols-2">
            {v.stops.map((s, i) => (
              <li key={s.id}>
                <StopCard
                  tripId={tripId}
                  stop={s}
                  meId={v.me.memberId}
                  isOrganizer={v.me.isOrganizer}
                  canMarkAttendance={canMark && (v.showStops || !!s.startDate)}
                  isFirst={i === 0}
                  isLast={i === v.stops.length - 1}
                  showOrder={v.showStops}
                  warning={warnings.get(s.id) ?? null}
                />
              </li>
            ))}
          </ul>
          {v.unsortedCount ? (
            <p className="text-sm text-muted-foreground">
              {v.unsortedCount} {v.unsortedCount === 1 ? "idea isn't" : "ideas aren't"} in a Stop yet.{" "}
              <Link href={`${routes.trip(tripId)}?stop=unsorted`} className="font-semibold text-primary underline-offset-2 hover:underline">
                See Unsorted
              </Link>
            </p>
          ) : null}
          {v.me.isOrganizer ? <AddStopForm tripId={tripId} needsFirstName={needsFirstName} /> : null}
        </section>

        {v.cityIdeas.length ? (
          <section aria-labelledby="cities-h" className="space-y-2">
            <h2 id="cities-h" className="font-display text-lg font-bold">
              Cities people suggested
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {v.cityIdeas.map((c) => (
                <CityIdeaRow key={c.id} tripId={tripId} idea={c} isOrganizer={v.me.isOrganizer} needsFirstName={needsFirstName} />
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Vote on them in the Ideas feed; organizers add the winners as Stops.</p>
          </section>
        ) : null}
      </main>

      <aside>
        <Card className="lg:sticky lg:top-8">
          <CardHeader>
            <CardTitle className="text-base">Planning stages</CardTitle>
            <p className="text-sm text-muted-foreground">
              {solo
                ? "Tick off what's decided."
                : v.me.isOrganizer
                  ? "Collect ideas, open voting, then lock each one in. Skip what you don't need."
                  : "Organizers move these along as the group decides."}
            </p>
          </CardHeader>
          <CardContent>
            <StageManager
              tripId={tripId}
              stages={v.stages.filter((s) => s.kind !== "getting_around" || v.stops.length > 1)}
              solo={solo}
              isOrganizer={v.me.isOrganizer}
            />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
