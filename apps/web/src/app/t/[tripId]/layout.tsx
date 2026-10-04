import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { PhonePrompt } from "@/components/trip/phone-prompt";
import { AppHeader } from "@/components/app/app-header";
import { AvatarStack } from "@/components/ui/avatar";
import { visibleSections } from "@/components/trip/sections";
import { TripNav } from "@/components/trip/trip-nav";
import { StageChips } from "@/components/trip/stage-chips";
import { tripSummary } from "@wandr/core";
import { routes } from "@/lib/routes";
import { loadTripView, phonePromptVisible, tripContext } from "@/server/context";
import { queueStopGeocode } from "@/server/geocode";

/**
 * Responsive trip shell.
 * - Phones: capture-first. Compact header, horizontal tabs, single column.
 * - Desktop (lg+): a planning workspace. Sidebar with trip, people and sections; wide main area.
 */
export default async function TripLayout({ children, params }: LayoutProps<"/t/[tripId]">) {
  const { tripId } = await params;
  const view = await loadTripView(tripId);
  if (!view) notFound();
  // Lazy backfill (FR-S6 / FR-O16): Stops without coordinates are geocoded in the background.
  if (view.stopsNeedGeocode) await queueStopGeocode(tripId);
  const base = routes.trip(tripId);
  // Founder feedback: dates and order should be readable at a glance.
  const summary = tripSummary(view.stops);
  const summaryLine = summary ? (
    <Link href={`${base}/stops`} className="block text-sm font-medium text-muted-foreground hover:text-foreground">
      {summary}
    </Link>
  ) : null;
  // Q1: personal-link guests get a gentle "confirm your number" nudge after a few votes.
  const { claims } = await tripContext(tripId);
  const showPhonePrompt = await phonePromptVisible(
    claims.sub ? "full" : "link",
    view.ideas.filter((c) => c.myVote).length,
  );
  const others = view.members.filter((m) => m.id !== view.me.memberId);
  const solo = view.trip.size === "solo";
  const pendingRequests = claims.sub && view.me.role !== "member" ? view.invited.filter((m) => m.status === "pending").length : 0;
  const items = visibleSections(view).map((s) => ({
    href: s.segment ? `${base}/${s.segment}` : base,
    label: solo && s.soloLabel ? s.soloLabel : s.label,
  }));
  const people = (
    <Link
      href={`${base}/people`}
      className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      {others.length === 0 ? (
        <>
          <UserPlus className="size-4" aria-hidden /> Invite someone
        </>
      ) : (
        <>
          <AvatarStack names={view.members.map((m) => m.displayName)} />
          <span className="truncate">With {others.map((m) => m.displayName).join(", ")}</span>
        </>
      )}
      {/* D65: join requests are in-app only (no texts); organizers see a count here. RLS returns
          pending rows to organizers only. */}
      {pendingRequests > 0 ? (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
          {pendingRequests} {pendingRequests === 1 ? "request" : "requests"}
        </span>
      ) : null}
    </Link>
  );

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto w-full max-w-7xl flex-1 lg:grid lg:grid-cols-[260px_1fr] lg:gap-10 lg:px-8">
        {/* Desktop sidebar: trip context and sections (the app header handles brand and account) */}
        <aside className="hidden lg:block">
          <div className="sticky top-0 flex max-h-dvh flex-col gap-6 overflow-y-auto py-8">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Trip</p>
              <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight">{view.trip.name}</h1>
              {summaryLine}
              {people}
              <StageChips tripId={tripId} vertical />
            </div>
            <TripNav items={items} base={base} vertical />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col px-4 pb-16 pt-4 lg:px-0 lg:pt-8">
          {/* Phone header */}
          <header className="mb-4 space-y-3 lg:hidden">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">{view.trip.name}</h1>
            </div>
            {summaryLine}
            {people}
            <StageChips tripId={tripId} />
            <TripNav items={items} base={base} />
          </header>
          {showPhonePrompt ? <PhonePrompt signinHref={routes.signin(base)} /> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
