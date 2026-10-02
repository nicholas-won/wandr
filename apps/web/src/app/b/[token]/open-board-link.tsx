"use client";

/**
 * Opens a shared-board link with one POST, automatically once a real browser shows the page
 * (headless scanners are skipped so they can't bind the link), with a button as the fallback.
 */
import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { BoardLinkStatus } from "@/lib/auth/board-link";
import { openBoardLinkAction } from "./actions";
import type { OpenBoardLinkState } from "./state";

const COPY: Record<NonNullable<OpenBoardLinkState["error"]>, { title: string; body: string }> = {
  invalid: { title: "This link doesn't work", body: "Check you opened the whole link." },
  revoked: { title: "This link was turned off", body: "Ask the person who shared the board for a new link." },
  removed: { title: "You're no longer on this board", body: "If that's a mistake, ask the board's owner to add you back." },
  other_device: {
    title: "This link was opened on another device",
    body: "Ask the person who shared the board for a new link for this device.",
  },
};

export function OpenBoardLink({ token, status }: { token: string; status: BoardLinkStatus }) {
  const [state, action, pending] = useActionState(
    React.useMemo(() => openBoardLinkAction.bind(null, token), [token]),
    {},
  );
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
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{c.title}</h1>
        <p className="mt-2 text-muted-foreground">{c.body}</p>
      </div>
    );
  }
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Opening the board…</h1>
        <p className="mt-2 text-muted-foreground">One sec. If nothing happens, tap the button.</p>
      </div>
      <Button type="submit" size="lg" block loading={pending}>
        Open the board
      </Button>
    </form>
  );
}
