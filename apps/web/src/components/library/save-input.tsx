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
import { boardAddAction, saveAction, savePlaceAction, searchLibraryPlacesAction } from "@/app/library/actions";
import { libraryRoutes } from "@/lib/library-routes";

/**
 * FR-L1 / FR-L14: paste a link, type an idea or add a screenshot, with no trip. One field, one
 * button (P3). With `boardId`, the save goes onto that board (anyone on it can add); screenshots
 * and place search are for your own library only.
 */
export function SaveInput({ boardId, autoFocus }: { boardId?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  const [tab, setTab] = useState("paste");
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  function saved(id: string | undefined, title: string) {
    toast({ title, action: id ? { label: "View", onClick: () => router.push(libraryRoutes.save(id)) } : undefined });
  }

  function submit(raw: string) {
    if (!raw.trim()) return;
    start(async () => {
      const r = boardId ? await boardAddAction(boardId, raw) : await saveAction(raw);
      if (r.ok) {
        setValue("");
        input.current?.focus();
        const id = "savedIdeaId" in r && typeof r.savedIdeaId === "string" ? r.savedIdeaId : undefined;
        saved(id, boardId ? "Added to the board. Sorting it now…" : "Saved. Sorting it now…");
      } else if (r.signin) {
        router.push(r.signin);
      } else {
        toast({ title: r.error, variant: "error" });
      }
    });
  }

  function addImage(file: File) {
    if (boardId) return;
    start(async () => {
      const r = await uploadScreenshot("/library/screenshot", file, value);
      if (r.ok) {
        setValue("");
        saved(r.id, "Screenshot saved. Reading it now…");
        router.refresh();
      } else if (r.signin) {
        router.push(r.signin);
      } else {
        toast({ title: r.error, variant: "error" });
      }
    });
  }

  const drop = useImageDrop(addImage);

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      {...(boardId ? {} : drop.handlers)}
      className={cn(
        "flex items-center gap-1 rounded-full border border-input bg-card p-1.5 pl-5 shadow-sm focus-within:ring-2 focus-within:ring-ring",
        drop.over && "border-primary ring-2 ring-primary",
      )}
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
          if (!boardId && drop.pasteImage(e)) return;
          const text = e.clipboardData.getData("text");
          if (/^https?:\/\//i.test(text.trim()) && !value) {
            e.preventDefault();
            setValue(text);
            submit(text);
          }
        }}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={
          drop.over ? "Drop the screenshot" : boardId ? "Add a TikTok, link, or place" : "Save a TikTok, link, or place"
        }
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
      />
      {boardId ? null : <ImageButton onFile={addImage} disabled={pending} />}
      <Button type="submit" size="sm" loading={pending}>
        {!pending && <Plus aria-hidden />}
        {boardId ? "Add" : "Save"}
      </Button>
    </form>
  );

  if (boardId) return form;

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList label="Save something" className="h-9 bg-transparent p-0">
        <TabsTrigger value="paste" className="h-8 flex-none px-3 text-xs">
          Paste or type
        </TabsTrigger>
        <TabsTrigger value="search" className="h-8 flex-none px-3 text-xs">
          Search for a place
        </TabsTrigger>
      </TabsList>
      <TabsContent value="paste" className="mt-2">
        {form}
      </TabsContent>
      <TabsContent value="search" className="mt-2 rounded-2xl border bg-card p-3 shadow-sm">
        <PlacePicker
          label="Search for a place to save"
          search={(q) => searchLibraryPlacesAction(q)}
          onPick={async (placeId) => {
            const r = await savePlaceAction(placeId);
            if (r.ok) {
              saved(r.savedIdeaId, r.merged ? "Already saved." : "Saved.");
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
