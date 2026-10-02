"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { moveIdeaToLibraryAction, moveSaveToTripAction } from "./actions";

export function MoveButton({
  kind,
  id,
  tripId,
  label,
  variant = "primary",
  confirmVotesLost = false,
}: {
  kind: "idea" | "save";
  id: string;
  tripId?: string;
  label: string;
  variant?: "primary" | "outline" | "destructive";
  /** TX7: the page showed the "votes will be lost" warning. */
  confirmVotesLost?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        block
        variant={variant}
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = kind === "idea" ? await moveIdeaToLibraryAction(id, confirmVotesLost) : await moveSaveToTripAction(id, tripId!);
            if (r?.error) setError(r.error);
          })
        }
      >
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
