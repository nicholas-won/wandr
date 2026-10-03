"use client";

/**
 * Screenshot capture for the paste boxes (FR-20, FR-L1): an image button, a pasted clipboard
 * image, or a file dropped on the box (desktop). The server sniffs the bytes and is the real
 * check; these client checks just answer fast (HEIC, size).
 */
import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ImagePlus } from "lucide-react";

export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export type UploadResult = { ok: true; id?: string } | { ok: false; error: string; signin?: string };

/** Client-side precheck. Returns an error message, or null to upload. */
export function precheckScreenshot(file: File): string | null {
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    return "HEIC photos aren't supported yet. Use a JPEG or PNG screenshot.";
  }
  if (file.type && !file.type.startsWith("image/")) return "That isn't an image. Use a JPEG or PNG screenshot.";
  if (file.size > MAX_SCREENSHOT_BYTES) return "That image is too large (10 MB max).";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/** POST the image (and any typed note) to `endpoint`. */
export async function uploadScreenshot(endpoint: string, file: File, note?: string): Promise<UploadResult> {
  const pre = precheckScreenshot(file);
  if (pre) return { ok: false, error: pre };
  const body = new FormData();
  body.set("file", file);
  if (note?.trim()) body.set("note", note.trim());
  try {
    const res = await fetch(endpoint, { method: "POST", body, credentials: "same-origin" });
    const j = (await res.json().catch(() => ({}))) as { error?: string; signin?: string; ideaId?: string; savedIdeaId?: string };
    if (!res.ok) return { ok: false, error: j.error ?? "Upload failed. Try again.", signin: j.signin };
    return { ok: true, id: j.ideaId ?? j.savedIdeaId };
  } catch {
    return { ok: false, error: "Upload failed. Check your connection." };
  }
}

export function firstImage(files: FileList | null | undefined): File | null {
  if (!files) return null;
  for (const f of Array.from(files)) if (f.type.startsWith("image/") || /\.(hei[cf]|png|jpe?g|webp|gif)$/i.test(f.name)) return f;
  return null;
}

/**
 * Wires drop + paste handlers onto a container. `onImage` receives the image file.
 * Paste only takes over when the clipboard carries an image (text paste works as before).
 */
export function useImageDrop(onImage: (f: File) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  return {
    over,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      },
      onDragOver: (e: DragEvent) => {
        if (hasFiles(e)) e.preventDefault();
      },
      onDragLeave: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const f = firstImage(e.dataTransfer.files);
        if (f) onImage(f);
      },
    },
    /** Call from the input's onPaste; returns true when it took an image. */
    pasteImage: (e: ClipboardEvent) => {
      const f = firstImage(e.clipboardData?.files);
      if (!f) return false;
      e.preventDefault();
      onImage(f);
      return true;
    },
  };
}

/** The image button inside the paste box. */
export function ImageButton({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label="Add a screenshot"
        title="Add a screenshot"
        className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <ImagePlus className="size-5" aria-hidden />
      </button>
      <input
        ref={input}
        type="file"
        // No HEIC here: iOS then converts library photos to JPEG on the way in.
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </>
  );
}
