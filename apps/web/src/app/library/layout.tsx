import Link from "next/link";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { Brand } from "@/components/brand";
import { LibraryNav } from "@/components/library/library-nav";
import { libraryRoutes } from "@/lib/library-routes";
import { libraryContext } from "@/server/library-context";

export const metadata: Metadata = { title: "Library", robots: { index: false, follow: false } };

/**
 * Library shell (§6.12). Phones: capture-first single column. Desktop: wide workspace.
 * People reaching a shared board through its link (no account) see the brand only.
 */
export default async function LibraryLayout({ children }: LayoutProps<"/library">) {
  const { userId } = await libraryContext();
  // Shared-board guests (no account) get a plain brand bar, not the app's navigation.
  if (!userId) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-16 pt-4 lg:px-8">
        <header className="mb-4">
          <Link href={libraryRoutes.home} aria-label="Home">
            <Brand className="text-base [&_svg]:size-6" />
          </Link>
        </header>
        {children}
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 pt-6 lg:px-8">
        <div className="mb-6">
          <LibraryNav />
        </div>
        {children}
      </div>
    </div>
  );
}
