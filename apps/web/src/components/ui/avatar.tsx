import * as React from "react";
import { cn } from "@/lib/utils";

/** Stable, AA-contrast background per name (J-13: tell people apart at a glance). */
const PALETTE = [
  "bg-[#c2410c] text-white",
  "bg-[#0f766e] text-white",
  "bg-[#7c3aed] text-white",
  "bg-[#1d4ed8] text-white",
  "bg-[#be185d] text-white",
  "bg-[#4d7c0f] text-white",
  "bg-[#57534e] text-white",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" } as const;

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ring-2 ring-background",
        SIZES[size],
        src ? "bg-muted" : colorFor(name),
        className,
      )}
      title={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span aria-label={name}>{initials(name)}</span>
      )}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className="flex -space-x-2">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size="sm" />
      ))}
      {extra > 0 ? (
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-xs font-bold ring-2 ring-background">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
