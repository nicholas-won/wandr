/**
 * Shared-board personal link landing (FR-L14; same rules as FR-5 / N-4).
 * GET never changes state and shows nothing about the board, so link-preview bots can't bind
 * it or leak its name; the client then POSTs to bind this device and open the board.
 */
import type { Metadata } from "next";
import { APP_NAME } from "@wandr/core/config";
import { Brand } from "@/components/brand";
import { inspectBoardLink } from "@/lib/auth/board-link";
import { OpenBoardLink } from "./open-board-link";

export const metadata: Metadata = {
  title: "A board was shared with you",
  description: `Tap to open it on ${APP_NAME}.`,
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  openGraph: { title: "A board was shared with you", description: `Tap to open it on ${APP_NAME}.`, siteName: APP_NAME, type: "website" },
  twitter: { card: "summary", title: "A board was shared with you" },
};

export default async function BoardLinkPage({ params }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const status = await inspectBoardLink(token);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
      <Brand />
      <div className="flex flex-1 flex-col justify-center">
        <OpenBoardLink token={token} status={status} />
      </div>
    </main>
  );
}
