import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserPlus } from "lucide-react";
import { Brand } from "@/components/brand";
import { AvatarStack } from "@/components/ui/avatar";
import { visibleSections } from "@/components/trip/sections";
import { TripNav } from "@/components/trip/trip-nav";
import { StageChips } from "@/components/trip/stage-chips";
import { routes } from "@/lib/routes";
import { loadTripView } from "@/server/context";

/**
 * Responsive trip shell.
 * - Phones: capture-first. Compact header, horizontal tabs, single column.
 * - Desktop (lg+): a planning workspace. Sidebar with trip, people and sections; wide main area.
 */
export default async function TripLayout({ children, params }: LayoutProps<"/t/[tripId]">) {
  const { tripId } = await params;
  const view = await loadTripView(tripId);
  if (!view) notFound();
  const base = routes.trip(tripId);
  const others = view.members.filter((m) => m.id !== view.me.memberId);
  const solo = view.trip.size === "solo";
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
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 lg:grid lg:grid-cols-[260px_1fr] lg:gap-10 lg:px-8">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-6 py-6">
          <Link href={routes.home} aria-label="All trips" className="inline-flex items-center gap-2">
            <Brand className="text-lg [&_svg]:size-7" />
          </Link>
          <div className="space-y-2">
            <Link
              href={routes.home}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> All trips
            </Link>
            <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight">{view.trip.name}</h1>
            {people}
            <StageChips tripId={tripId} vertical />
          </div>
          <TripNav items={items} base={base} vertical />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col px-4 pb-16 pt-4 lg:px-0 lg:pt-8">
        {/* Phone header */}
        <header className="mb-4 space-y-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href={routes.home} aria-label="All trips">
              <Brand className="text-base [&_svg]:size-6" />
            </Link>
            {people}
          </div>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">{view.trip.name}</h1>
          <StageChips tripId={tripId} />
          <TripNav items={items} base={base} />
        </header>
        {children}
      </div>
    </div>
  );
}
