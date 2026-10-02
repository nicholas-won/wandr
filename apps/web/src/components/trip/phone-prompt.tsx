"use client";

/**
 * Q1: a personal link stays view + vote only. After a few votes, a friendly nudge to confirm
 * your number unlocks adding ideas, comments and the rest. Dismissible; back at most once a day.
 */
import Link from "next/link";
import { useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { dismissPhonePromptAction } from "@/app/t/[tripId]/phone-prompt-actions";

export function PhonePrompt({ signinHref }: { signinHref: string }) {
  const [pending, start] = useTransition();
  return (
    <div role="status" className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="font-semibold">Nice voting! Want to add ideas too?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirm your number once to add ideas, comment and help plan. It takes a few seconds.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={signinHref} className={buttonVariants({ size: "sm" })}>
          Confirm my number
        </Link>
        <Button size="sm" variant="ghost" loading={pending} onClick={() => start(() => dismissPhonePromptAction())}>
          Not now
        </Button>
      </div>
    </div>
  );
}
