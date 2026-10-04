"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { APP_NAME } from "@wandr/core/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { inviteAction, shareLinkAction } from "@/app/t/[tripId]/actions";

/** FR-4: name + phone → personal text with a personal link. */
export function InviteForm({ tripId }: { tripId: string }) {
  const [pending, start] = useTransition();
  const [lastLink, setLastLink] = useState<{ name: string; link: string } | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <div className="space-y-3">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const name = String(fd.get("name") ?? "");
          const phone = String(fd.get("phone") ?? "");
          start(async () => {
            const r = await inviteAction(tripId, name, phone);
            if (!r.ok) {
              if (r.signin) router.push(r.signin);
              else toast({ title: r.error, variant: "error" });
              return;
            }
            form.reset();
            toast({ title: r.message ?? "Invited" });
            if (r.link) setLastLink({ name, link: r.link });
          });
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="inv-name">Name</Label>
            <Input id="inv-name" name="name" required autoComplete="off" placeholder="Sam" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-phone">Mobile</Label>
            <Input id="inv-phone" name="phone" type="tel" required autoComplete="off" placeholder="(555) 123-4567" />
          </div>
        </div>
        <Button type="submit" block loading={pending}>
          <Send aria-hidden /> Text them an invite
        </Button>
      </form>
      {lastLink ? <SendYourself name={lastLink.name} link={lastLink.link} /> : null}
    </div>
  );
}

/** §6.10 duo messaging: "Send to Sam" from your own phone (free), alongside our text. */
export function SendYourself({ name, link }: { name: string; link: string }) {
  const body = `Join our trip on ${APP_NAME}: ${link}`;
  const { toast } = useToast();
  return (
    <div className="flex gap-2">
      <a
        href={`sms:&body=${encodeURIComponent(body)}`}
        className="flex-1 rounded-full border border-input px-4 py-2 text-center text-sm font-semibold hover:bg-muted"
      >
        Send to {name} from my phone
      </a>
      <button
        type="button"
        className="rounded-full border border-input px-4 py-2 text-sm font-semibold hover:bg-muted"
        onClick={async () => {
          try {
            if (navigator.share) await navigator.share({ text: body });
            else {
              await navigator.clipboard.writeText(link);
              toast({ title: "Link copied" });
            }
          } catch {
            /* cancelled */
          }
        }}
      >
        Share
      </button>
    </div>
  );
}

export function ResendLink({ tripId, memberId, name }: { tripId: string; memberId: string; name: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  if (link) return <SendYourself name={name} link={link} />;
  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm font-semibold text-primary"
      onClick={() =>
        start(async () => {
          const r = await shareLinkAction(tripId, memberId);
          if (r.ok && r.link) setLink(r.link);
          else if (!r.ok) toast({ title: r.error, variant: "error" });
        })
      }
    >
      Get {name}&apos;s link
    </button>
  );
}
