import Link from "next/link";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { LibraryNav } from "@/components/library/library-nav";
import { libraryRoutes } from "@/lib/library-routes";
import { routes } from "@/lib/routes";
import { libraryContext } from "@/server/library-context";

export const metadata: Metadata = { title: "Library", robots: { index: false, follow: false } };

/**
 * Library shell (§6.12). Phones: capture-first single column. Desktop: wide workspace.
 * People reaching a shared board through its link (no account) see the brand only.
 */
export default async function LibraryLayout({ children }: LayoutProps<"/library">) {
  const { userId } = await libraryContext();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-16 pt-4 lg:px-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={userId ? routes.home : libraryRoutes.home} aria-label="Home">
          <Brand className="text-base [&_svg]:size-6" />
        </Link>
        {userId ? <LibraryNav /> : null}
      </header>
      {children}
    </div>
  );
}
