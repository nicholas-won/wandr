import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Sparkles } from "lucide-react";
import { clockValue, forecastSummary, optimizer, rainLikely, timeZoneLabel, travelDayNotes, weatherLabel } from "@wandr/core";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { getPlanContext, isPlanOutOfDate, planHints, previewPlan, stopLocation, unplacedItems } from "@/server/plan";
import { forecastFor } from "@/server/weather";
import { AddToPlan, ApplyPlan, ItemControls, TravelTimes } from "./plan-controls";
import { PutInCity } from "./put-in-city";
import { PlanMapRail, type PlanMapDay } from "@/components/map/plan-map-rail";

const MODE: Record<string, string> = { walk: "🚶", transit: "🚇", drive: "🚗" };

function dayLabel(dayIndex: number, date: string | null) {
  if (!date) return `Day ${dayIndex + 1}`;
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function PlanPage({ params, searchParams }: PageProps<"/t/[tripId]/plan">) {
  const { tripId } = await params;
  const sp = await searchParams;
  const stopId = typeof sp.stop === "string" ? sp.stop : null;
  const preview = sp.preview === "1";
  const { db, claims } = await tripContext(tripId);
  const ctx = await getPlanContext(db, claims, tripId, stopId);
  if (!ctx) notFound();
  const base = `${routes.trip(tripId)}/plan${stopId ? `?stop=${stopId}` : ""}`;
  const title = (id: string) => ctx.titles.get(id) ?? "Planned item";
  // FR-O16: plan times are the Stop's local time; say which zone that is.
  const firstDate = typeof ctx.input.stop.days === "number" ? null : (ctx.input.stop.days[0] ?? null);
  const zone = ctx.stop.timezone ? timeZoneLabel(ctx.stop.timezone, firstDate ? new Date(`${firstDate}T12:00:00Z`) : new Date()) : null;
  const zoneLine = zone ? (
    <p className="text-xs text-muted-foreground" data-testid="plan-zone">
      🕒 Times are {ctx.stop.name ? `${ctx.stop.name} time` : "local time"} ({zone})
    </p>
  ) : null;
  // FR-O15: shortened arrival/departure days.
  const travelNotes = travelDayNotes(ctx.input.stop, ctx.input.pace);
  const travelTimes = ctx.canApply ? (
    <TravelTimes
      tripId={tripId}
      stopId={ctx.stop.id}
      arrive={clockValue(ctx.stop.arrivalMinute)}
      leave={clockValue(ctx.stop.departureMinute)}
      zoneLabel={zone}
    />
  ) : null;

  // Founder bug: city tabs, and decided ideas without a city, so nothing decided goes missing.
  const header = (
    <>
      <CityTabs tripId={tripId} stops={ctx.stops} current={ctx.stop.id} />
      <UnsortedDecided tripId={tripId} ideas={ctx.unsortedDecided} stops={ctx.stops} />
    </>
  );

  if (ctx.input.items.length === 0 && ctx.current.items.length === 0) {
    return (
      <div className="space-y-4">
      {header}
      <main className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        <CalendarDays className="mx-auto mb-2 size-8" aria-hidden />
        <p className="font-display text-xl font-bold text-foreground">Nothing planned yet</p>
        <p className="mt-1 text-sm">
          Mark ideas <strong>✓ Decided</strong> in {ctx.stop.name || "this trip"} and they show up here. Then{" "}
          {ctx.canApply ? "you can" : "an organizer can"} put them on days, or tap &ldquo;Arrange my days&rdquo;.
        </p>
      </main>
      </div>
    );
  }

  if (preview && ctx.canApply) {
    const plan = previewPlan(ctx);
    return (
      <div className={RAIL_GRID}>
      <main className="min-w-0 space-y-4">
        {zoneLine}
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          Here&apos;s a suggested order. Nothing changes until you apply it. Locked items stay put.
        </p>
        <PlanDays plan={plan} title={title} />
        {plan.didntFit.length ? (
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold">Didn&apos;t fit</h2>
            <ul className="space-y-1 text-sm">
              {plan.didntFit.map((d) => (
                <li key={d.itemId}>
                  <span className="font-semibold">{title(d.itemId)}</span> — {d.detail}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <ApplyPlan tripId={tripId} stopId={stopId} backHref={base} />
      </main>
      <PlanMapRail days={mapDays(ctx, plan.days.map((d) => ({ label: dayLabel(d.dayIndex, d.date), ids: d.items.map((it) => it.itemId) })))} />
      </div>
    );
  }

  const hints = planHints(ctx);
  const outOfDate = await isPlanOutOfDate(db, claims, tripId, ctx);
  const dayCount = Math.max(
    typeof ctx.input.stop.days === "number" ? ctx.input.stop.days : ctx.input.stop.days.length,
    ...ctx.current.items.map((i) => i.dayIndex + 1),
  );
  const days = Array.from({ length: dayCount }, (_, d) =>
    ctx.current.items
      .filter((i) => i.dayIndex === d)
      .sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999)),
  );
  const dates = typeof ctx.input.stop.days === "number" ? [] : ctx.input.stop.days;
  const forecast = await forecastFor(stopLocation(ctx), dates);
  const unplaced = unplacedItems(ctx);
  const hasLodging = !!ctx.input.stop.lodging;
  const dayLabels = Array.from({ length: dayCount }, (_, d) => dayLabel(d, dates[d] ?? null));
  // FR-O11: rain likely on a day with outdoor plans.
  const OUTDOOR = new Set(["sight", "activity"]);
  const kind = new Map(ctx.input.items.map((i) => [i.id, i.category]));
  const rainHints = days.flatMap((items, d) => {
    const f = dates[d] ? forecast.get(dates[d]!) : undefined;
    if (!f) return [];
    const outdoor = items.some((it) => it.ideaId && OUTDOOR.has(kind.get(it.ideaId) ?? ""));
    return f && rainLikely(f) && outdoor ? [`Rain likely on ${dayLabels[d]}: consider swapping in something indoors.`] : [];
  });

  return (
    <div className={RAIL_GRID}>
    <main className="min-w-0 space-y-4">
      {zoneLine}
      {outOfDate ? (
        <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          Plan may be out of date: ideas or attendance changed since it was arranged.
        </p>
      ) : null}
      {ctx.canApply ? (
        <Link href={`${base}${base.includes("?") ? "&" : "?"}preview=1`} className={buttonVariants({ block: true })}>
          <Sparkles aria-hidden /> {ctx.current.items.length ? "Re-arrange my days" : "Arrange my days"}
        </Link>
      ) : null}
      {travelTimes}
      {hints.length || rainHints.length ? (
        <ul className="space-y-1 rounded-xl border bg-card p-3 text-sm" aria-label="Heads up">
          {hints.map((h, i) => (
            <li key={i}>⚠️ {h.detail}</li>
          ))}
          {rainHints.map((h, i) => (
            <li key={`rain-${i}`}>🌧️ {h}</li>
          ))}
        </ul>
      ) : null}
      {unplaced.length && ctx.canApply ? (
        <section aria-labelledby="unplaced-h" className="space-y-2 rounded-xl border border-dashed p-4">
          <h2 id="unplaced-h" className="font-display text-lg font-bold">
            Not on the plan yet
          </h2>
          <p className="text-sm text-muted-foreground">
            Put any of these on a day yourself, or let &ldquo;Arrange my days&rdquo; place them.
          </p>
          <ul className="divide-y">
            {unplaced.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-semibold">
                  {i.title}
                  {i.status === "suggested" ? <Badge className="ml-2" variant="accent">must-do</Badge> : null}
                </span>
                <AddToPlan tripId={tripId} stopId={ctx.stop.id} ideaId={i.id} dayLabels={dayLabels} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {(
        days.map((items, d) => (
          <section key={d} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{dayLabel(d, dates[d] ?? null)}</h2>
              {dates[d] && forecast.get(dates[d]!) ? (
                <span className="text-sm text-muted-foreground" title={weatherLabel(forecast.get(dates[d]!)!.code).label}>
                  {forecastSummary(forecast.get(dates[d]!)!)}
                </span>
              ) : null}
            </div>
            {travelNotes.get(d) ? (
              <p className="text-xs font-semibold text-secondary-foreground" data-testid="travel-day-note">{travelNotes.get(d)}</p>
            ) : null}
            {hasLodging && d === 0 ? <p className="text-xs font-semibold text-secondary-foreground">🛏️ Check in from 3pm</p> : null}
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Free day</p>
            ) : (
              <ol className="space-y-2">
                {items.map((it) => (
                  <li key={it.id} className="rounded-xl border bg-card p-3">
                    {it.travelMinutes ? (
                      <p className="mb-1 text-xs text-muted-foreground">
                        {MODE[it.travelMode ?? ""] ?? ""} {it.travelMinutes} min
                      </p>
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {it.startMinute != null ? (
                            <span className="mr-2 text-muted-foreground">{optimizer.formatMinute(it.startMinute)}</span>
                          ) : null}
                          {it.ideaId ? title(it.ideaId) : "Item"}
                        </p>
                        {it.reason ? <p className="text-xs text-muted-foreground">{it.reason}</p> : null}
                      </div>
                      {ctx.canApply ? (
                        <ItemControls tripId={tripId} planItemId={it.id} locked={it.locked} dayIndex={it.dayIndex} dayCount={dayCount} />
                      ) : it.locked ? (
                        <Badge>Locked</Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {hasLodging && d === dayCount - 1 && dayCount > 1 ? (
              <p className="text-xs font-semibold text-secondary-foreground">🧳 Check out by 11am</p>
            ) : null}
          </section>
        ))
      )}
    </main>
    <PlanMapRail
      days={mapDays(
        ctx,
        days.map((items, d) => ({ label: dayLabel(d, dates[d] ?? null), ids: items.flatMap((it) => (it.ideaId ? [it.ideaId] : [])) })),
      )}
    />
    </div>
  );
}

/** Desktop: days on the left, a sticky day map on the right (FR-O7). Phone: one column, map first and collapsed. */
const RAIL_GRID = "flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start lg:gap-6";

/** Each day's planned places, in order, for the map rail. Only items this page already shows. */
function mapDays(ctx: { input: optimizer.ArrangeInput; titles: Map<string, string> }, days: { label: string; ids: string[] }[]): PlanMapDay[] {
  const byId = new Map(ctx.input.items.map((i) => [i.id, i]));
  return days.map((d, n) => ({
    key: String(n),
    label: d.label,
    pins: d.ids.flatMap((id) => {
      const i = byId.get(id);
      return i ? [{ id, lat: i.lat ?? null, lng: i.lng ?? null, title: ctx.titles.get(id) ?? i.title ?? "Planned item", category: i.category }] : [];
    }),
  }));
}

function PlanDays({ plan, title }: { plan: optimizer.Plan; title: (id: string) => string }) {
  return (
    <>
      {plan.days.map((d) => (
        <section key={d.dayIndex} className="space-y-2">
          <h2 className="font-display text-lg font-bold">
            {dayLabel(d.dayIndex, d.date)}
            {d.kind === "arrival" || d.kind === "arrival_departure" ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">arrival{d.dinnerOnly ? " · dinner only" : ""}</span>
            ) : null}
            {d.kind === "departure" || d.kind === "arrival_departure" ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">departure</span>
            ) : null}
          </h2>
          {d.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Free day</p>
          ) : (
            <ol className="space-y-2">
              {d.items.map((it) => (
                <li key={it.itemId} className="rounded-xl border bg-card p-3">
                  {it.travelFromPrev ? (
                    <p className="mb-1 text-xs text-muted-foreground">
                      {MODE[it.travelFromPrev.mode]} {it.travelFromPrev.minutes} min
                    </p>
                  ) : null}
                  <p className="font-semibold">
                    {it.startMinute != null ? (
                      <span className="mr-2 text-muted-foreground">{optimizer.formatMinute(it.startMinute)}</span>
                    ) : null}
                    {title(it.itemId)}
                    {it.suggested ? <Badge className="ml-2" variant="accent">suggested</Badge> : null}
                    {it.pinned ? <Badge className="ml-2">locked</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{it.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </>
  );
}

function CityTabs({ tripId, stops, current }: { tripId: string; stops: { id: string; name: string }[]; current: string }) {
  if (stops.length < 2) return null;
  return (
    <nav aria-label="City" className="-mx-1 flex gap-1.5 overflow-x-auto pb-1">
      {stops.map((s, i) => (
        <Link
          key={s.id}
          href={`${routes.trip(tripId)}/plan?stop=${s.id}`}
          aria-current={s.id === current ? "page" : undefined}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
            s.id === current ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          {i + 1}. {s.name}
        </Link>
      ))}
    </nav>
  );
}

function UnsortedDecided({
  tripId,
  ideas,
  stops,
}: {
  tripId: string;
  ideas: { id: string; title: string }[];
  stops: { id: string; name: string }[];
}) {
  if (ideas.length === 0) return null;
  return (
    <section aria-labelledby="unsorted-decided-h" className="space-y-2 rounded-xl border border-primary/40 bg-accent/40 p-4">
      <h2 id="unsorted-decided-h" className="font-display text-base font-bold">
        Decided, but which city?
      </h2>
      <p className="text-sm text-muted-foreground">
        {ideas.length === 1 ? "This idea isn't" : "These ideas aren't"} in a city yet, so {ideas.length === 1 ? "it can't" : "they can't"} go on a
        day. Pick where {ideas.length === 1 ? "it belongs" : "each belongs"}.
      </p>
      <ul className="divide-y">
        {ideas.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="font-semibold">{i.title}</span>
            <PutInCity tripId={tripId} ideaId={i.id} stops={stops} />
          </li>
        ))}
      </ul>
    </section>
  );
}
