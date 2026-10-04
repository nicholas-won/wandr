/**
 * Personal link landing (FR-4, FR-5, N-4, N-8, M-12).
 *
 * GET never changes state: link-preview bots (iMessage, WhatsApp, email scanners) fetch this
 * page and must not consume or bind the link. The page shows nothing about the trip; the client
 * then POSTs (Server Action) to bind this device. The trip preview and "Accept invitation" only
 * appear after that POST, and joining takes a second, explicit POST (Q37).
 */
import type { Metadata } from "next";
import { APP_NAME } from "@wandr/core/config";
import { Brand } from "@/components/brand";
import { inspectPersonalLink } from "@/lib/auth/personal-link";
import { OpenLink } from "./open-link";

// Generic preview only: no trip name, people, or counts (N-4, FR-80d/e).
export const metadata: Metadata = {
  title: "You have a trip update",
  description: `Tap to open your trip on ${APP_NAME}.`,
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  openGraph: {
    title: "You have a trip update",
    description: `Tap to open your trip on ${APP_NAME}.`,
    siteName: APP_NAME,
    type: "website",
  },
  twitter: { card: "summary", title: "You have a trip update" },
};

export default async function PersonalLinkPage({ params }: PageProps<"/l/[token]">) {
  const { token } = await params;
  const status = await inspectPersonalLink(token);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
      <Brand />
      <div className="flex flex-1 flex-col justify-center">
        <OpenLink token={token} status={status} />
      </div>
    </main>
  );
}
