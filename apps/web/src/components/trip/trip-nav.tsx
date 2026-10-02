"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

function isActive(path: string, href: string, base: string) {
  return href === base ? path === base : path === href || path.startsWith(`${href}/`);
}

/** Mobile: horizontal pills. Desktop sidebar: vertical list. Sections appear only when needed (P2). */
export function TripNav({ items, base, vertical }: { items: NavItem[]; base: string; vertical?: boolean }) {
  const path = usePathname();
  if (items.length < 2) return null;
  return (
    <nav
      aria-label="Trip sections"
      className={cn(vertical ? "flex flex-col gap-0.5" : "-mx-1 flex gap-1 overflow-x-auto")}
    >
      {items.map((i) => {
        const active = isActive(path, i.href, base);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-sm font-semibold whitespace-nowrap",
              vertical ? "rounded-lg px-3 py-2" : "rounded-full px-4 py-2",
              active
                ? vertical
                  ? "bg-muted text-foreground"
                  : "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
