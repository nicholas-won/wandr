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
import { routes } from "@/lib/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LinkPreview, LinkStatus, LinkStep } from "@/lib/auth/personal-link";
import { linkAction } from "./actions";
import type { OpenLinkState } from "./state";

const COPY: Record<Exclude<NonNullable<OpenLinkState["error"]>, "bad_name">, { title: string; body: string }> = {
  invalid: { title: "This link doesn't work", body: "Check you opened the whole link, or sign in to see your trips." },
  revoked: { title: "This link was turned off", body: "Sign in with your number to see your trips." },
  removed: {
    title: "You're no longer in this trip",
    body: "You can still see what you owe or are owed, and settle up. If being removed is a mistake, ask the organizer to add you back.",
  },
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
        {error === "removed" ? (
          // M-1/M-2: money needs a code (FR-5); the money-only view is listed on their trips page.
          <Link href={routes.signin(`${routes.home}#former`)} className={buttonVariants({ size: "lg", block: true })}>
            Sign in to settle up
          </Link>
        ) : (
          <Link href="/signin" className={buttonVariants({ size: "lg", block: true })}>
            Sign in with a code
          </Link>
        )}
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
    return <ConfirmInvite step={state.step} preview={state.preview} action={action} pending={pending} badName={state.error === "bad_name" ? state : null} />;
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
  /** The server state that rejected the name (a new object on every failed submit). */
  badName: OpenLinkState | null;
}) {
  // D67 (Partiful pattern): "What's your name?" → "Confirm your number" (skippable for view + vote).
  const [name, setName] = React.useState(preview.yourName);
  // The phone step belongs to the server state it was entered under; a new "bad name" answer from
  // the server is a different object, so the name step shows again.
  const [phoneFor, setPhoneFor] = React.useState<{ s: OpenLinkState | null } | null>(null);
  const invite = step === "accept_invite";
  const others = preview.people;
  const setPhase = (p: "name" | "phone") => setPhoneFor(p === "phone" ? { s: badName } : null);

  if (phoneFor && phoneFor.s === badName) {
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="accept" />
        <input type="hidden" name="name" value={name} />
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Confirm your number</h1>
          <p className="mt-2 text-muted-foreground">
            You can vote right away. Confirm your number to also add ideas, comment and help plan.
          </p>
        </div>
        <Button type="submit" name="then" value="signin" size="lg" block loading={pending}>
          Confirm my number
        </Button>
        <Button type="submit" name="then" value="trip" variant="ghost" block disabled={pending}>
          Skip for now
        </Button>
      </form>
    );
  }

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

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          // Nothing is sent yet: the next step submits the accept POST with this name.
          e.preventDefault();
          if (name.trim()) setPhase("phone");
        }}
      >
        <div className="space-y-1">
          {/* D67/C-JR8: the invitee types their own name; the organizer's spelling is only a suggestion. */}
          <Label htmlFor="link-name">What&apos;s your name?</Label>
          <Input
            id="link-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="given-name"
            required
          />
          {badName ? (
            <p role="alert" className="text-sm text-destructive">
              Add your name (up to 40 characters).
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" block>
          {invite ? "Accept invitation" : "That's me"}
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
