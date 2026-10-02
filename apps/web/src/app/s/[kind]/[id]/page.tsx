/**
 * Public share card (FR-80a/b). What a group chat unfurls and what anyone tapping it sees first.
 * Shows only the frozen, group-safe snapshot: no surprise items, money, votes, Pass counts,
 * non-voters or phone numbers (FR-80d/e), and never a live tally (FR-80b). "Tap to vote" goes
 * through /open, which routes members to the trip and others through the group link.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_NAME } from "@wandr/core/config";
import { shareCopy } from "@wandr/core/messaging";
import { getDb } from "@wandr/db";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { getPublicShare, shareRoutes } from "@/server/share";
import { isShareKind } from "@/server/share";

async function load(kind: string, id: string) {
  return getPublicShare(await getDb(), kind, id);
}

export async function generateMetadata({ params }: PageProps<"/s/[kind]/[id]">): Promise<Metadata> {
  const { kind, id } = await params;
  const share = await load(kind, id);
  const robots = { index: false, follow: false };
  if (!share) return { title: APP_NAME, robots };
  const c = shareCopy(share.snapshot);
  const title = share.snapshot.kind === "digest" ? c.headline : `${c.headline} · ${share.snapshot.tripName}`;
  return {
    title,
    description: `${c.detail ? `${c.detail} · ` : ""}${c.cta}`,
    robots,
    openGraph: { title, description: c.cta, siteName: APP_NAME, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}

function closesText(iso: string) {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export default async function SharePage({ params }: PageProps<"/s/[kind]/[id]">) {
  const { kind, id } = await params;
  if (!isShareKind(kind)) notFound();
  const share = await load(kind, id);
  if (!share) notFound();
  const s = share.snapshot;
  const c = shareCopy(s);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 pt-6">
      <Brand />
      <article className="mt-8 space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold text-muted-foreground">{s.tripName}</p>
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">{c.headline}</h1>
        {s.kind === "poll" ? (
          <>
            <ul className="space-y-2">
              {s.options.map((o) => (
                <li key={o} className="rounded-xl border px-4 py-3 font-medium">
                  {o}
                </li>
              ))}
            </ul>
            {s.closesAt ? <p className="text-sm text-muted-foreground">Voting closes {closesText(s.closesAt)}</p> : null}
          </>
        ) : s.kind === "digest" ? (
          <ul className="list-disc space-y-1 pl-5">
            {s.titles.map((t) => (
              <li key={t}>{t}</li>
            ))}
            {s.count > s.titles.length ? <li className="text-muted-foreground">and {s.count - s.titles.length} more</li> : null}
          </ul>
        ) : c.detail ? (
          <p className="text-muted-foreground">{c.detail}</p>
        ) : null}
        <Link href={shareRoutes.open(kind, id)} className={buttonVariants({ block: true, size: "lg" })} prefetch={false}>
          {c.cta}
        </Link>
      </article>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Shared {share.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Open the trip for the latest.
      </p>
    </main>
  );
}
