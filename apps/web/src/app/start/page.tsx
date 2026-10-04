import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { ClassicSetupForm, PasteStartForm } from "@/components/marketing/start-forms";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Plan a trip" };

/**
 * The handoff from the website into the app (D64): sign up with your number (D74), then one focused
 * setup step. Desktop leads with destinations and dates (FR-1b); phones lead with a link (FR-1a).
 */
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const sp = await searchParams;
  const raw = typeof sp.raw === "string" ? sp.raw.slice(0, 2000) : "";
  // D74: sign up with your number first, so every trip and save belongs to it from the start.
  await requireFullOrRedirect(raw ? `${routes.start}?raw=${encodeURIComponent(raw)}` : routes.start);
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8 lg:px-8 lg:pt-14">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-wider text-primary">New trip</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight tracking-tight lg:text-5xl">
            Where are you headed?
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Everything is optional. You can add cities, dates and friends later.
          </p>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <section aria-labelledby="by-place" className="order-2 rounded-3xl border bg-card p-6 shadow-sm lg:order-1">
            <h2 id="by-place" className="mb-4 font-display text-xl font-bold">
              Plan by destination
            </h2>
            <ClassicSetupForm cta="Create trip" />
          </section>
          <section aria-labelledby="by-link" className="order-1 space-y-3 lg:order-2 lg:pt-2">
            <h2 id="by-link" className="font-display text-xl font-bold">
              Or start from something you found
            </h2>
            <p className="text-sm text-muted-foreground">
              Paste a TikTok, Reel, Google Maps link or any page. We&apos;ll find the place and suggest a trip around it.
            </p>
            <PasteStartForm label="Link" defaultValue={raw} idPrefix="start-paste" />
          </section>
        </div>
      </main>
    </div>
  );
}
