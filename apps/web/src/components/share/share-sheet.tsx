"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, MessageCircle, Share2 } from "lucide-react";
import type { ShareKind } from "@wandr/core/messaging";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createShareAction } from "@/app/t/[tripId]/share/actions";

/**
 * FR-80a share button: freezes a group-safe card (server), then
 * - phones: opens the native share sheet (Messages, WhatsApp, IG DMs...) with text + link;
 * - desktop / no Web Share: shows "Copy link" and "Text it" (sms:) instead.
 * The organizer's own phone sends it, so it costs nothing (D49). In duo trips the label is
 * "Send to Sam" (§6.10); we never know or show Sam's number.
 */
export function ShareButton({
  tripId,
  kind,
  subjectId,
  label,
  variant = "primary",
  size = "md",
  block,
}: {
  tripId: string;
  kind: ShareKind;
  subjectId: string;
  label: string;
  variant?: "primary" | "outline" | "secondary";
  size?: "md" | "sm";
  block?: boolean;
}) {
  const [pending, start] = useTransition();
  const [ready, setReady] = useState<{ url: string; message: string } | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Couldn't copy. Select the link and copy it.", variant: "error" });
    }
  };

  if (ready) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size={size} variant="primary" onClick={() => copy(ready.message)}>
          <Copy aria-hidden /> Copy link
        </Button>
        <a
          href={`sms:&body=${encodeURIComponent(ready.message)}`}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-input px-4 text-sm font-semibold hover:bg-muted"
        >
          <MessageCircle className="size-4" aria-hidden /> Text it
        </a>
        <span className="sr-only" aria-live="polite">
          Share link ready
        </span>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      block={block}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await createShareAction(tripId, kind, subjectId);
          if (!r.ok) {
            if (r.signin) router.push(r.signin);
            else toast({ title: r.error, variant: "error" });
            return;
          }
          const phone = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
          if (phone && typeof navigator.share === "function") {
            try {
              await navigator.share({ text: r.message });
              router.refresh();
              return;
            } catch {
              /* cancelled: fall through to copy options */
            }
          }
          setReady({ url: r.url, message: r.message });
          router.refresh();
        })
      }
    >
      <Share2 aria-hidden /> {label}
    </Button>
  );
}
