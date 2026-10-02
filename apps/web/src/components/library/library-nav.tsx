"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { libraryRoutes } from "@/lib/library-routes";

/** Places (auto boards, FR-L6) and custom Boards (FR-L8). */
export function LibraryNav() {
  const path = usePathname();
  const onBoards = path.startsWith(libraryRoutes.boards) || path.startsWith("/library/b/");
  const items = [
    { href: libraryRoutes.home, label: "Places", active: !onBoards },
    { href: libraryRoutes.boards, label: "Boards", active: onBoards },
  ];
  return (
    <nav aria-label="Library sections" className="flex gap-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
            i.active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
