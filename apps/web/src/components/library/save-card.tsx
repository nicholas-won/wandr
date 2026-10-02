import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATEGORY_EMOJI } from "./format";

export interface SaveCardData {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  categoryOverride?: string | null;
  extraction: string;
  permanentlyClosed: boolean;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  creatorHandle: string | null;
  priority?: "must" | "down" | "pass" | null;
  addedBy?: string | null;
}

const PRIORITY: Record<string, { label: string; variant: "must" | "down" | "pass" }> = {
  must: { label: "Must-do", variant: "must" },
  down: { label: "Maybe", variant: "down" },
  pass: { label: "Skip", variant: "pass" },
};

/** A saved idea in a list. `href` makes the title a link (the owner's own saves). */
export function SaveCard({ save, href, className }: { save: SaveCardData; href?: string; className?: string }) {
  const pending = save.extraction === "processing" || save.extraction === "queued";
  if (pending) {
    return (
      <Card className={cn("p-4", className)} aria-busy>
        <div className="flex gap-3">
          <Skeleton className="size-16 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Finding the place…</p>
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </Card>
    );
  }
  const category = save.categoryOverride ?? save.category;
  const title = href ? (
    <Link href={href} className="after:absolute after:inset-0 hover:underline">
      {save.title}
    </Link>
  ) : (
    save.title
  );
  return (
    <Card className={cn("relative flex gap-3 p-4", className)}>
      {save.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote, untrusted hosts; no optimizer
        <img src={save.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="size-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <div aria-hidden className="grid size-16 shrink-0 place-items-center rounded-lg bg-muted text-2xl">
          {CATEGORY_EMOJI[category] ?? "✨"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base font-bold leading-tight">{title}</h3>
        {save.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{save.summary}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {save.permanentlyClosed ? <Badge variant="pass">Permanently closed</Badge> : null}
          {save.extraction === "needs_review" ? <Badge variant="accent">Is this right?</Badge> : null}
          {save.extraction === "not_a_place" ? <Badge>Not a place</Badge> : null}
          {save.extraction === "failed" ? <Badge>Couldn&apos;t sort</Badge> : null}
          {save.priority ? <Badge variant={PRIORITY[save.priority]!.variant}>{PRIORITY[save.priority]!.label}</Badge> : null}
          {save.sourceUrl ? (
            <a
              href={save.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="relative z-10 inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {save.creatorHandle ?? "source"}
            </a>
          ) : null}
          {save.addedBy ? <span className="text-muted-foreground">· added by {save.addedBy}</span> : null}
        </div>
      </div>
    </Card>
  );
}
