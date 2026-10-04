"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { routes } from "@/lib/routes";
import { signOutAction } from "@/app/account-actions";

type User = { name: string; provisional: boolean } | null;

export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!user || user.provisional) {
    return (
      <Link href={routes.signin()} className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        Sign in
      </Link>
    );
  }
  const name = user.name || "You";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-muted"
      >
        <Avatar name={name} size="sm" />
        <span className="hidden text-sm font-semibold sm:inline">{name}</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border bg-popover py-1 text-sm shadow-lg">
          <Link role="menuitem" href={routes.account} className="block px-4 py-2 hover:bg-muted">
            Account
          </Link>
          <Link role="menuitem" href={routes.site} className="block px-4 py-2 hover:bg-muted">
            About the app
          </Link>
          <form action={signOutAction}>
            <button role="menuitem" type="submit" className="block w-full px-4 py-2 text-left hover:bg-muted">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
