"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { PlacePicker } from "@/components/ideas/place-picker";
import { ImageButton, uploadScreenshot, useImageDrop } from "@/components/ideas/screenshot-drop";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { addIdeaAction, addPlaceAction, searchPlacesAction } from "@/app/t/[tripId]/actions";

/**
 * FR-20: paste a TikTok / IG / Maps link, type an idea, or add a screenshot (button, pasted
 * image, or drop). One field, one button (P3). The second tab adds a place by search, free and
 * with no AI (FR-L20).
 */
export function AddIdea({ tripId, autoFocus }: { tripId: string; autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  const [tab, setTab] = useState("paste");
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

  function addImage(file: File) {
    start(async () => {
      // Whatever is typed in the box goes along as a note (untrusted, C-21).
      const r = await uploadScreenshot(`/t/${tripId}/screenshot`, file, value);
      if (r.ok) {
        setValue("");
        toast({ title: "Screenshot added. Reading it now…" });
        router.refresh();
      } else if (r.signin) {
        router.push(r.signin);
      } else {
        toast({ title: r.error, variant: "error" });
      }
    });
  }

  const drop = useImageDrop(addImage);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList label="Add an idea" className="h-9 bg-transparent p-0">
        <TabsTrigger value="paste" className="h-8 flex-none px-3 text-xs">
          Paste or type
        </TabsTrigger>
        <TabsTrigger value="search" className="h-8 flex-none px-3 text-xs">
          Search for a place
        </TabsTrigger>
      </TabsList>
      <TabsContent value="paste" className="mt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          {...drop.handlers}
          className={cn(
            "flex items-center gap-1 rounded-full border border-input bg-card p-1.5 pl-5 shadow-sm focus-within:ring-2 focus-within:ring-ring",
            drop.over && "border-primary ring-2 ring-primary",
          )}
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
              if (drop.pasteImage(e)) return;
              const text = e.clipboardData.getData("text");
              if (/^https?:\/\//i.test(text.trim()) && !value) {
                e.preventDefault();
                setValue(text);
                submit(text);
              }
            }}
            autoFocus={autoFocus}
            autoComplete="off"
            placeholder={drop.over ? "Drop the screenshot" : "Paste a TikTok, link, or idea"}
            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
          />
          <ImageButton onFile={addImage} disabled={pending} />
          <Button type="submit" size="sm" loading={pending} aria-label="Add idea">
            {!pending && <Plus aria-hidden />}
            Add
          </Button>
        </form>
      </TabsContent>
      <TabsContent value="search" className="mt-2 rounded-2xl border bg-card p-3 shadow-sm">
        <PlacePicker
          label="Search for a place to add"
          search={(q) => searchPlacesAction(tripId, q)}
          onPick={async (placeId) => {
            const r = await addPlaceAction(tripId, placeId);
            if (r.ok) {
              toast({ title: r.message ?? "Added." });
              setTab("paste");
            }
            return r;
          }}
          onError={(r) => (r.signin ? router.push(r.signin) : toast({ title: r.error, variant: "error" }))}
        />
      </TabsContent>
    </Tabs>
  );
}
