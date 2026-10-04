import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { AddIdea } from "@/components/trip/add-idea";
import { AddExpenseLink } from "@/components/money/add-expense-link";
import { AutoRefresh } from "@/components/trip/auto-refresh";
import { IdeaCard } from "@/components/trip/idea-card";
import { IdeaBoard } from "@/components/trip/idea-board";
import { WhatsNewCard } from "@/components/trip/whats-new";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/lib/routes";
import { loadTripView, tripContext } from "@/server/context";
import type { IdeaCard as IdeaCardModel } from "@/server/cards";
import { FeedFilters, FeedPrompts, filterFeed, parseFeedFilter } from "@/components/trip/planning/feed-tools";
import { IdeaExtras } from "@/components/trip/planning/idea-extras";
import { SurpriseControl } from "@/components/trip/surprise-control";
import { SizeNotice } from "@/components/trip/people-admin";
import { getSizeNotices } from "@/server/membership";
import { myNotMyPicks } from "@/server/planning";
import { loadPlanning } from "@/server/planning-context";
import { MiniMapCard } from "@/components/map/mini-map-card";

export default async function IdeasPage({ params, searchParams }: PageProps<"/t/[tripId]">) {
  const { tripId } = await params;
  const { session, db, claims } = await tripContext(tripId);
  const view = await loadTripView(tripId);
  if (!view) notFound();
  const { size } = view.trip;
  const processing = view.ideas.some((c) => c.processing);
  const unvoted = view.ideas.filter((c) => !c.myVote && !c.processing && !c.notAPlace).length;
  const canAdd = !!session.user;
  const other = view.members.find((m) => m.id !== view.me.memberId);
  const topPicks = view.ideas.filter((c) => c.rank !== null && (c.myVote === "must" || c.myVote === "down")).slice(0, 5);
  // FR-S9 / FR-121: Stop filter + "not voted"; FR-49/50 card footers (stages/Stops slice).
  const plan = await loadPlanning(tripId);
  const sp = await searchParams;
  const filter = parseFeedFilter(sp, plan);
  // Founder request: a kanban-style board to switch, view, edit and move ideas.
  const boardView = sp.view === "board";
  const boardGroup = sp.group === "status" ? ("status" as const) : ("city" as const);
  const cards = filterFeed(view.ideas, filter);
  const notMine = size === "solo" ? new Set<string>() : await myNotMyPicks(db, claims, tripId);
  const isOrganizer = !!plan?.me.isOrganizer;
  // FR-91 surprise mode: opt-in (P2). Duo: always available (§6.10); group: with bach mode or a guest of honor.
  const othersForSurprise = view.members
    .filter((m) => m.id !== view.me.memberId)
    .map(({ id, displayName, isGuestOfHonor }) => ({ id, displayName, isGuestOfHonor }));
  const surpriseOn =
    size === "duo" || (size === "group" && (view.trip.bachMode || view.members.some((m) => m.isGuestOfHonor)));
  const sizeNotices = await getSizeNotices(db, claims, tripId);

  return (
    <div className={boardView ? "" : "lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8"}>
      <main className="min-w-0 space-y-4">
        <AutoRefresh active={processing} />
        {canAdd ? <AddIdea tripId={tripId} autoFocus={view.ideas.length === 0} /> : null}
        {size !== "solo" ? <WhatsNewCard tripId={tripId} myMemberId={view.me.memberId} /> : null}
        {canAdd && !view.hasExpenses ? <AddExpenseLink tripId={tripId} /> : null}

        {/* JR13: one-time size-change notices also show on the Ideas feed (FR-T4/T5). */}
        {sizeNotices?.notices.map((n) => (
          <SizeNotice key={n} tripId={tripId} memberId={sizeNotices.memberId} notice={n} />
        ))}

        {size === "duo" && !view.me.noticesSeen.includes("duo_votes_visible") ? (
          <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            In 2-person trips, you and {other?.displayName ?? "your travel buddy"} see each other&apos;s votes.
          </p>
        ) : null}

        <FeedPrompts tripId={tripId} plan={plan} />
        {view.ideas.length > 0 ? <ViewToggle tripId={tripId} board={boardView} group={boardGroup} /> : null}
        {boardView ? null : (
          <FeedFilters tripId={tripId} cards={view.ideas} plan={plan} filter={filter} showUnvoted={size !== "solo"} />
        )}

        {size === "group" && unvoted > 0 ? (
          <p className="text-sm font-semibold text-primary">
            {unvoted} {unvoted === 1 ? "idea needs" : "ideas need"} your vote
          </p>
        ) : null}

        {view.ideas.length === 0 ? (
          <EmptyIdeas />
        ) : boardView ? (
          <IdeaBoard
            tripId={tripId}
            cards={view.ideas}
            group={boardGroup}
            stops={view.stops}
            size={size}
            canEdit={canAdd && !session.user?.provisional}
            canMoveStatus={isOrganizer && !!session.user && !session.user.provisional}
          />
        ) : cards.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {cards.map((card) => (
              <li key={card.id}>
                <IdeaCard
                  tripId={tripId}
                  card={card}
                  size={size}
                  stops={view.stops}
                  canEdit={canAdd}
                  extra={
                    card.processing || card.notAPlace ? null : (
                      <>
                        <IdeaExtras
                          tripId={tripId}
                          ideaId={card.id}
                          status={card.status}
                          isOrganizer={isOrganizer}
                          showNotMyPick={size !== "solo" && card.myVote === "pass" && (card.status === "shortlisted" || card.status === "planned")}
                          notMyPick={notMine.has(card.id)}
                        />
                        {surpriseOn || card.hiddenFrom.length ? (
                          <div className="border-t px-4 py-2">
                            <SurpriseControl
                              tripId={tripId}
                              ideaId={card.id}
                              hiddenFrom={card.hiddenFrom}
                              people={othersForSurprise}
                              canEdit={isOrganizer && surpriseOn}
                            />
                          </div>
                        ) : null}
                      </>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Desktop planning rail (the board uses the full width) */}
      <aside className={boardView ? "hidden" : "hidden lg:block"}>
        <div className="sticky top-8 space-y-4">
          <MiniMapCard tripId={tripId} />
          <TopPicks picks={topPicks} size={size} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ready to plan the days?</CardTitle>
              <p className="text-sm text-muted-foreground">
                Turn decided ideas into a day-by-day plan with travel times.
              </p>
            </CardHeader>
            <CardContent>
              <Link href={`${routes.trip(tripId)}/plan`} className={buttonVariants({ variant: "outline", block: true, size: "sm" })}>
                <CalendarDays aria-hidden /> Open the plan
              </Link>
            </CardContent>
          </Card>
        </div>
      </aside>
    </div>
  );
}

function TopPicks({ picks, size }: { picks: IdeaCardModel[]; size: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{size === "solo" ? "Your must-dos" : "Top picks so far"}</CardTitle>
      </CardHeader>
      <CardContent>
        {picks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Vote on a few ideas and the favorites show up here.</p>
        ) : (
          <ol className="space-y-2">
            {picks.map((p, i) => (
              <li key={p.id} className="text-sm">
                <span className="mr-2 font-semibold text-muted-foreground">{i + 1}.</span>
                <span className="font-semibold">{p.title}</span>
                {p.tallyLabel ? <span className="block pl-5 text-xs text-muted-foreground">{p.tallyLabel}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyIdeas() {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground lg:p-14">
      <p className="font-display text-xl font-bold text-foreground">Drop a TikTok, get a vote.</p>
      <p className="mt-1 text-sm">
        Paste any link (TikTok, Instagram, Google Maps, a blog post) or type an idea. We&apos;ll find the place.
      </p>
      <p className="mt-3 hidden text-sm lg:block">
        Tip: on your phone, tap Share on a TikTok, copy the link and paste it here.
      </p>
    </div>
  );
}

/** List / Board toggle and, for the board, "Group by City / Status". Plain links (bookmarkable). */
function ViewToggle({ tripId, board, group }: { tripId: string; board: boolean; group: "city" | "status" }) {
  const base = routes.trip(tripId);
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="View" className="flex gap-1 rounded-full border bg-card p-1">
        <Link href={base} aria-current={!board ? "page" : undefined} className={pill(!board)}>
          List
        </Link>
        <Link href={`${base}?view=board&group=${group}`} aria-current={board ? "page" : undefined} className={pill(board)}>
          Board
        </Link>
      </nav>
      {board ? (
        <nav aria-label="Group by" className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Group by</span>
          <Link href={`${base}?view=board&group=city`} aria-current={group === "city" ? "page" : undefined} className={pill(group === "city")}>
            City
          </Link>
          <Link href={`${base}?view=board&group=status`} aria-current={group === "status" ? "page" : undefined} className={pill(group === "status")}>
            Status
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
