"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addIdeaAction } from "@/app/t/[tripId]/actions";

/** FR-20: paste a TikTok / IG / Maps link or type an idea. One field, one button (P3). */
export function AddIdea({ tripId, autoFocus }: { tripId: string; autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  function submit(raw: string) {
    if (!raw.trim()) return;
    start(async () => {
      const r = await addIdeaAction(tripId, raw);
      if (r.ok) {
        setValue("");
        input.current?.focus();
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
      <label htmlFor="add-idea" className="sr-only">
        Paste a link or type an idea
      </label>
      <input
        ref={input}
        id="add-idea"
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
        placeholder="Paste a TikTok, link, or idea"
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" size="sm" loading={pending} aria-label="Add idea">
        {!pending && <Plus aria-hidden />}
        Add
      </Button>
    </form>
  );
}
