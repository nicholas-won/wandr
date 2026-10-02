"use client";

/**
 * Opens a personal link with one POST. Submits automatically once the page is visible to a real
 * browser (so a guest votes within a couple of taps of the text, NFR-2), with a button as the
 * fallback. Headless/automated browsers are skipped so scanners don't bind the link.
 *
 * Q37: the first open shows the trip and an explicit "Accept invitation" (or "Not me"); nothing
 * joins until that second POST. Q1: everyone confirms their name once ("You're Sam?", editable).
 */
import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LinkPreview, LinkStatus, LinkStep } from "@/lib/auth/personal-link";
import { linkAction } from "./actions";
import type { OpenLinkState } from "./state";

const COPY: Record<Exclude<NonNullable<OpenLinkState["error"]>, "bad_name">, { title: string; body: string }> = {
  invalid: { title: "This link doesn't work", body: "Check you opened the whole link, or sign in to see your trips." },
  revoked: { title: "This link was turned off", body: "Sign in with your number to see your trips." },
  removed: { title: "You're no longer in this trip", body: "If that's a mistake, ask the organizer to add you back." },
  other_device: {
    title: "Sign in to continue",
    body: "This link was already opened on another device. Enter a code once to use it here.",
  },
};

export function OpenLink({ token, status }: { token: string; status: LinkStatus }) {
  const [state, action, pending] = useActionState(React.useMemo(() => linkAction.bind(null, token), [token]), {});
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
  if (error && error !== "bad_name") {
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

  if (state.notMe) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">No problem</h1>
          <p className="mt-2 text-muted-foreground">
            This invite was meant for someone else. Ask whoever sent it for your own link, or sign in with your number.
          </p>
        </div>
        <Link href="/signin" className={buttonVariants({ variant: "outline", size: "lg", block: true })}>
          Sign in with my number
        </Link>
      </div>
    );
  }

  if (state.step && state.preview) {
    return <ConfirmInvite step={state.step} preview={state.preview} action={action} pending={pending} badName={state.error === "bad_name"} />;
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <input type="hidden" name="intent" value="open" />
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

/** Q37 trip preview + "Accept invitation" / "Not me"; Q1 "You're Sam?" with an edit option. */
function ConfirmInvite({
  step,
  preview,
  action,
  pending,
  badName,
}: {
  step: LinkStep;
  preview: LinkPreview;
  action: (form: FormData) => void;
  pending: boolean;
  badName: boolean;
}) {
  const [editing, setEditing] = React.useState(badName);
  const invite = step === "accept_invite";
  const others = preview.people;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">{invite ? "You're invited to" : "Welcome back to"}</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{preview.tripName}</h1>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {others.length ? <li>With {others.join(", ")}</li> : null}
          {preview.cities.length ? <li>{preview.cities.join(" → ")}</li> : null}
          {preview.ideaCount ? (
            <li>
              {preview.ideaCount} {preview.ideaCount === 1 ? "idea" : "ideas"} to vote on
            </li>
          ) : null}
        </ul>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="accept" />
        {editing ? (
          <div className="space-y-1">
            <Label htmlFor="link-name">Your name</Label>
            <Input id="link-name" name="name" defaultValue={preview.yourName} maxLength={40} autoComplete="given-name" required />
            {badName ? (
              <p role="alert" className="text-sm text-destructive">
                Add your name (up to 40 characters).
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-lg">
            You&apos;re <span className="font-semibold">{preview.yourName}</span>?{" "}
            <button
              type="button"
              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => setEditing(true)}
            >
              Edit name
            </button>
          </p>
        )}
        <Button type="submit" size="lg" block loading={pending}>
          {invite ? "Accept invitation" : "That's me, open the trip"}
        </Button>
      </form>

      <form action={action}>
        <input type="hidden" name="intent" value="not_me" />
        <Button type="submit" variant="ghost" block disabled={pending}>
          Not me
        </Button>
      </form>
    </div>
  );
}
