"use client";

/**
 * FR-60 / P4: "Snap a receipt". Tap → camera (or photo picker on desktop) → upload → the form
 * opens with the AI read filling in. The trip is implicit (we're already in it).
 */
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function SnapReceipt({
  tripId,
  label = "Snap a receipt",
  variant = "primary",
  block = true,
  className,
}: {
  tripId: string;
  label?: string;
  variant?: "primary" | "outline" | "secondary";
  block?: boolean;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const base = `/t/${tripId}/money`;

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${base}/receipts`, { method: "POST", body });
      const j = (await res.json().catch(() => ({}))) as { uploadId?: string; error?: string; signin?: boolean };
      if (res.status === 401 || j.signin) {
        router.push(`/signin?next=${encodeURIComponent(base)}`);
        return;
      }
      if (!res.ok || !j.uploadId) {
        toast({ title: j.error ?? "Upload failed. Try again.", variant: "error" });
        return;
      }
      router.push(`${base}/new?receipt=${j.uploadId}`);
    } catch {
      toast({ title: "Upload failed. Check your connection.", variant: "error" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <label
        htmlFor={id}
        role="button"
        tabIndex={0}
        aria-busy={busy || undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        className={cn(buttonVariants({ variant, block }), "cursor-pointer", busy && "pointer-events-none opacity-60", className)}
      >
        {busy ? (
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        ) : (
          <Camera aria-hidden />
        )}
        {busy ? "Uploading…" : label}
      </label>
    </>
  );
}
