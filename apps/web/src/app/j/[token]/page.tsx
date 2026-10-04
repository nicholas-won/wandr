/**
 * Group link landing (FR-6, J-7). GET shows only the trip's name for outsiders and changes
 * nothing, so link-preview bots learn nothing else and consume nothing.
 */
import type { Metadata } from "next";
import { APP_NAME } from "@wandr/core/config";
import { getDb } from "@wandr/db";
import { Brand } from "@/components/brand";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { inspectGroupLink } from "@/server/membership";
import { JoinFlow } from "./join-flow";

// Generic preview: no trip name, people or counts (J-7, FR-80d/e).
export const metadata: Metadata = {
  title: "You're invited to a trip",
  description: `Tap to join on ${APP_NAME}.`,
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  openGraph: { title: "You're invited to a trip", description: `Tap to join on ${APP_NAME}.`, siteName: APP_NAME },
};

export default async function GroupLinkPage({ params }: PageProps<"/j/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const [link, session] = await Promise.all([inspectGroupLink(db, token), getSession()]);
  const signedIn = !!session.user && !session.user.provisional && !session.user.needsRecheck;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
      <Brand />
      <div className="flex flex-1 flex-col pt-10">
        {link ? (
          <JoinFlow
            token={token}
            tripName={link.tripName}
            signedIn={signedIn}
            turnstileSiteKey={env().NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
          />
        ) : (
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">This link isn&apos;t working</h1>
            <p className="mt-2 text-muted-foreground">
              It may have been turned off or replaced. Ask the person who shared it for a new one.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
