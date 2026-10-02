"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Copy, Link2, RefreshCw } from "lucide-react";
import { APP_NAME } from "@wandr/core/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { regenerateGroupLinkAction, transferOwnershipAction, updateJoinSettingsAction } from "./actions";

type Result = { ok: true; message?: string } | { ok: false; error: string; signin?: string };

function useRun() {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<Result>, onOk?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
        return;
      }
      if (r.message) toast({ title: r.message });
      onOk?.(r);
    });
  return { pending, run, toast };
}

/** FR-6 / FR-10 / J-7. Hidden behind one button for duos (§6.10 "group link hidden by default"). */
export function GroupLinkCard({
  tripId,
  url,
  paused,
  size,
}: {
  tripId: string;
  url: string | null;
  paused: boolean;
  size: string;
}) {
  const { pending, run, toast } = useRun();
  const [confirm, setConfirm] = React.useState(false);
  const make = () => run(() => regenerateGroupLinkAction(tripId), () => setConfirm(false));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group link</CardTitle>
        <p className="text-sm text-muted-foreground">
          Paste it in your group chat. People confirm their number; anyone not on your invite list waits for your OK.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {paused ? (
          <p role="status" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
            Paused after 20 people asked to join. Make a new link to turn it back on.
          </p>
        ) : null}
        {url ? (
          <>
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Group link" onFocus={(e) => e.currentTarget.select()} />
              <Button
                size="icon"
                variant="outline"
                aria-label="Copy or share the link"
                onClick={async () => {
                  try {
                    if (navigator.share) await navigator.share({ text: `Join our trip on ${APP_NAME}: ${url}` });
                    else {
                      await navigator.clipboard.writeText(url);
                      toast({ title: "Link copied" });
                    }
                  } catch {
                    /* cancelled */
                  }
                }}
              >
                <Copy aria-hidden />
              </Button>
            </div>
            <Button variant="link" onClick={() => setConfirm(true)}>
              <RefreshCw aria-hidden /> Make a new link
            </Button>
            <Dialog open={confirm} onOpenChange={setConfirm} title="Make a new link?" description="The old link stops working right away.">
              <Button block loading={pending} onClick={make}>
                Make a new link
              </Button>
            </Dialog>
          </>
        ) : (
          <Button block={size === "group"} variant={size === "group" ? "primary" : "outline"} loading={pending} onClick={make}>
            <Link2 aria-hidden /> Make a group link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** FR-7 invite-list-only; J-7 the name outsiders see. */
export function JoinSettingsForm({
  tripId,
  inviteListOnly,
  outsiderName,
}: {
  tripId: string;
  inviteListOnly: boolean;
  outsiderName: string;
}) {
  const { pending, run } = useRun();
  const [only, setOnly] = React.useState(inviteListOnly);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("outsiderName") ?? "");
        run(() => updateJoinSettingsAction(tripId, { inviteListOnly: only, outsiderName: name.trim() || null }));
      }}
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Group link access</legend>
        <label className="flex items-start gap-3 text-sm">
          <input type="radio" name="mode" checked={!only} onChange={() => setOnly(false)} className="mt-0.5 size-5 accent-primary" />
          <span>
            <span className="font-semibold">Anyone with the link can ask</span>
            <span className="block text-muted-foreground">You approve people who aren&apos;t on your invite list.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="radio" name="mode" checked={only} onChange={() => setOnly(true)} className="mt-0.5 size-5 accent-primary" />
          <span>
            <span className="font-semibold">Invite list only</span>
            <span className="block text-muted-foreground">Others are told to ask you to add them.</span>
          </span>
        </label>
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="outsiderName">Name people see before they&apos;re in</Label>
        <Input id="outsiderName" name="outsiderName" defaultValue={outsiderName} maxLength={60} placeholder="Uses the trip name" />
        <p className="text-xs text-muted-foreground">Handy when the trip name is a surprise.</p>
      </div>
      <Button type="submit" loading={pending}>
        Save
      </Button>
    </form>
  );
}

/** FR-2: hand the trip to another verified member. */
export function TransferOwnership({ tripId, candidates }: { tripId: string; candidates: { id: string; displayName: string }[] }) {
  const { pending, run } = useRun();
  const [to, setTo] = React.useState(candidates[0]?.id ?? "");
  const [confirm, setConfirm] = React.useState(false);
  const name = candidates.find((c) => c.id === to)?.displayName ?? "";
  return (
    <div className="space-y-3">
      <Label htmlFor="new-owner">Hand the trip to</Label>
      <select
        id="new-owner"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="h-12 w-full rounded-lg border border-input bg-card px-3"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.displayName}
          </option>
        ))}
      </select>
      <Button variant="outline" onClick={() => setConfirm(true)}>
        Transfer ownership
      </Button>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Make ${name} the owner?`}
        description="You'll stay on as an organizer. Only the new owner can undo this."
      >
        <Button block loading={pending} onClick={() => run(() => transferOwnershipAction(tripId, to), () => setConfirm(false))}>
          Transfer to {name}
        </Button>
      </Dialog>
    </div>
  );
}
