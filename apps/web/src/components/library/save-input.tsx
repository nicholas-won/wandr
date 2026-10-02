"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { boardAddAction, saveAction } from "@/app/library/actions";
import { libraryRoutes } from "@/lib/library-routes";

/**
 * FR-L1 / FR-L14: paste a link or type an idea, with no trip. One field, one button (P3).
 * With `boardId`, the save goes onto that board (anyone on it can add).
 */
export function SaveInput({ boardId, autoFocus }: { boardId?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  function submit(raw: string) {
    if (!raw.trim()) return;
    start(async () => {
      const r = boardId ? await boardAddAction(boardId, raw) : await saveAction(raw);
      if (r.ok) {
        setValue("");
        input.current?.focus();
        const id = "savedIdeaId" in r && typeof r.savedIdeaId === "string" ? r.savedIdeaId : undefined;
        toast({
          title: boardId ? "Added to the board. Sorting it now…" : "Saved. Sorting it now…",
          action: id ? { label: "View", onClick: () => router.push(libraryRoutes.save(id)) } : undefined,
        });
      } else if (r.signin) {
        router.push(r.signin);
      } else {
        toast({ title: r.error, variant: "error" });
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="flex items-center gap-2 rounded-full border border-input bg-card p-1.5 pl-5 shadow-sm focus-within:ring-2 focus-within:ring-ring"
    >
      <label htmlFor="save-input" className="sr-only">
        Paste a link or type a place to save
      </label>
      <input
        ref={input}
        id="save-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/^https?:\/\//i.test(text.trim()) && !value) {
            e.preventDefault();
            setValue(text);
            submit(text);
          }
        }}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={boardId ? "Add a TikTok, link, or place" : "Save a TikTok, link, or place"}
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" size="sm" loading={pending}>
        {!pending && <Plus aria-hidden />}
        {boardId ? "Add" : "Save"}
      </Button>
    </form>
  );
}
