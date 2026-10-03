"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, HelpCircle, Pencil, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  moveStopAction,
  removeStopAction,
  setAttendanceAction,
  updateStopAction,
} from "@/app/t/[tripId]/stops/actions";
import type { StopRemovalPreview, StopView, UpdateStopResult } from "@/server/planning";

type Choices = Extract<UpdateStopResult, { reason: "needs_choices" }>;

const DATE_ERRORS: Record<string, string> = {
  invalid_date: "That date doesn't exist.",
  end_before_start: "The last day is before the first.",
  nights_out_of_range: "Pick 0 to 60 nights.",
  name_required: "Give the Stop a name.",
};

/** One Stop: who's going (FR-S7), and for organizers name/dates/nights/order (FR-S5, FR-S10). */
export function StopCard({
  tripId,
  stop,
  meId,
  isOrganizer,
  canMarkAttendance,
  isFirst,
  isLast,
  showOrder,
  warning,
}: {
  tripId: string;
  stop: StopView;
  meId: string;
  isOrganizer: boolean;
  canMarkAttendance: boolean;
  isFirst: boolean;
  isLast: boolean;
  showOrder: boolean;
  warning: string | null;
}) {
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [choices, setChoices] = useState<{ ask: Choices; input: Parameters<typeof updateStopAction>[1] } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removalPreview, setRemovalPreview] = useState<StopRemovalPreview | null>(null);
  const [settingOthers, setSettingOthers] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const fail = (r: { error: string; signin?: string }) => (r.signin ? router.push(r.signin) : toast({ title: r.error, variant: "error" }));

  function attend(next: boolean | null) {
    const prev = stop.myAttendance === "assumed" ? null : stop.myAttendance === "yes";
    start(async () => {
      const r = await setAttendanceAction(tripId, stop.id, meId, next);
      if (!r.ok) return fail(r);
      toast({
        title: next === false ? `Not going to ${stop.name || "this Stop"}` : `You're in for ${stop.name || "this Stop"}`,
        action: { label: "Undo", onClick: () => start(async () => void (await setAttendanceAction(tripId, stop.id, meId, prev))) },
      });
    });
  }

  /** Q13: an organizer marks someone else's attendance. */
  function setFor(memberId: string, name: string, next: boolean | null) {
    start(async () => {
      const r = await setAttendanceAction(tripId, stop.id, memberId, next);
      if (!r.ok) return fail(r);
      toast({
        title:
          next === null
            ? `${name}: not confirmed`
            : next
              ? `${name} is going to ${stop.name || "this Stop"}`
              : `${name} isn't going to ${stop.name || "this Stop"}`,
      });
    });
  }

  function save(input: Parameters<typeof updateStopAction>[1]) {
    start(async () => {
      const r = await updateStopAction(tripId, input);
      if (!r.ok) return fail(r);
      const res = r.result;
      if (res.ok) {
        setEditing(false);
        setChoices(null);
        toast({ title: "Saved" });
      } else if (res.reason === "needs_choices") setChoices({ ask: res, input });
      else toast({ title: DATE_ERRORS[res.error] ?? "Check the dates.", variant: "error" });
    });
  }

  const going = stop.attendees.filter((a) => a.state !== "no");
  const notGoing = stop.attendees.filter((a) => a.state === "no");

  return (
    <Card className="p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold leading-tight">{stop.label}</h3>
          <p className="text-sm text-muted-foreground">
            {stop.ideaCount} {stop.ideaCount === 1 ? "idea" : "ideas"}
          </p>
          {warning ? <p className="mt-1 text-xs font-semibold text-accent-foreground">{warning}</p> : null}
        </div>
        {isOrganizer ? (
          <div className="flex shrink-0 gap-1">
            {showOrder ? (
              <>
                <IconBtn label={`Move ${stop.name} earlier`} disabled={busy || isFirst} onClick={() => start(async () => void (await moveStopAction(tripId, stop.id, -1)))}>
                  <ArrowUp />
                </IconBtn>
                <IconBtn label={`Move ${stop.name} later`} disabled={busy || isLast} onClick={() => start(async () => void (await moveStopAction(tripId, stop.id, 1)))}>
                  <ArrowDown />
                </IconBtn>
              </>
            ) : null}
            <IconBtn label={`Edit ${stop.name || "Stop"}`} onClick={() => setEditing((e) => !e)}>
              <Pencil />
            </IconBtn>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form
          className="mt-3 space-y-3 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const nights = String(f.get("nights") ?? "").trim();
            save({
              stopId: stop.id,
              name: String(f.get("name") ?? ""),
              startDate: String(f.get("start") ?? "") || null,
              endDate: String(f.get("end") ?? "") || null,
              nights: nights === "" ? null : Number(nights),
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`n-${stop.id}`}>City or area</Label>
            <Input id={`n-${stop.id}`} name="name" defaultValue={stop.name} maxLength={60} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`s-${stop.id}`}>First day</Label>
              <Input id={`s-${stop.id}`} name="start" type="date" defaultValue={stop.startDate ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`e-${stop.id}`}>Last day</Label>
              <Input id={`e-${stop.id}`} name="end" type="date" defaultValue={stop.endDate ?? ""} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`k-${stop.id}`}>Or roughly how many nights</Label>
            <Input id={`k-${stop.id}`} name="nights" type="number" min={0} max={60} inputMode="numeric" defaultValue={stop.startDate && stop.endDate ? "" : (stop.nights ?? "")} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {showOrder ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                <Trash2 aria-hidden /> Remove Stop
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={busy}>
                Save
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {stop.needsDay.length ? (
        <p className="mt-3 rounded-lg bg-accent/60 px-3 py-2 text-sm text-accent-foreground">
          Needs a day: {stop.needsDay.map((n) => n.title).join(", ")}
        </p>
      ) : null}

      <div className="mt-3 border-t pt-3">
        <p className="text-sm font-semibold">Who&apos;s going</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {going.map((a) => (
            <li key={a.memberId} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pl-1 pr-3 text-sm">
              <Avatar name={a.name} className="size-6 text-[10px]" />
              {a.memberId === meId ? "You" : a.name}
              {a.state === "assumed" ? (
                <span title="Hasn't said yet; counted as going" className="text-muted-foreground">
                  <HelpCircle className="size-3.5" aria-label="not confirmed" />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {notGoing.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Not going: {notGoing.map((a) => (a.memberId === meId ? "You" : a.name)).join(", ")}
          </p>
        ) : null}
        {canMarkAttendance ? (
          <div role="group" aria-label={`Are you going to ${stop.name || "this Stop"}?`} className="mt-3 grid grid-cols-2 gap-2">
            <AttendBtn on={stop.myAttendance === "yes"} disabled={busy} onClick={() => attend(stop.myAttendance === "yes" ? null : true)}>
              <Check aria-hidden /> I&apos;m going
            </AttendBtn>
            <AttendBtn on={stop.myAttendance === "no"} disabled={busy} onClick={() => attend(stop.myAttendance === "no" ? null : false)}>
              <X aria-hidden /> Not going
            </AttendBtn>
          </div>
        ) : null}
        {/* Q13: organizers can set attendance for other members. */}
        {isOrganizer && canMarkAttendance && stop.attendees.some((a) => a.memberId !== meId) ? (
          settingOthers ? (
            <ul className="mt-3 space-y-2 border-t pt-3" aria-label="Set who's going">
              {stop.attendees
                .filter((a) => a.memberId !== meId)
                .map((a) => (
                  <li key={a.memberId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                    <ChoiceBtn
                      on={a.state === "yes"}
                      disabled={busy}
                      onClick={() => setFor(a.memberId, a.name, a.state === "yes" ? null : true)}
                    >
                      Going
                    </ChoiceBtn>
                    <ChoiceBtn
                      on={a.state === "no"}
                      disabled={busy}
                      onClick={() => setFor(a.memberId, a.name, a.state === "no" ? null : false)}
                    >
                      Not going
                    </ChoiceBtn>
                  </li>
                ))}
              <li>
                <Button variant="link" size="sm" onClick={() => setSettingOthers(false)}>
                  Done
                </Button>
              </li>
            </ul>
          ) : (
            <Button variant="link" size="sm" className="mt-1" onClick={() => setSettingOthers(true)}>
              Set for others
            </Button>
          )
        ) : null}
      </div>

      <Dialog
        open={!!choices}
        onOpenChange={(o) => !o && setChoices(null)}
        title="These dates move some plans"
        description={
          choices && choices.ask.deltaDays
            ? `The Stop moves by ${Math.abs(choices.ask.deltaDays)} ${Math.abs(choices.ask.deltaDays) === 1 ? "day" : "days"}. Choose for each one.`
            : "Choose for each one."
        }
      >
        {choices ? (
          <DateChoices
            ask={choices.ask}
            busy={busy}
            onCancel={() => setChoices(null)}
            onSave={(c) => save({ ...choices.input, choices: c })}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={confirmRemove}
        onOpenChange={(o) => {
          setConfirmRemove(o);
          if (!o) setRemovalPreview(null);
        }}
        title={`Remove ${stop.name || "this Stop"}?`}
        description={`Its ${stop.ideaCount} ${stop.ideaCount === 1 ? "idea goes" : "ideas go"} to Unsorted with their votes. Attendance for it is cleared.`}
      >
        {/* ST5: show what else happens before the organizer confirms. */}
        {removalPreview ? <RemovalPreviewList preview={removalPreview} /> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setConfirmRemove(false);
              setRemovalPreview(null);
            }}
          >
            Keep it
          </Button>
          <Button
            variant="destructive"
            loading={busy}
            onClick={() =>
              start(async () => {
                const r = await removeStopAction(tripId, stop.id, !!removalPreview);
                if (!r.ok) {
                  setConfirmRemove(false);
                  return fail(r);
                }
                if (!r.result.ok) return setRemovalPreview(r.result.preview);
                setConfirmRemove(false);
                setRemovalPreview(null);
                toast({ title: `Removed ${stop.name || "the Stop"}` });
              })
            }
          >
            {removalPreview ? "Remove anyway" : "Remove"}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

/** FR-S10: per item, shift with the Stop or unschedule ("needs a day"). Polls are left alone (ST2). */
function DateChoices({
  ask,
  busy,
  onCancel,
  onSave,
}: {
  ask: Choices;
  busy: boolean;
  onCancel: () => void;
  onSave: (c: Record<string, "shift" | "unschedule">) => void;
}) {
  const [c, setC] = useState<Record<string, "shift" | "unschedule">>(() =>
    Object.fromEntries(ask.planItems.filter((i) => !i.canShift).map((i) => [i.id, "unschedule" as const])),
  );
  const rows = ask.planItems.map((i) => ({
    id: i.id,
    title: `${i.title} (Day ${i.dayIndex + 1})`,
    canShift: i.canShift,
    shift: "Keep on Day " + (i.dayIndex + 1),
    other: "Needs a day",
  }));
  const complete = rows.every((r) => c[r.id]);
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <fieldset>
              <legend className="text-sm font-semibold">{r.title}</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <ChoiceBtn on={c[r.id] === "shift"} disabled={!r.canShift} onClick={() => setC({ ...c, [r.id]: "shift" })}>
                  {r.canShift ? r.shift : "Doesn't fit"}
                </ChoiceBtn>
                <ChoiceBtn on={c[r.id] === "unschedule"} onClick={() => setC({ ...c, [r.id]: "unschedule" })}>
                  {r.other}
                </ChoiceBtn>
              </div>
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!complete} loading={busy} onClick={() => onSave(c)}>
          Save dates
        </Button>
      </div>
    </div>
  );
}

/** ST5: what removing the city does beyond moving its ideas. */
function RemovalPreviewList({ preview }: { preview: StopRemovalPreview }) {
  const lines: string[] = [];
  if (preview.pollsToClose.length) {
    lines.push(
      `${preview.pollsToClose.length === 1 ? "This poll closes" : `${preview.pollsToClose.length} polls close`}: ${preview.pollsToClose
        .map((p) => p.question)
        .join(", ")}`,
    );
  }
  if (preview.otherPolls) lines.push(`${preview.otherPolls} finished ${preview.otherPolls === 1 ? "poll stays" : "polls stay"}, no longer tied to this city`);
  if (preview.planItems.length) {
    lines.push(
      `${preview.planItems.length === 1 ? "This planned item is" : `${preview.planItems.length} planned items are`} removed: ${preview.planItems
        .map((p) => p.title)
        .join(", ")}`,
    );
  }
  if (preview.expenses) {
    lines.push(`${preview.expenses} ${preview.expenses === 1 ? "expense stays" : "expenses stay"} in Money, just not tied to this city`);
  }
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function ChoiceBtn({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full border px-3 text-sm font-semibold disabled:opacity-50",
        on ? "border-foreground bg-foreground text-background" : "border-input bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function AttendBtn({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold transition active:scale-[0.97] [&_svg]:size-4",
        on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
