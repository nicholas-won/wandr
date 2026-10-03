"use client";

/** One primary action per screen (P3): number → code → name. */
import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Turnstile } from "@/components/turnstile";
import { signInStep } from "./actions";
import type { SignInState } from "./state";

export function SignInForm({
  initial,
  turnstileSiteKey,
  devCodeHint = false,
  signup = false,
}: {
  initial: SignInState;
  turnstileSiteKey: string | null;
  /** Local/test only: Twilio isn't connected, so say which code works (000000). */
  devCodeHint?: boolean;
  /** Arriving from "Start planning": frame it as signing up, since trips belong to your number (D74). */
  signup?: boolean;
}) {
  const [state, action, pending] = useActionState(signInStep, initial);
  const errorId = React.useId();

  return (
    <form action={action} className="flex flex-1 flex-col" noValidate>
      {state.step === "contact" ? (
        <ContactStep state={state} pending={pending} errorId={errorId} turnstileSiteKey={turnstileSiteKey} signup={signup} />
      ) : state.step === "code" ? (
        <CodeStep state={state} pending={pending} errorId={errorId} devCodeHint={devCodeHint} />
      ) : (
        <NameStep state={state} pending={pending} errorId={errorId} />
      )}
    </form>
  );
}

type StepProps = { state: SignInState; pending: boolean; errorId: string };

function Heading({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
      {sub ? <p className="mt-2 text-base text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ErrorText({ id, error }: { id: string; error?: string }) {
  return (
    <p id={id} role="alert" className="min-h-6 pt-2 text-sm font-medium text-destructive">
      {error ?? ""}
    </p>
  );
}

function ContactStep({
  state,
  pending,
  errorId,
  turnstileSiteKey,
  signup,
}: StepProps & { turnstileSiteKey: string | null; signup: boolean }) {
  const sms = state.channel === "sms";
  const how = sms ? "We'll text you a code. No password needed." : "We'll email you a code. No password needed.";
  return (
    <>
      <Heading
        title={signup ? "First, your number" : sms ? "What's your number?" : "What's your email?"}
        sub={signup ? `Your trips and saved ideas belong to your number, so they're never lost. ${how}` : how}
      />
      <Label htmlFor="destination">{sms ? "Mobile number" : "Email"}</Label>
      <Input
        key={state.channel}
        id="destination"
        name="destination"
        className="mt-2"
        type={sms ? "tel" : "email"}
        inputMode={sms ? "tel" : "email"}
        autoComplete={sms ? "tel" : "email"}
        placeholder={sms ? "(555) 555-1234" : "you@example.com"}
        defaultValue={state.lastInput ?? ""}
        required
        autoFocus
        aria-invalid={state.error ? true : undefined}
        aria-describedby={errorId}
      />
      <ErrorText id={errorId} error={state.error} />
      {state.captchaRequired && turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} /> : null}
      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Button type="submit" name="intent" value="request" size="lg" block loading={pending}>
          {sms ? "Text me a code" : "Email me a code"}
        </Button>
        <Button type="submit" name="intent" value="switch" variant="ghost" formNoValidate disabled={pending}>
          {sms ? "Use email instead" : "Use my phone number instead"}
        </Button>
        {sms ? (
          <p className="text-center text-xs text-muted-foreground">
            Texts work for US and Canadian numbers. Msg &amp; data rates may apply.
          </p>
        ) : null}
      </div>
    </>
  );
}

function CodeStep({ state, pending, errorId, devCodeHint }: StepProps & { devCodeHint: boolean }) {
  const continueRef = React.useRef<HTMLButtonElement>(null);
  return (
    <>
      <Heading title="Enter your code" sub={<>Sent to <span className="font-semibold text-foreground">{state.display}</span>.</>} />
      {devCodeHint ? (
        <p className="-mt-4 mb-6 rounded-xl border border-dashed border-primary/60 bg-accent px-4 py-3 text-sm text-accent-foreground">
          <strong>Test mode:</strong> texting isn&apos;t connected yet, so no text was sent. Enter{" "}
          <span className="font-mono font-semibold">000000</span> (the real code is also printed in the server console).
        </p>
      ) : null}
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
        onChange={(e) => {
          // Submit as soon as all 6 digits are in (typed or autofilled from the text).
          if (/^\d{6}$/.test(e.currentTarget.value) && !pending) {
            e.currentTarget.form?.requestSubmit(continueRef.current ?? undefined);
          }
        }}
      />
      <ErrorText id={errorId} error={state.error} />
      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Button ref={continueRef} type="submit" name="intent" value="verify" size="lg" block loading={pending}>
          Continue
        </Button>
        <div className="flex justify-center gap-6">
          <Button type="submit" name="intent" value="back" variant="link" formNoValidate disabled={pending}>
            Change {state.channel === "sms" ? "number" : "email"}
          </Button>
          {state.lastInput ? (
            <Button type="submit" name="intent" value="resend" variant="link" formNoValidate disabled={pending}>
              Send a new code
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function NameStep({ state, pending, errorId }: StepProps) {
  return (
    <>
      <Heading title="What should friends call you?" sub="This is how you'll show up on votes and splits." />
      <Label htmlFor="name">Your name</Label>
      <Input
        id="name"
        name="name"
        className="mt-2"
        autoComplete="given-name"
        maxLength={40}
        required
        autoFocus
        aria-invalid={state.error ? true : undefined}
        aria-describedby={errorId}
      />
      <ErrorText id={errorId} error={state.error} />
      <div className="mt-auto pt-8">
        <Button type="submit" name="intent" value="name" size="lg" block loading={pending}>
          Done
        </Button>
      </div>
    </>
  );
}
