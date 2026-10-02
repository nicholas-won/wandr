"use client";

/** One primary action per screen (P3): details → code → (name check) → done. */
import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Turnstile } from "@/components/turnstile";
import { joinStep } from "./actions";
import type { JoinResult, JoinState } from "./state";

const RESULT_COPY: Record<JoinResult, { title: string; body: string }> = {
  pending: {
    title: "Request sent",
    body: "An organizer will approve you soon. We'll let you in as soon as they do.",
  },
  already_pending: { title: "Waiting for approval", body: "Your request is with the organizers." },
  ask_organizer: { title: "Ask the organizer to add you", body: "This trip only lets in people the organizers added." },
  link_off: { title: "This link is paused", body: "Ask the person who shared it for a new link." },
  limited: { title: "Lots of requests right now", body: "Try again in a little while." },
  recheck: { title: "Let's double-check it's you", body: "Sign in again to continue." },
};

export function JoinFlow({
  token,
  tripName,
  signedIn,
  turnstileSiteKey,
}: {
  token: string;
  tripName: string;
  signedIn: boolean;
  turnstileSiteKey: string | null;
}) {
  const bound = React.useMemo(() => joinStep.bind(null, token), [token]);
  const [state, action, pending] = useActionState(bound, {
    step: "details",
    channel: "sms",
    name: "",
    ageConfirmed: false,
  } satisfies JoinState);
  const errorId = React.useId();
  const joinRef = React.useRef<HTMLFormElement>(null);

  // After the code: continue in a fresh request so the new session is read.
  React.useEffect(() => {
    if (state.step === "joining") joinRef.current?.requestSubmit();
  }, [state.step]);

  const error = (
    <p id={errorId} role="alert" className="min-h-6 pt-2 text-sm font-medium text-destructive">
      {state.error ?? ""}
    </p>
  );

  if (state.step === "result" && state.result) {
    const c = RESULT_COPY[state.result];
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">{tripName}</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{c.title}</h1>
          <p className="mt-2 text-muted-foreground">{c.body}</p>
        </div>
        {state.result === "recheck" ? (
          <Link href="/signin" className={buttonVariants({ size: "lg", block: true })}>
            Sign in
          </Link>
        ) : null}
      </div>
    );
  }

  if (state.step === "joining") {
    return (
      <form ref={joinRef} action={action} className="flex flex-col gap-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Joining {tripName}…</h1>
        <Button type="submit" name="intent" value="join" size="lg" block loading={pending}>
          Continue
        </Button>
        {error}
      </form>
    );
  }

  if (state.step === "confirm") {
    return (
      <form action={action} className="flex flex-1 flex-col">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Are you {state.expectedName}?</h1>
        <p className="mt-2 text-muted-foreground">The organizer added this number under that name.</p>
        {error}
        <div className="mt-auto flex flex-col gap-3 pt-8">
          <Button type="submit" name="intent" value="confirm_yes" size="lg" block loading={pending}>
            Yes, that&apos;s me
          </Button>
          <Button type="submit" name="intent" value="confirm_no" variant="ghost" disabled={pending}>
            No, I&apos;m {state.name}
          </Button>
        </div>
      </form>
    );
  }

  if (state.step === "code") {
    return (
      <form action={action} className="flex flex-1 flex-col" noValidate>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Enter your code</h1>
        <p className="mb-8 mt-2 text-muted-foreground">
          Sent to <span className="font-semibold text-foreground">{state.display}</span>.
        </p>
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          name="code"
          className="mt-2 text-center font-mono text-2xl tracking-[0.5em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={errorId}
        />
        {error}
        <div className="mt-auto flex flex-col gap-3 pt-8">
          <Button type="submit" name="intent" value="verify" size="lg" block loading={pending}>
            Continue
          </Button>
          <div className="flex justify-center gap-6">
            <Button type="submit" name="intent" value="back" variant="link" formNoValidate disabled={pending}>
              Change {state.channel === "sms" ? "number" : "email"}
            </Button>
            <Button type="submit" name="intent" value="resend" variant="link" formNoValidate disabled={pending}>
              Send a new code
            </Button>
          </div>
        </div>
      </form>
    );
  }

  const sms = state.channel === "sms";
  return (
    <form action={action} className="flex flex-1 flex-col" noValidate>
      <p className="text-sm font-semibold text-muted-foreground">You&apos;re invited to</p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">{tripName}</h1>
      <p className="mb-8 mt-2 text-muted-foreground">
        {signedIn ? "Tell the group who you are." : "Add your name and number. We'll text you a code."}
      </p>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="join-name">Your name</Label>
          <Input id="join-name" name="name" autoComplete="given-name" maxLength={40} defaultValue={state.name} required />
        </div>
        {signedIn ? null : (
          <div className="space-y-1">
            <Label htmlFor="destination">{sms ? "Mobile number" : "Email"}</Label>
            <Input
              key={state.channel}
              id="destination"
              name="destination"
              type={sms ? "tel" : "email"}
              inputMode={sms ? "tel" : "email"}
              autoComplete={sms ? "tel" : "email"}
              placeholder={sms ? "(555) 555-1234" : "you@example.com"}
              defaultValue={state.lastInput ?? ""}
              required
              aria-invalid={state.error ? true : undefined}
              aria-describedby={errorId}
            />
          </div>
        )}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="age"
            defaultChecked={state.ageConfirmed}
            required
            className="mt-0.5 size-5 accent-primary"
          />
          <span>I&apos;m 13 or older</span>
        </label>
      </div>
      {error}
      {state.captchaRequired && turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} /> : null}
      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Button type="submit" name="intent" value="details" size="lg" block loading={pending}>
          {signedIn ? "Join" : sms ? "Text me a code" : "Email me a code"}
        </Button>
        {signedIn ? null : (
          <Button type="submit" name="intent" value="switch" variant="ghost" formNoValidate disabled={pending}>
            {sms ? "Use email instead" : "Use my phone number instead"}
          </Button>
        )}
        {sms && !signedIn ? (
          <p className="text-center text-xs text-muted-foreground">
            Texts work for US and Canadian numbers. Msg &amp; data rates may apply.
          </p>
        ) : null}
      </div>
    </form>
  );
}
