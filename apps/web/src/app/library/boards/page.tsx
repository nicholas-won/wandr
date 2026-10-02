/** Custom boards (FR-L8). Auto boards (country/city/category) are the Places grid. */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";
import { CreateBoardForm } from "@/components/library/board-forms";
import { libraryRoutes } from "@/lib/library-routes";
import { routes } from "@/lib/routes";
import { listMyBoards } from "@/server/library";
import { libraryContext } from "@/server/library-context";

export default async function BoardsPage() {
  const { db, userId } = await libraryContext();
  if (!userId) redirect(routes.signin(libraryRoutes.boards));
  const boards = await listMyBoards(db, userId);
  return (
    <main className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4" aria-labelledby="boards-h">
        <h1 id="boards-h" className="font-display text-3xl font-extrabold tracking-tight">
          Boards
        </h1>
        {boards.length === 0 ? (
          <p className="text-muted-foreground">
            Optional. Group saves however you like (&ldquo;Honeymoon someday&rdquo;, &ldquo;Japan with Sam&rdquo;) and share a board with a
            partner or friends.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {boards.map((b) => (
              <li key={b.id}>
                <Link
                  href={libraryRoutes.board(b.id)}
                  className="group flex h-full items-center justify-between rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md"
                >
                  <span>
                    <span className="block font-display text-lg font-bold">{b.name}</span>
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      {b.itemCount} {b.itemCount === 1 ? "save" : "saves"}
                      {b.memberCount > 1 ? (
                        <>
                          {" "}
                          · <Users className="size-3.5" aria-hidden /> {b.isOwner ? `Shared with ${b.memberCount - 1}` : "Shared with you"}
                        </>
                      ) : null}
                    </span>
                  </span>
                  <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="space-y-2">
        <h2 className="font-semibold">New board</h2>
        <CreateBoardForm />
      </aside>
    </main>
  );
}
