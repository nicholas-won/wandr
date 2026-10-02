import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Sparkles } from "lucide-react";
import { optimizer } from "@wandr/core";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { getPlanContext, isPlanOutOfDate, planHints, previewPlan } from "@/server/plan";
import { ApplyPlan, ItemControls } from "./plan-controls";
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

  if (ctx.input.items.length === 0 && ctx.current.items.length === 0) {
    return (
      <main className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        <CalendarDays className="mx-auto mb-2 size-8" aria-hidden />
        <p className="font-display text-xl font-bold text-foreground">Nothing planned yet</p>
        <p className="mt-1 text-sm">
          Once the group decides on ideas, {ctx.canApply ? "you can" : "an organizer can"} arrange them into days here.
        </p>
      </main>
    );
  }

  if (preview && ctx.canApply) {
    const plan = previewPlan(ctx);
    return (
      <div className={RAIL_GRID}>
      <main className="min-w-0 space-y-4">
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

  return (
    <div className={RAIL_GRID}>
    <main className="min-w-0 space-y-4">
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
      {hints.length ? (
        <ul className="space-y-1 rounded-xl border bg-card p-3 text-sm" aria-label="Heads up">
          {hints.map((h, i) => (
            <li key={i}>⚠️ {h.detail}</li>
          ))}
        </ul>
      ) : null}
      {ctx.current.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ctx.input.items.length} ideas ready to arrange.</p>
      ) : (
        days.map((items, d) => (
          <section key={d} className="space-y-2">
            <h2 className="font-display text-lg font-bold">{dayLabel(d, dates[d] ?? null)}</h2>
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
            {d.dinnerOnly ? <span className="ml-2 text-sm font-normal text-muted-foreground">arrival · dinner only</span> : null}
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
