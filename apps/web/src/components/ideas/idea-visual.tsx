"use client";

/**
 * The picture on an idea or save card, so a long list still jogs memory.
 * Priority: Google place photo (with its credit) → the source thumbnail (TikTok/IG oEmbed) →
 * a category illustration. Any image that fails to load falls through to the next.
 * Images are lazy, same aspect ratio every time, alt = place name.
 */
import { useEffect, useState } from "react";
import {
  BedDouble,
  Building2,
  Camera,
  Martini,
  Music,
  ShoppingBag,
  Sparkles,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardPhoto } from "@/lib/idea-visual";

const ILLUSTRATION: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  food: { icon: UtensilsCrossed, bg: "from-accent via-accent to-primary/30", fg: "text-accent-foreground" },
  drink: { icon: Martini, bg: "from-secondary via-accent to-accent", fg: "text-secondary-foreground" },
  nightlife: { icon: Music, bg: "from-primary/35 via-accent to-secondary", fg: "text-accent-foreground" },
  activity: { icon: Ticket, bg: "from-secondary via-secondary to-primary/25", fg: "text-secondary-foreground" },
  sight: { icon: Camera, bg: "from-muted via-secondary to-secondary", fg: "text-secondary-foreground" },
  shopping: { icon: ShoppingBag, bg: "from-accent via-muted to-muted", fg: "text-accent-foreground" },
  stay: { icon: BedDouble, bg: "from-muted via-muted to-secondary", fg: "text-secondary-foreground" },
  transit: { icon: TrainFront, bg: "from-secondary via-muted to-muted", fg: "text-secondary-foreground" },
  city: { icon: Building2, bg: "from-primary/25 via-accent to-secondary", fg: "text-accent-foreground" },
  other: { icon: Sparkles, bg: "from-muted via-accent to-accent", fg: "text-accent-foreground" },
};

type Stage = "photo" | "thumb" | "art";

function firstStage(photo: CardPhoto | null | undefined, thumb: string | null | undefined): Stage {
  return photo ? "photo" : thumb ? "thumb" : "art";
}

export function IdeaVisual({
  title,
  category,
  photo,
  photoPrime,
  thumbnailUrl,
  ratio = "wide",
  className,
}: {
  title: string;
  category: string;
  photo?: CardPhoto | null;
  photoPrime?: string | null;
  thumbnailUrl?: string | null;
  /** wide: 2:1 (trip idea cards). short: 3:1 (library lists). The photo credit sits on the image. */
  ratio?: "wide" | "short";
  className?: string;
}) {
  const [stage, setStage] = useState<Stage>(() => firstStage(photo, thumbnailUrl));
  const [src, setSrc] = useState(photo?.src);
  // New data (e.g. after a refresh): start again from the best source.
  if (src !== photo?.src) {
    setSrc(photo?.src);
    setStage(firstStage(photo, thumbnailUrl));
  }

  // Stale or pre-photo display cache: refresh it in the background (Place Details only, never a
  // photo), so the next render can show the place photo.
  useEffect(() => {
    if (!photoPrime) return;
    const ctl = new AbortController();
    fetch(photoPrime, { signal: ctl.signal, credentials: "same-origin" }).catch(() => undefined);
    return () => ctl.abort();
  }, [photoPrime]);

  const fail = () => setStage((s) => (s === "photo" && thumbnailUrl ? "thumb" : "art"));
  const shape = ratio === "wide" ? "aspect-[2/1] w-full" : "aspect-[3/1] w-full";
  const imgSrc = stage === "photo" ? photo?.src : stage === "thumb" ? thumbnailUrl : null;

  return (
    <div className={cn("relative overflow-hidden bg-muted", shape, className)}>
      {imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin photo proxy or untrusted oEmbed hosts; no optimizer
        <img
          key={imgSrc}
          src={imgSrc}
          alt={title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={fail}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <Illustration category={category} />
      )}
      {stage === "photo" && photo ? (
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-3 pb-1.5 pt-5">
          <PhotoCredit photo={photo} className="text-white/90 [&_a]:text-white" />
        </div>
      ) : null}
    </div>
  );
}

function Illustration({ category }: { category: string }) {
  const art = ILLUSTRATION[category] ?? ILLUSTRATION.other!;
  const Icon = art.icon;
  return (
    <div aria-hidden className={cn("absolute inset-0 bg-linear-to-br", art.bg)}>
      <div className="absolute -right-6 -top-8 size-32 rounded-full bg-card/25" />
      <div className="absolute -bottom-10 -left-4 size-24 rounded-full bg-card/20" />
      <div className="absolute inset-0 grid place-items-center">
        <div className={cn("grid size-12 place-items-center rounded-2xl bg-card/70 shadow-sm", art.fg)}>
          <Icon className="size-6" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

/** "Photo: Ana Silva · Google Maps". Google requires the author credit with every place photo. */
export function PhotoCredit({ photo, className }: { photo: CardPhoto; className?: string }) {
  const authors = photo.attributions;
  return (
    <p className={cn("truncate text-[11px] leading-4 text-muted-foreground", className)}>
      Photo:{" "}
      {authors.length
        ? authors.map((a, i) => (
            <span key={i}>
              {i > 0 ? ", " : null}
              {a.uri ? (
                <a href={a.uri} target="_blank" rel="noopener noreferrer nofollow" className="relative z-10 underline-offset-2 hover:underline">
                  {a.displayName}
                </a>
              ) : (
                a.displayName
              )}
            </span>
          ))
        : "Google user"}{" "}
      · Google Maps
    </p>
  );
}

