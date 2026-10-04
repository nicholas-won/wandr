import Link from "next/link";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { loadAppNav } from "@/server/app-nav";
import { AppNavLinks } from "./app-nav-links";
import { AccountMenu } from "./account-menu";

/**
 * The one header every app screen shares (D64). It reads as the app, not the website: brand goes
 * to your trips, and the website is one link away in the account menu.
 */
export async function AppHeader({ className }: { className?: string }) {
  const { user, savedCount } = await loadAppNav();
  const links = [
    { href: routes.home, label: "Trips" },
    ...(user && (savedCount > 0 || !user.provisional) ? [{ href: "/library", label: "Library" }] : []),
  ];
  return (
    <header className={cn("border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75", className)}>
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 lg:px-8">
        <Link href={routes.home} aria-label="Your trips" className="shrink-0">
          <Brand className="text-base [&_svg]:size-6" />
        </Link>
        <AppNavLinks links={links} />
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={routes.start}
            className="hidden rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover sm:inline-flex"
          >
            New trip
          </Link>
          <AccountMenu user={user} />
        </div>
      </div>
    </header>
  );
}
