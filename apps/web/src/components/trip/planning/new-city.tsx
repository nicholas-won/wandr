"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPinPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { addStopAction, keepCityAction } from "@/app/t/[tripId]/stops/actions";

type StopRef = { id: string; name: string; isDefault: boolean };

/**
 * FR-S6: "New city: Porto, add as a Stop?" Organizers only. "Keep" files the ideas into an
 * existing Stop instead (day trips, S-2) and the question doesn't come back.
 */
export function NewCityPrompt({
  tripId,
  city,
  count,
  stops,
}: {
  tripId: string;
  city: string;
  count: number;
  stops: StopRef[];
}) {
  const [busy, start] = useTransition();
  const [keepIn, setKeepIn] = useState(stops[0]?.id ?? "");
  const { toast } = useToast();
  const router = useRouter();
  const unnamedFirst = stops.length === 1 && !stops[0]!.name;
  const [firstName, setFirstName] = useState("");

  const done = (r: { ok: boolean; error?: string; signin?: string; message?: string }) => {
    if (!r.ok) {
      if (r.signin) router.push(r.signin);
      else toast({ title: r.error ?? "Try again", variant: "error" });
    } else if (r.message) toast({ title: r.message });
  };

  return (
    <div className="rounded-xl border border-primary/40 bg-card p-4" role="region" aria-label={`New city: ${city}`}>
      <p className="flex items-center gap-2 font-semibold">
        <MapPinPlus className="size-5 text-primary" aria-hidden />
        New city: {city}, add as a Stop?
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {count} {count === 1 ? "idea is" : "ideas are"} in {city}.
      </p>
      {unnamedFirst ? (
        <div className="mt-3 space-y-1">
          <Label htmlFor={`first-${city}`}>Where is the rest of the trip?</Label>
          <Input id={`first-${city}`} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Lisbon" maxLength={60} />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={unnamedFirst && !firstName.trim()}
          onClick={() => start(async () => done(await addStopAction(tripId, { name: city, firstStopName: firstName || null })))}
        >
          Add {city}
        </Button>
        {stops.length ? (
          <span className="inline-flex items-center gap-1 text-sm">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => start(async () => done(await keepCityAction(tripId, city, keepIn)))}
            >
              Keep in
            </Button>
            {stops.length > 1 ? (
              <select
                aria-label="Stop to keep these ideas in"
                value={keepIn}
                onChange={(e) => setKeepIn(e.target.value)}
                className="h-10 rounded-full border border-input bg-card px-3 text-sm"
              >
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || "this trip"}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-semibold">{stops[0]!.name || "this trip"}</span>
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Organizer adds a Stop by name (or a city idea, FR-S5). */
export function AddStopForm({ tripId, needsFirstName }: { tripId: string; needsFirstName: boolean }) {
  const [busy, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        start(async () => {
          const r = await addStopAction(tripId, {
            name: String(f.get("name") ?? ""),
            firstStopName: needsFirstName ? String(f.get("first") ?? "") : null,
          });
          if (!r.ok) {
            if (r.signin) router.push(r.signin);
            else toast({ title: r.error, variant: "error" });
            return;
          }
          form.reset();
          if (r.message) toast({ title: r.message });
        });
      }}
    >
      {needsFirstName ? (
        <div className="space-y-1">
          <Label htmlFor="first-stop">First stop</Label>
          <Input id="first-stop" name="first" required maxLength={60} placeholder="e.g. Lisbon" />
        </div>
      ) : null}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="add-stop" className="sr-only">
            City or area
          </Label>
          <Input id="add-stop" name="name" required maxLength={60} placeholder="Add a city, e.g. Porto" />
        </div>
        <Button type="submit" variant="secondary" loading={busy}>
          Add Stop
        </Button>
      </div>
    </form>
  );
}

/** FR-S5: cities are ideas. Organizers turn a proposed city into a Stop. */
export function CityIdeaRow({
  tripId,
  idea,
  isOrganizer,
  needsFirstName,
}: {
  tripId: string;
  idea: { id: string; title: string; status: string };
  isOrganizer: boolean;
  needsFirstName: boolean;
}) {
  const [busy, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const [first, setFirst] = useState("");
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3">
      <span className="flex-1 font-semibold">🏙️ {idea.title}</span>
      {idea.status === "planned" ? (
        <span className="text-xs font-semibold text-muted-foreground">Added as a Stop</span>
      ) : isOrganizer ? (
        <>
          {needsFirstName ? (
            <Input
              aria-label="Name of your first stop"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="First stop"
              className="h-10 w-32"
            />
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={needsFirstName && !first.trim()}
            onClick={() =>
              start(async () => {
                const r = await addStopAction(tripId, { name: idea.title, cityIdeaId: idea.id, firstStopName: first || null });
                if (!r.ok) {
                  if (r.signin) router.push(r.signin);
                  else toast({ title: r.error, variant: "error" });
                }
              })
            }
          >
            Add as Stop
          </Button>
        </>
      ) : null}
    </li>
  );
}
