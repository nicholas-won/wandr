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
}: {
  kind: "idea" | "save";
  id: string;
  tripId?: string;
  label: string;
  variant?: "primary" | "outline";
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
            const r = kind === "idea" ? await moveIdeaToLibraryAction(id) : await moveSaveToTripAction(id, tripId!);
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
