"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bookmark } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { saveForNextTimeAction } from "@/app/library/actions";
import { libraryRoutes } from "@/lib/library-routes";

/**
 * FR-L13 "Save for next time": copy a trip idea's place into your own library. Nothing about
 * anyone else's library is ever shown in the trip (FR-L25).
 */
export function SaveForNextTime({ tripId, ideaId }: { tripId: string; ideaId: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await saveForNextTimeAction(tripId, ideaId);
          if (!r.ok) {
            if (r.signin) router.push(r.signin);
            else toast({ title: r.error, variant: "error" });
            return;
          }
          toast({ title: r.message ?? "Saved", action: { label: "Library", onClick: () => router.push(libraryRoutes.home) } });
        })
      }
      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      <Bookmark className="size-3.5" aria-hidden /> Save for next time
    </button>
  );
}
