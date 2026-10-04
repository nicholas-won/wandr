"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recheckStepAction, type RecheckState } from "./actions";

export function RecheckForm({
  name,
  emailHint,
  hasOrganizer,
  next,
}: {
  name: string;
  /** Masked email on the account, or null. */
  emailHint: string | null;
  hasOrganizer: boolean;
  next: string;
}) {
  const [state, action, pending] = useActionState(recheckStepAction, { step: "start", next } as RecheckState);
  const errorId = React.useId();
  const who = name || "the person on this account";
  return (
    <form action={action} className="flex flex-1 flex-col gap-6" noValidate>
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Is this {who}?</h1>
        <p className="mt-2 text-muted-foreground">
          This number hasn&apos;t signed in for a while, and phone numbers sometimes get a new owner. One more check
          before you see money or change anything.
        </p>
      </div>

      {state.step === "code" ? (
        <div className="space-y-2">
          <Label htmlFor="recheck-code">Code we emailed to {state.display}</Label>
          <Input
            id="recheck-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            className="text-center font-mono text-2xl tracking-[0.5em]"
            autoFocus
            aria-describedby={errorId}
          />
          <p id={errorId} role="alert" className="min-h-5 text-sm font-medium text-destructive">
            {state.error ?? ""}
          </p>
          <Button type="submit" name="intent" value="verify" size="lg" block loading={pending}>
            Continue
          </Button>
        </div>
      ) : emailHint ? (
        <div className="space-y-2">
          <Button type="submit" name="intent" value="request" size="lg" block loading={pending}>
            Email a code to {emailHint}
          </Button>
          <p role="alert" className="min-h-5 text-sm font-medium text-destructive">
            {state.error ?? ""}
          </p>
        </div>
      ) : null}

      {state.step !== "code" ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <p className="font-semibold">{emailHint ? "No access to that email?" : "Ask an organizer to confirm it's you"}</p>
          <p className="mt-1 text-muted-foreground">
            {hasOrganizer
              ? "An organizer of one of your trips can confirm it's you from the trip's People page. Let them know; this page unlocks once they do."
              : "You're not on a trip with an organizer who can confirm it's you yet."}
          </p>
          <p className="mt-2 text-muted-foreground">Until then you can still open your trips and vote.</p>
        </div>
      ) : null}

      <div className="mt-auto">
        <Button type="submit" name="intent" value="not_me" variant="ghost" block formNoValidate disabled={pending}>
          I&apos;m not {name || "them"}. Sign out
        </Button>
      </div>
    </form>
  );
}
