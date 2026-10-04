"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  boardRemoveItemAction,
  createBoardAction,
  deleteBoardAction,
  freshBoardLinkAction,
  removeBoardMemberAction,
  renameBoardAction,
  shareBoardAction,
  type LibraryResult,
} from "@/app/library/actions";
import { libraryRoutes } from "@/lib/library-routes";

function useRun() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<LibraryResult<{ link?: string }> | void>, after?: (r: { link?: string; message?: string }) => void) =>
    start(async () => {
      const r = await fn();
      if (!r) return;
      if (!r.ok) {
        if (r.signin) router.push(r.signin);
        else toast({ title: r.error, variant: "error" });
        return;
      }
      if (r.message) toast({ title: r.message });
      after?.(r);
    });
  return { run, pending, router, toast };
}

export function CreateBoardForm() {
  const { run, pending, router } = useRun();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const name = String(new FormData(form).get("name") ?? "");
        run(
          () => createBoardAction(name),
          (r) => {
            form.reset();
            const id = (r as { boardId?: string }).boardId;
            if (id) router.push(libraryRoutes.board(id));
          },
        );
      }}
    >
      <label htmlFor="board-name" className="sr-only">
        Board name
      </label>
      <Input id="board-name" name="name" placeholder="Honeymoon someday" autoComplete="off" />
      <Button type="submit" loading={pending}>
        Create
      </Button>
    </form>
  );
}

function CopyLink({ link, name }: { link: string; name: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-2 rounded-xl bg-muted p-3">
      <p className="text-sm">
        {name}&apos;s personal link. Only send it to them: it lets whoever opens it view and add.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={link} aria-label={`${name}'s link`} className="h-10 text-sm" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast({ title: "Link copied" });
            } catch {
              toast({ title: "Copy the link from the box", variant: "error" });
            }
          }}
        >
          <Copy aria-hidden /> Copy
        </Button>
      </div>
    </div>
  );
}

/** FR-L14: the owner shares the board with someone (their own personal link). */
export function ShareBoardForm({ boardId }: { boardId: string }) {
  const { run, pending } = useRun();
  const [last, setLast] = useState<{ name: string; link: string } | null>(null);
  return (
    <div className="space-y-3">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const name = String(f.get("name") ?? "");
          run(
            () => shareBoardAction(boardId, name, String(f.get("phone") ?? "")),
            (r) => {
              form.reset();
              if (r.link) setLast({ name, link: r.link });
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="sb-name">Name</Label>
            <Input id="sb-name" name="name" required autoComplete="off" placeholder="Sam" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-phone">
              Mobile <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="sb-phone" name="phone" type="tel" autoComplete="off" placeholder="(555) 123-4567" />
          </div>
        </div>
        <Button type="submit" block loading={pending}>
          Get their link
        </Button>
      </form>
      {last ? <CopyLink name={last.name} link={last.link} /> : null}
    </div>
  );
}

export function MemberActions({ boardId, memberId, name }: { boardId: string; memberId: string; name: string }) {
  const { run, pending } = useRun();
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex gap-3 text-sm font-semibold">
        <button type="button" disabled={pending} className="text-primary" onClick={() => run(() => freshBoardLinkAction(boardId, memberId), (r) => setLink(r.link ?? null))}>
          New link
        </button>
        <button type="button" disabled={pending} className="text-muted-foreground hover:text-destructive" onClick={() => run(() => removeBoardMemberAction(boardId, memberId))}>
          Remove
        </button>
      </div>
      {link ? <CopyLink name={name} link={link} /> : null}
    </div>
  );
}

export function RenameBoard({ boardId, name }: { boardId: string; name: string }) {
  const { run, pending } = useRun();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (editing) {
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = String(new FormData(e.currentTarget).get("name") ?? "");
          run(() => renameBoardAction(boardId, n), () => setEditing(false));
        }}
      >
        <label htmlFor="rb" className="sr-only">
          Board name
        </label>
        <Input id="rb" name="name" defaultValue={name} autoFocus className="h-10" />
        <Button size="sm" loading={pending}>
          Save
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap gap-3 text-sm font-semibold">
      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
        Rename
      </button>
      {confirm ? (
        <span className="inline-flex items-center gap-2">
          Delete the board? Your saves stay in your library.
          <Button size="sm" variant="destructive" loading={pending} onClick={() => run(() => deleteBoardAction(boardId))}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Keep
          </Button>
        </span>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive" onClick={() => setConfirm(true)}>
          <Trash2 className="size-3.5" aria-hidden /> Delete board
        </button>
      )}
    </div>
  );
}

export function RemoveItem({ boardId, savedIdeaId, title }: { boardId: string; savedIdeaId: string; title: string }) {
  const { run, pending } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => boardRemoveItemAction(boardId, savedIdeaId))}
      className="text-xs font-semibold text-muted-foreground hover:text-destructive"
    >
      Remove from board<span className="sr-only">: {title}</span>
    </button>
  );
}
