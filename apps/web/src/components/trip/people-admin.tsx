"use client";

/**
 * People-page controls for joining and roles (FR-2, FR-8, FR-9, FR-11, M-4, M-11, FR-T3..T5).
 * Everything is hidden until needed (P2); destructive actions preview first (P7).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, MoreHorizontal, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  addManagedAction,
  balanceAction,
  decideRequestAction,
  dismissNoticeAction,
  leaveTripAction,
  removeMemberAction,
  restoreMemberAction,
  setOrganizerAction,
  type BalanceLine,
} from "@/app/t/[tripId]/people/actions";

type Result = { ok: true; message?: string } | { ok: false; error: string; signin?: string };

function useRun() {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const run = React.useCallback(
    (fn: () => Promise<Result>, onOk?: () => void) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) {
          if (r.signin) router.push(r.signin);
          else toast({ title: r.error, variant: "error" });
          return;
        }
        if (r.message) toast({ title: r.message });
        onOk?.();
      }),
    [router, toast],
  );
  return { pending, run };
}

// ---------------------------------------------------------------------------
// One-time size notices (FR-T3, FR-T4, FR-T5)
// ---------------------------------------------------------------------------

const NOTICE_COPY: Record<string, { title: string; body: string }> = {
  solo_to_duo: {
    title: "In 2-person trips, you'll see each other's votes",
    body: "Your priorities so far become your votes, and the other person will see them.",
  },
  duo_to_group: {
    title: "Voting is blind from now on",
    body: "With 3 or more people, votes stay hidden until you vote. You two still see each other's earlier votes.",
  },
  group_to_duo: {
    title: "It's just the two of you now",
    body: "New votes are visible to each other. Votes cast while you were a group stay anonymous.",
  },
};

export function SizeNotice({ tripId, memberId, notice }: { tripId: string; memberId: string; notice: string }) {
  const { pending, run } = useRun();
  const c = NOTICE_COPY[notice];
  if (!c) return null;
  return (
    <div role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="font-semibold">{c.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
      <Button
        size="sm"
        variant="outline"
        className="mt-3"
        loading={pending}
        onClick={() => run(() => dismissNoticeAction(tripId, memberId, notice))}
      >
        Got it
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Join requests (FR-8, J-20)
// ---------------------------------------------------------------------------

export function JoinRequestActions({ tripId, memberId, name }: { tripId: string; memberId: string; name: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        aria-label={`Deny ${name}`}
        disabled={pending}
        onClick={() => run(() => decideRequestAction(tripId, memberId, false))}
      >
        <X aria-hidden /> Deny
      </Button>
      <Button
        size="sm"
        aria-label={`Approve ${name}`}
        loading={pending}
        onClick={() => run(() => decideRequestAction(tripId, memberId, true))}
      >
        <Check aria-hidden /> Approve
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member menu: organizer role and removal (FR-2, FR-9, D24)
// ---------------------------------------------------------------------------

type Other = { id: string; displayName: string };

function BalanceList({ balances, name, you }: { balances: BalanceLine[]; name: string; you?: boolean }) {
  return (
    <ul className="space-y-1 rounded-lg bg-muted p-3 text-sm">
      {balances.map((b) => (
        <li key={b.currency}>
          {b.balanceMinor < 0
            ? `${you ? "You owe" : `${name} owes`} ${b.label}`
            : `${you ? "You're" : `${name} is`} owed ${b.label}`}
        </li>
      ))}
    </ul>
  );
}

export function MemberMenu({
  tripId,
  member,
  others,
}: {
  tripId: string;
  member: { id: string; displayName: string; role: string; managed: boolean };
  /** Active members who'd stay (for "reassign to"). */
  others: Other[];
}) {
  const [open, setOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [balances, setBalances] = React.useState<BalanceLine[] | null>(null);
  const [choice, setChoice] = React.useState<"reassign" | "split_group" | "write_off">("split_group");
  const [toMemberId, setTo] = React.useState(others[0]?.id ?? "");
  const { pending, run } = useRun();
  const { toast } = useToast();
  const [loading, start] = useTransition();
  const close = () => {
    setOpen(false);
    setRemoving(false);
    setBalances(null);
  };

  const startRemove = () =>
    start(async () => {
      const r = await balanceAction(tripId, member.id);
      if (!r.ok) return toast({ title: r.error, variant: "error" });
      setBalances(r.balances);
      setRemoving(true);
    });

  const confirmRemove = () =>
    run(
      () =>
        removeMemberAction(
          tripId,
          member.id,
          balances && balances.length > 0
            ? choice === "reassign"
              ? { kind: "reassign", toMemberId }
              : { kind: choice }
            : undefined,
        ),
      close,
    );

  return (
    <>
      <Button size="icon" variant="ghost" className="size-10" aria-label={`Options for ${member.displayName}`} onClick={() => setOpen(true)}>
        <MoreHorizontal aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title={member.displayName}>
        {!removing ? (
          <div className="flex flex-col gap-2">
            {member.managed ? null : member.role === "organizer" ? (
              <Button variant="outline" block loading={pending} onClick={() => run(() => setOrganizerAction(tripId, member.id, false), close)}>
                Remove as organizer
              </Button>
            ) : (
              <Button variant="outline" block loading={pending} onClick={() => run(() => setOrganizerAction(tripId, member.id, true), close)}>
                Make organizer
              </Button>
            )}
            <Button variant="ghost" block className="text-destructive" loading={loading} onClick={startRemove}>
              Remove from trip
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {member.displayName} loses access right away. Their ideas, votes and expenses stay, marked &quot;former member&quot;. You
              can restore them for 30 days.
            </p>
            {balances && balances.length > 0 ? (
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">Settle their balance first</legend>
                <BalanceList balances={balances} name={member.displayName} />
                {(
                  [
                    ["split_group", "Split it across the group"],
                    ["reassign", "Move it to someone else"],
                    ["write_off", "Write it off"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name="resolution"
                      value={value}
                      checked={choice === value}
                      onChange={() => setChoice(value)}
                      className="size-5 accent-primary"
                    />
                    {label}
                  </label>
                ))}
                {choice === "reassign" ? (
                  <div className="space-y-1">
                    <Label htmlFor="reassign-to">Move to</Label>
                    <select
                      id="reassign-to"
                      value={toMemberId}
                      onChange={(e) => setTo(e.target.value)}
                      className="h-12 w-full rounded-lg border border-input bg-card px-3"
                    >
                      {others.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </fieldset>
            ) : null}
            <Button variant="destructive" block loading={pending} onClick={confirmRemove}>
              Remove {member.displayName}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

export function RestoreButton({ tripId, memberId, name }: { tripId: string; memberId: string; name: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" loading={pending} aria-label={`Restore ${name}`} onClick={() => run(() => restoreMemberAction(tripId, memberId))}>
      Restore
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Leave (M-4) and managed members (FR-11)
// ---------------------------------------------------------------------------

export function LeaveTrip({ tripId, memberId, isOwner }: { tripId: string; memberId: string; isOwner: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [balances, setBalances] = React.useState<BalanceLine[] | null>(null);
  const [loading, start] = useTransition();
  const { pending, run } = useRun();
  const { toast } = useToast();
  const openSheet = () =>
    start(async () => {
      if (!isOwner) {
        const r = await balanceAction(tripId, memberId);
        if (!r.ok) return toast({ title: r.error, variant: "error" });
        setBalances(r.balances);
      }
      setOpen(true);
    });
  return (
    <>
      <Button variant="link" className="text-muted-foreground" loading={loading} onClick={openSheet}>
        Leave trip
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Leave this trip?">
        {isOwner ? (
          <p className="text-sm text-muted-foreground">You own this trip. Hand it to someone else in Settings first.</p>
        ) : (
          <div className="space-y-4">
            {balances && balances.length > 0 ? (
              <>
                <BalanceList balances={balances} name="" you />
                <p className="text-sm text-muted-foreground">This stays on the trip after you leave. Settle up with the group.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">You&apos;re all settled up.</p>
            )}
            <Button variant="destructive" block loading={pending} onClick={() => run(() => leaveTripAction(tripId))}>
              Leave trip
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

export function AddManagedMember({ tripId }: { tripId: string }) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useRun();
  if (!open) {
    return (
      <Button variant="link" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden /> Add someone without a phone
      </Button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const name = String(new FormData(form).get("name") ?? "");
        run(() => addManagedAction(tripId, name), () => {
          form.reset();
          setOpen(false);
        });
      }}
    >
      <Label htmlFor="managed-name">Their name</Label>
      <div className="flex gap-2">
        <Input id="managed-name" name="name" required maxLength={40} placeholder="Leo" autoFocus />
        <Button type="submit" loading={pending}>
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">For a kid or a partner on your phone. You vote and split for them.</p>
    </form>
  );
}
