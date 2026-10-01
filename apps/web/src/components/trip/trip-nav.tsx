"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

/** Section tabs. Sections appear only when needed (P2); the caller decides which. */
export function TripNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  if (items.length < 2) return null;
  return (
    <nav aria-label="Trip sections" className="-mx-1 flex gap-1 overflow-x-auto">
      {items.map((i) => {
        const active = path === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
