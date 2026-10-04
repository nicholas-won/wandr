"use client";

/**
 * Idea comment thread (FR-46): threaded, not real-time chat. One level of replies.
 * Optimistic add; delete has an undo toast (P7). Bodies render as plain text only.
 * People reading from a personal link see the thread and a prompt to confirm their number.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode, type RefObject } from "react";
import { MessageCircle, Pencil, Reply, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
  loadThreadAction,
  restoreCommentAction,
} from "@/app/t/[tripId]/comment-actions";
import type { CommentView } from "@/server/comments";

type Item = CommentView & { pending?: boolean };

/** Live comments in a thread (deleted placeholders don't count). */
export function liveCount(list: CommentView[]): number {
  return list.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.filter((r) => !r.deleted).length, 0);
}

const desktopQuery = "(min-width: 1024px)";
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(desktopQuery);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
}

/** "💬 3" button + the thread: a bottom sheet on phones, an inline section on desktop. */
export function IdeaComments({
  tripId,
  ideaId,
  ideaTitle,
  count,
  aside,
}: {
  tripId: string;
  ideaId: string;
  ideaTitle: string;
  count: number;
  /** Shown at the right of the comment button row (e.g. "Save for next time"). */
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const desktop = useIsDesktop();
  const n = shown ?? count;
  const label = n === 0 ? "Comment" : `${n} ${n === 1 ? "comment" : "comments"}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MessageCircle className="size-4" aria-hidden />
        <span aria-hidden>{n > 0 ? n : null}</span>
        <span className={n > 0 ? "sr-only" : undefined}>{label}</span>
      </button>
      {aside}
      </div>
      {open && desktop ? (
        <section aria-label={`Comments on ${ideaTitle}`} className="mt-2 border-t pt-3">
          <CommentThread tripId={tripId} ideaId={ideaId} onCount={setShown} />
        </section>
      ) : null}
      {!desktop ? (
        <Sheet open={open} onOpenChange={setOpen} title="Comments" description={ideaTitle}>
          {open ? <CommentThread tripId={tripId} ideaId={ideaId} onCount={setShown} autoFocus /> : null}
        </Sheet>
      ) : null}
    </div>
  );
}

export function CommentThread({
  tripId,
  ideaId,
  onCount,
  autoFocus,
}: {
  tripId: string;
  ideaId: string;
  onCount?: (n: number) => void;
  autoFocus?: boolean;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [signin, setSignin] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Item | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    void loadThreadAction(tripId, ideaId).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.error);
      setItems(r.comments);
      setCanWrite(r.canWrite);
      setSignin(r.signin);
    });
    return () => {
      live = false;
    };
  }, [tripId, ideaId]);

  const update = useCallback((fn: (xs: Item[]) => Item[]) => setItems((xs) => fn(xs ?? [])), []);
  // Keep the card's "💬 n" in step with the thread (after render, never during it).
  useEffect(() => {
    if (items) onCount?.(liveCount(items));
  }, [items, onCount]);

  function send(text: string, parent: Item | null): boolean {
    if (!text.trim()) return false;
    const tmp: Item = {
      id: `tmp-${Date.now()}`,
      parentId: parent?.id ?? null,
      authorMemberId: "",
      authorName: "You",
      isMine: true,
      body: text.trim(),
      deleted: false,
      edited: false,
      createdAt: new Date().toISOString(),
      replies: [],
      pending: true,
    };
    update((xs) => insert(xs, tmp));
    start(async () => {
      const r = await addCommentAction(tripId, ideaId, text, parent?.id ?? null);
      if (!r.ok) {
        update((xs) => remove(xs, tmp.id));
        toast({ title: r.error, variant: "error" });
        return;
      }
      update((xs) => replace(xs, tmp.id, r.comment));
    });
    return true;
  }

  function del(c: Item) {
    const snapshot = c.body ?? "";
    update((xs) => markDeleted(xs, c.id));
    start(async () => {
      const r = await deleteCommentAction(tripId, c.id);
      if (!r.ok) {
        update((xs) => replace(xs, c.id, c));
        toast({ title: r.error, variant: "error" });
        return;
      }
      toast({
        title: "Comment deleted",
        action: {
          label: "Undo",
          onClick: () =>
            start(async () => {
              const u = await restoreCommentAction(tripId, c.id, snapshot);
              if (u.ok) update((xs) => restore(xs, c));
              else toast({ title: u.error, variant: "error" });
            }),
        },
      });
    });
  }

  function saveEdit(c: Item, text: string) {
    const prev = c.body;
    setEditing(null);
    update((xs) => patch(xs, c.id, { body: text.trim(), edited: true }));
    start(async () => {
      const r = await editCommentAction(tripId, c.id, text);
      if (!r.ok) {
        update((xs) => patch(xs, c.id, { body: prev, edited: c.edited }));
        toast({ title: r.error, variant: "error" });
      }
    });
  }

  if (error) return <p className="py-2 text-sm text-muted-foreground">{error}</p>;
  if (!items) return <p className="py-2 text-sm text-muted-foreground" aria-busy>Loading comments…</p>;
  const visible = items.filter((c) => !c.deleted || c.replies.some((r) => !r.deleted));

  return (
    <div className="space-y-3">
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Ask a question or share a tip.</p>
      ) : (
        <ol className="max-h-[50dvh] space-y-3 overflow-y-auto pr-1 lg:max-h-96">
          {visible.map((c) => (
            <li key={c.id}>
              <CommentRow
                c={c}
                editing={editing === c.id}
                canWrite={canWrite}
                onReply={() => {
                  setReplyTo(c);
                  inputRef.current?.focus();
                }}
                onEdit={() => setEditing(c.id)}
                onCancelEdit={() => setEditing(null)}
                onSaveEdit={(t) => saveEdit(c, t)}
                onDelete={() => del(c)}
              />
              {c.replies.filter((r) => !r.deleted).length ? (
                <ol className="mt-2 space-y-2 border-l-2 border-border pl-3 sm:ml-10">
                  {c.replies
                    .filter((r) => !r.deleted)
                    .map((r) => (
                      <li key={r.id}>
                        <CommentRow
                          c={r}
                          small
                          editing={editing === r.id}
                          canWrite={canWrite}
                          onEdit={() => setEditing(r.id)}
                          onCancelEdit={() => setEditing(null)}
                          onSaveEdit={(t) => saveEdit(r, t)}
                          onDelete={() => del(r)}
                        />
                      </li>
                    ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {canWrite ? (
        <Composer
          inputRef={inputRef}
          autoFocus={autoFocus}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onSend={(t) => {
            const ok = send(t, replyTo);
            if (ok) setReplyTo(null);
            return ok;
          }}
        />
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          <Link href={signin ?? "/signin"} className="font-semibold text-primary underline-offset-2 hover:underline">
            Confirm your number
          </Link>{" "}
          to join the conversation.
        </p>
      )}
    </div>
  );
}

function CommentRow({
  c,
  small,
  editing,
  canWrite,
  onReply,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  c: Item;
  small?: boolean;
  editing: boolean;
  canWrite: boolean;
  onReply?: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  onDelete: () => void;
}) {
  if (c.deleted) {
    return <p className="text-sm italic text-muted-foreground">Comment deleted</p>;
  }
  return (
    <div className={cn("flex gap-2.5", c.pending && "opacity-60")}>
      <Avatar name={c.authorName} size="sm" className={small ? "size-7 text-[10px]" : undefined} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{c.isMine ? "You" : c.authorName}</span>
          {" · "}
          <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>
            {c.pending ? "sending…" : relativeTime(c.createdAt)}
          </time>
          {c.edited ? " · edited" : null}
        </p>
        {editing ? (
          <EditBox initial={c.body ?? ""} onCancel={onCancelEdit} onSave={onSaveEdit} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
        )}
        {!editing && !c.pending && canWrite ? (
          <div className="mt-0.5 flex gap-3 text-xs font-semibold text-muted-foreground">
            {onReply ? (
              <button type="button" onClick={onReply} className="inline-flex items-center gap-1 hover:text-foreground">
                <Reply className="size-3.5" aria-hidden /> Reply
              </button>
            ) : null}
            {c.isMine ? (
              <>
                <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Pencil className="size-3.5" aria-hidden /> Edit
                </button>
                <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Trash2 className="size-3.5" aria-hidden /> Delete
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EditBox({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <form
      className="mt-1 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave(text);
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        rows={2}
        maxLength={2000}
        aria-label="Edit comment"
        className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!text.trim()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Composer({
  inputRef,
  autoFocus,
  replyTo,
  onClearReply,
  onSend,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  autoFocus?: boolean;
  replyTo: Item | null;
  onClearReply: () => void;
  onSend: (text: string) => boolean;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (onSend(text)) setText("");
  };
  return (
    <form
      className="space-y-1.5 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {replyTo ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          Replying to <span className="font-semibold text-foreground">{replyTo.isMine ? "yourself" : replyTo.authorName}</span>
          <button type="button" onClick={onClearReply} aria-label="Cancel reply" className="rounded-full p-0.5 hover:bg-muted">
            <X className="size-3.5" />
          </button>
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          autoFocus={autoFocus}
          rows={1}
          maxLength={2000}
          placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
          aria-label={replyTo ? "Reply" : "Comment"}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-input bg-card px-3 py-2 text-base sm:text-sm"
        />
        <Button type="submit" size="sm" disabled={!text.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}

// --- immutable thread updates ------------------------------------------------

function insert(xs: Item[], c: Item): Item[] {
  if (!c.parentId) return [...xs, c];
  return xs.map((t) => (t.id === c.parentId ? { ...t, replies: [...t.replies, c] } : t));
}

function mapAll(xs: Item[], fn: (c: Item) => Item | null): Item[] {
  return xs
    .map((t) => fn(t))
    .filter((t): t is Item => !!t)
    .map((t) => ({ ...t, replies: t.replies.map((r) => fn(r)).filter((r): r is Item => !!r) }));
}

function remove(xs: Item[], id: string): Item[] {
  return mapAll(xs, (c) => (c.id === id ? null : c));
}

function replace(xs: Item[], id: string, next: CommentView): Item[] {
  return mapAll(xs, (c) => (c.id === id ? { ...next, replies: c.replies } : c));
}

function patch(xs: Item[], id: string, p: Partial<Item>): Item[] {
  return mapAll(xs, (c) => (c.id === id ? { ...c, ...p } : c));
}

function markDeleted(xs: Item[], id: string): Item[] {
  return patch(xs, id, { deleted: true, body: null });
}

function restore(xs: Item[], original: Item): Item[] {
  return patch(xs, original.id, { deleted: false, body: original.body });
}
