"use client";

/**
 * Opens a personal link with one POST. Submits automatically once the page is visible to a real
 * browser (so a guest votes within 2 taps of the text, NFR-2), with a button as the fallback.
 * Headless/automated browsers are skipped so scanners don't bind the link to their device.
 */
import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import type { LinkStatus } from "@/lib/auth/personal-link";
import { openLinkAction } from "./actions";
import type { OpenLinkState } from "./state";

const COPY: Record<NonNullable<OpenLinkState["error"]>, { title: string; body: string }> = {
  invalid: { title: "This link doesn't work", body: "Check you opened the whole link, or sign in to see your trips." },
  revoked: { title: "This link was turned off", body: "Sign in with your number to see your trips." },
  removed: { title: "You're no longer in this trip", body: "If that's a mistake, ask the organizer to add you back." },
  other_device: {
    title: "Sign in to continue",
    body: "This link was already opened on another device. Enter a code once to use it here.",
  },
};

export function OpenLink({ token, status }: { token: string; status: LinkStatus }) {
  const [state, action, pending] = useActionState(React.useMemo(() => openLinkAction.bind(null, token), [token]), {});
  const formRef = React.useRef<HTMLFormElement>(null);
  const submitted = React.useRef(false);

  React.useEffect(() => {
    if (status !== "ok") return;
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    const go = () => {
      if (submitted.current || document.visibilityState !== "visible") return;
      submitted.current = true;
      formRef.current?.requestSubmit();
    };
    go();
    document.addEventListener("visibilitychange", go);
    return () => document.removeEventListener("visibilitychange", go);
  }, [status]);

  const error = status !== "ok" ? status : state.error;
  if (error) {
    const c = COPY[error];
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{c.title}</h1>
          <p className="mt-2 text-muted-foreground">{c.body}</p>
        </div>
        {error !== "removed" ? (
          <Link href="/signin" className={buttonVariants({ size: "lg", block: true })}>
            Sign in with a code
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Opening your trip…</h1>
        <p className="mt-2 text-muted-foreground">One sec. If nothing happens, tap the button.</p>
      </div>
      <Button type="submit" size="lg" block loading={pending}>
        Open my trip
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Not you?{" "}
        <Link href="/signin" className="font-semibold text-primary underline-offset-4 hover:underline">
          Sign in with your own number
        </Link>
      </p>
    </form>
  );
}
