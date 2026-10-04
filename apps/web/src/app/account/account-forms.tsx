"use client";

import * as React from "react";
import { useActionState } from "react";
import { ACCOUNT_DELETE_WORD, accountDeleteConfirmed } from "@wandr/core/account-deletion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction, emailStepAction, saveNameAction, type EmailState } from "./actions";

function ErrorText({ id, error }: { id: string; error?: string }) {
  return (
    <p id={id} role="alert" className="min-h-5 text-sm font-medium text-destructive">
      {error ?? ""}
    </p>
  );
}

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(saveNameAction, {});
  const errorId = React.useId();
  return (
    <form action={action} className="space-y-2">
      <Label htmlFor="account-name">Your name</Label>
      <div className="flex gap-2">
        <Input
          id="account-name"
          name="name"
          defaultValue={name}
          maxLength={40}
          autoComplete="name"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={errorId}
        />
        <Button type="submit" variant="outline" loading={pending}>
          Save
        </Button>
      </div>
      {state.saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          Saved.
        </p>
      ) : (
        <ErrorText id={errorId} error={state.error} />
      )}
    </form>
  );
}

/** J-6: add or change the email, confirmed with a code. */
export function EmailForm({ email }: { email: string | null }) {
  const [editing, setEditing] = React.useState(!email);
  const [state, action, pending] = useActionState(emailStepAction, { step: "enter" } as EmailState);
  const errorId = React.useId();

  if (state.step === "done") {
    return (
      <p role="status" className="text-sm">
        Email confirmed. You can now sign in with it too.
      </p>
    );
  }
  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="font-medium">{email}</span>
          <span className="block text-xs text-muted-foreground">Confirmed · you can sign in with it</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-2" noValidate>
      {state.step === "code" ? (
        <>
          <Label htmlFor="email-code">Code we emailed to {state.display}</Label>
          <Input
            id="email-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            className="text-center font-mono text-xl tracking-[0.4em]"
            autoFocus
            aria-describedby={errorId}
          />
          <ErrorText id={errorId} error={state.error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="verify" loading={pending}>
              Confirm email
            </Button>
            <Button type="submit" name="intent" value="resend" variant="ghost" disabled={pending}>
              Send again
            </Button>
            <Button type="submit" name="intent" value="back" variant="ghost" disabled={pending}>
              Change email
            </Button>
          </div>
        </>
      ) : (
        <>
          <Label htmlFor="account-email">Email</Label>
          <p className="text-sm text-muted-foreground">
            Traveling with your home SIM off? An email lets you still sign in when texts can&apos;t reach you.
          </p>
          <div className="flex gap-2">
            <Input
              id="account-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue={state.lastInput ?? ""}
              aria-invalid={state.error ? true : undefined}
              aria-describedby={errorId}
            />
            <Button type="submit" name="intent" value="request" variant="outline" loading={pending}>
              Email me a code
            </Button>
          </div>
          <ErrorText id={errorId} error={state.error} />
        </>
      )}
    </form>
  );
}

/** FR-3: successor picks live in the same form, so the preview above them is exactly what happens. */
export function DeleteAccountForm({ children }: { children: React.ReactNode }) {
  const [state, action, pending] = useActionState(deleteAccountAction, {});
  const [typed, setTyped] = React.useState("");
  const errorId = React.useId();
  return (
    <form action={action} className="space-y-6">
      {children}
      <div className="space-y-2">
        <Label htmlFor="delete-confirm">
          Type <span className="font-semibold">{ACCOUNT_DELETE_WORD}</span> to confirm
        </Label>
        <Input
          id="delete-confirm"
          name="confirm"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-describedby={errorId}
        />
        <ErrorText id={errorId} error={state.error} />
      </div>
      <Button type="submit" variant="destructive" block disabled={!accountDeleteConfirmed(typed)} loading={pending}>
        Delete my account
      </Button>
    </form>
  );
}
