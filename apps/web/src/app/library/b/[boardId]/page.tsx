/**
 * A custom or shared board (FR-L8, FR-L14, FR-L15, LB-6). Board-link guests see ONLY this
 * board's saves and can add; managing needs the owner's verified session.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { groupByCategory, isPending, preselectForTrip } from "@wandr/core/library";
import { AutoRefresh } from "@/components/trip/auto-refresh";
import { MemberActions, RenameBoard, ShareBoardForm } from "@/components/library/board-forms";
import { PlaceSaves } from "@/components/library/place-saves";
import { SaveInput } from "@/components/library/save-input";
import { libraryRoutes } from "@/lib/library-routes";
import { sendableTrips } from "@/server/library";
import { boardContext } from "@/server/library-context";

export default async function BoardPage({ params }: PageProps<"/library/b/[boardId]">) {
  const { boardId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(boardId)) notFound();
  const ctx = await boardContext(boardId);
  if (!ctx) notFound();
  const { view, db, claims, session } = ctx;
  const { isOwner } = view.me;
  const ownerId = isOwner ? claims.sub! : null;
  const trips = ownerId ? await sendableTrips(db, ownerId) : [];
  const shared = view.members.length > 1;
  // The owner can copy their own saves and friends' board-only saves into a trip (FR-L15).
  const copyable = (s: (typeof view.items)[number]) => !isPending(s) && !s.listicle && s.extraction !== "failed";
  const others = view.members.filter((m) => !m.isMe && m.role !== "owner");
  const verifiedOwner = isOwner && !session.user?.provisional;

  return (
    <main className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <AutoRefresh active={view.items.some(isPending)} />
      <div className="space-y-5">
        {!view.me.viaLink ? (
          <Link href={libraryRoutes.boards} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> Boards
          </Link>
        ) : null}
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{view.board.name}</h1>
          {shared ? (
            <p className="text-sm text-muted-foreground">With {view.members.map((m) => (m.isMe ? "you" : m.displayName)).join(", ")}</p>
          ) : null}
        </div>
        <div className="lg:max-w-xl">
          <SaveInput boardId={boardId} autoFocus={view.items.length === 0} />
        </div>
        {view.items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Nothing here yet. Paste a TikTok or link to add it.
          </p>
        ) : (
          <PlaceSaves
            boardId={boardId}
            sharedBoard={shared}
            groups={groupByCategory(view.items).map((g) => ({
              category: g.category,
              saves: g.saves.map((s) => ({
                ...s,
                priority: isOwner ? s.priority : null,
                mine: s.inMyLibrary,
                selectable: isOwner && copyable(s),
                removable: isOwner || (!view.me.viaLink && s.addedByMe),
              })),
            }))}
            preselected={isOwner ? preselectForTrip(view.items) : []}
            trips={trips}
            suggestedName={`${view.board.name}`.slice(0, 80)}
            city={null}
          />
        )}
      </div>

      {isOwner ? (
        <aside className="space-y-6">
          <section className="space-y-3 rounded-2xl border bg-card p-5">
            <h2 className="font-display text-lg font-bold">Share this board</h2>
            <p className="text-sm text-muted-foreground">
              They can see and add to this board only, never the rest of your library. No votes, no splits.
            </p>
            {verifiedOwner ? (
              <ShareBoardForm boardId={boardId} />
            ) : (
              <Link href={`/signin?next=${encodeURIComponent(libraryRoutes.board(boardId))}`} className="text-sm font-semibold text-primary">
                Confirm your number to share
              </Link>
            )}
            {others.length ? (
              <ul className="divide-y">
                {others.map((m) => (
                  <li key={m.id} className="py-2">
                    <p className="font-semibold">{m.displayName}</p>
                    {verifiedOwner ? <MemberActions boardId={boardId} memberId={m.id} name={m.displayName} /> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <RenameBoard boardId={boardId} name={view.board.name} />
        </aside>
      ) : null}
    </main>
  );
}
