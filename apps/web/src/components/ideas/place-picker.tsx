"use client";

/**
 * Search to pick a place: "wrong place? fix" (FR-23, FR-32) and add by hand (FR-L20).
 * Google Places runs on the server; this debounces typing and shows 5 results (name, address,
 * rating). Never AI, never an import (FR-L22). With no Google key it says search isn't
 * connected and offers "Just rename it" only.
 */
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { MapPin, Search, Star } from "lucide-react";
import type { PlaceSearchResult } from "@wandr/ai/places";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { placeSearchStatusAction } from "@/app/place-search-actions";

export type PickerResult = { ok: true; message?: string } | { ok: false; error: string; signin?: string };
type Outcome = { connected: false } | { connected: true; results: PlaceSearchResult[] } | { connected: true; rateLimited: true };
export type SearchFn = (query: string) => Promise<{ ok: true; outcome?: Outcome } | { ok: false; error: string; signin?: string }>;

const DEBOUNCE_MS = 350;

export function PlacePicker({
  search,
  onPick,
  rename,
  onCancel,
  onError,
  label = "Search for the place",
  initialQuery = "",
  autoFocus = true,
  className,
}: {
  search: SearchFn;
  onPick: (placeId: string) => Promise<PickerResult>;
  /** "Just rename it" for ideas that aren't a specific place. */
  rename?: { defaultValue: string; onRename: (title: string) => Promise<PickerResult> };
  onCancel?: () => void;
  /** Called with a failed result (toast, or route to sign-in). */
  onError: (r: Extract<PickerResult, { ok: false }>) => void;
  label?: string;
  initialQuery?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"search" | "rename">("search");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    placeSearchStatusAction()
      .then((r) => live && setConnected(r.connected))
      .catch(() => live && setConnected(false));
    return () => {
      live = false;
    };
  }, []);

  // Debounced search; only the latest response is shown.
  useEffect(() => {
    if (!connected || mode !== "search") return;
    const q = query.trim();
    if (q.length < 2) return; // results/note are hidden below 2 characters
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await search(q).catch(() => ({ ok: false as const, error: "Search failed. Try again." }));
      if (mine !== seq.current) return;
      setSearching(false);
      if (!r.ok) {
        onError(r);
        return;
      }
      const o = r.outcome;
      if (!o || !o.connected) {
        setConnected(false);
      } else if ("rateLimited" in o) {
        setNote("Lots of searches. Wait a moment and try again.");
      } else {
        setResults(o.results);
        setNote(o.results.length ? null : "No places found. Try adding the city.");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `search` and `onError` are callbacks from the parent; re-running on identity changes would re-query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, connected, mode]);

  const pick = (placeId: string) =>
    start(async () => {
      const r = await onPick(placeId);
      if (!r.ok) onError(r);
    });

  const typed = query.trim().length >= 2;
  const showRename = rename && (mode === "rename" || connected === false);

  return (
    <div className={cn("space-y-3", className)}>
      {connected === false ? (
        <p className="text-sm text-muted-foreground" role="status">
          Place search isn&apos;t connected{rename ? ", so you can rename it instead." : "."}
        </p>
      ) : null}

      {connected && mode === "search" ? (
        <>
          <div className="relative">
            <label htmlFor={`${id}-q`} className="sr-only">
              {label}
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={`${id}-q`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus={autoFocus}
              autoComplete="off"
              placeholder="Place name and city"
              className="pl-9"
              aria-describedby={`${id}-status`}
            />
          </div>
          <p id={`${id}-status`} className="sr-only" role="status">
            {searching ? "Searching…" : typed && results ? `${results.length} places found` : ""}
          </p>
          {typed && note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
          {typed && results?.length ? (
            <ul className="divide-y overflow-hidden rounded-xl border" aria-label="Places">
              {results.map((p) => (
                <li key={p.placeId}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => pick(p.placeId)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted disabled:opacity-60"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-tight">{p.name}</span>
                      {p.address ? <span className="block truncate text-xs text-muted-foreground">{p.address}</span> : null}
                      {p.permanentlyClosed ? <span className="block text-xs font-semibold text-destructive">Permanently closed</span> : null}
                    </span>
                    {p.rating != null ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold">
                        <Star className="size-3.5 fill-current text-amber-500" aria-hidden />
                        {p.rating.toFixed(1)}
                        <span className="sr-only"> stars</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {showRename ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const title = String(new FormData(e.currentTarget).get("title") ?? "");
            start(async () => {
              const r = await rename.onRename(title);
              if (!r.ok) onError(r);
            });
          }}
        >
          <label htmlFor={`${id}-name`} className="sr-only">
            Name
          </label>
          <Input id={`${id}-name`} name="title" defaultValue={rename.defaultValue} autoFocus className="h-10" />
          <Button type="submit" size="sm" loading={pending}>
            Save
          </Button>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {rename && connected && mode === "search" ? (
          <button type="button" className="font-semibold text-muted-foreground hover:text-foreground" onClick={() => setMode("rename")}>
            Just rename it
          </button>
        ) : null}
        {rename && connected && mode === "rename" ? (
          <button type="button" className="font-semibold text-muted-foreground hover:text-foreground" onClick={() => setMode("search")}>
            Search places instead
          </button>
        ) : null}
        {onCancel ? (
          <button type="button" className="font-semibold text-muted-foreground hover:text-foreground" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
