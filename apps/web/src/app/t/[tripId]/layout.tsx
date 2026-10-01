import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { TripNav } from "@/components/trip/trip-nav";
import { routes } from "@/lib/routes";
import { loadTripView } from "@/server/context";

export default async function TripLayout({ children, params }: LayoutProps<"/t/[tripId]">) {
  const { tripId } = await params;
  const view = await loadTripView(tripId);
  if (!view) notFound();
  const base = routes.trip(tripId);
  const others = view.members.filter((m) => m.id !== view.me.memberId);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-16 pt-4">
      <header className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <Link href={routes.home} aria-label="All trips">
            <Brand className="text-base [&_svg]:size-6" />
          </Link>
          <Link href={`${base}/people`} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            {others.length === 0 ? "Invite someone" : `With ${others.map((m) => m.displayName).join(", ")}`}
          </Link>
        </div>
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">{view.trip.name}</h1>
        <TripNav
          items={[
            { href: base, label: "Ideas" },
            { href: `${base}/plan`, label: "Plan" },
            { href: `${base}/people`, label: view.trip.size === "solo" ? "Invite" : "People" },
          ]}
        />
      </header>
      {children}
    </div>
  );
}
