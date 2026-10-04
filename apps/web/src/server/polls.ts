/**
 * Organizer and custom polls (FR-47, FR-48, FR-S12, FR-92, FR-T7, §6.10, S-4, S-6, V-7, V-8,
 * V-12). Reads and writes run as the caller so RLS applies; blind results come only from
 * `app.poll_results`. Closing at the deadline is a system action (`closeDuePolls`), run lazily on
 * read and callable from a background job.
 */
import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import {
  asService,
  ideas,
  members,
  pollOptions,
  polls,
  pollVotes,
  stopAttendance,
  stops,
  withSession,
  type Claims,
  type Db,
  type Tx,
} from "@wandr/db";
import { pollResults, turnout, type PollResult } from "@wandr/db/reveals";
import {
  attendingMemberIds,
  can,
  extendDeadline,
  isSplitDecision,
  pollOutcome,
  tripClock,
  tripSize,
  type PollOutcome,
  type StageKind,
  type TripSize,
} from "@wandr/core";
import {
  canPick,
  DEFAULT_EXTENSION_MS,
  isDueForClose,
  organizerPollActions,
  outcomeText,
  pollOutcomeFromTally,
  pollStatus,
  resumedDeadline,
  validatePollDraft,
  type OrganizerPollAction,
  type PollDraftError,
  type PollStatus,
} from "@wandr/core/poll-flow";
import { meIn, type Me } from "./planning";

type PollRow = typeof polls.$inferSelect;

async function activeMembers(tx: Tx, tripId: string) {
  return tx
    .select({ memberId: members.id, displayName: members.displayName, status: members.status, role: members.role })
    .from(members)
    .where(and(eq(members.tripId, tripId), eq(members.status, "active")));
}

/** FR-47: active members attending the poll's Stop, minus anyone it's hidden from (FR-91). */
async function eligibleFor(tx: Tx, poll: Pick<PollRow, "tripId" | "stopId" | "hiddenFrom">): Promise<string[]> {
  const active = await activeMembers(tx, poll.tripId);
  if (!poll.stopId) return active.filter((m) => !poll.hiddenFrom.includes(m.memberId)).map((m) => m.memberId);
  const rows = await tx.select().from(stopAttendance).where(eq(stopAttendance.stopId, poll.stopId));
  return attendingMemberIds(active, poll.stopId, rows, poll.hiddenFrom);
}

// ---------------------------------------------------------------------------
// Deadline close (system)
// ---------------------------------------------------------------------------

/**
 * FR-47/48: finalize polls whose deadline passed: closed_at = deadline, and the winner when there
 * is one (ties and turnout under 50% are left for the organizer). Idempotent. Runs as the service
 * (no client may write another member's poll); it reads raw ballots but stores only the winner.
 */
export async function closeDuePolls(db: Db, now: Date = new Date(), tripId?: string): Promise<number> {
  return asService(db, async (tx) => {
    const due = await tx
      .select()
      .from(polls)
      .where(
        and(
          isNull(polls.closedAt),
          isNull(polls.pausedAt),
          lte(polls.closesAt, now),
          ...(tripId ? [eq(polls.tripId, tripId)] : []),
        ),
      );
    let closed = 0;
    for (const p of due) {
      if (!isDueForClose(p, now)) continue;
      const outcome = await rawOutcome(tx, p);
      await tx
        .update(polls)
        .set({ closedAt: p.closesAt, winningOptionId: outcome.kind === "winner" ? outcome.optionId : null })
        .where(and(eq(polls.id, p.id), isNull(polls.closedAt)));
      closed++;
    }
    return closed;
  });
}

/**
 * ST5: the poll's city was removed. Open (or paused) polls close now, by the organizer who removed
 * it, with the winner when there is one; ties and low turnout are left for the organizer as with
 * any close (FR-48, Q15). Service transaction; the caller checked the organizer.
 */
export async function closePollsForRemovedStop(tx: Tx, rows: PollRow[], closedByMemberId: string, now = new Date()) {
  for (const p of rows) {
    const status = pollStatus(p, now);
    if (status !== "open" && status !== "paused") continue;
    const outcome = await rawOutcome(tx, p);
    await tx
      .update(polls)
      .set({
        closedAt: now,
        closedByMemberId,
        pausedAt: null,
        winningOptionId: outcome.kind === "winner" ? outcome.optionId : null,
      })
      .where(and(eq(polls.id, p.id), isNull(polls.closedAt)));
  }
}

async function rawOutcome(tx: Tx, p: PollRow): Promise<PollOutcome> {
  const active = await activeMembers(tx, p.tripId);
  const opts = await tx.select({ id: pollOptions.id }).from(pollOptions).where(eq(pollOptions.pollId, p.id));
  const ballots = await tx
    .select({ memberId: pollVotes.memberId, optionId: pollVotes.optionId })
    .from(pollVotes)
    .where(eq(pollVotes.pollId, p.id));
  return pollOutcome({
    size: tripSize(active.length),
    optionIds: opts.map((o) => o.id),
    ballots,
    eligibleVoterIds: await eligibleFor(tx, p),
  });
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export interface PollOptionView {
  id: string;
  label: string;
  imageUrl: string | null;
  ideaId: string | null;
  /** Null while blind. */
  count: number | null;
  /** Duo names (FR-T7), never in groups. */
  voters: string[] | null;
  mine: boolean;
}

export interface PollView {
  id: string;
  question: string;
  kind: "ideas" | "custom";
  stage: StageKind | null;
  stopId: string | null;
  stopName: string | null;
  /** FR-O16: the poll's Stop (else the trip's first) clock, for "(2 AM in Lisbon)" next to deadlines. */
  cityClock: { name: string; timeZone: string } | null;
  status: PollStatus;
  closesAt: string | null;
  myOptionId: string | null;
  /** FR-47: am I allowed to vote (attending, active, not hidden)? */
  eligible: boolean;
  options: PollOptionView[];
  /** After close: result line (V-8, V-12). */
  resultText: string | null;
  winningOptionId: string | null;
  /** FR-48: what the caller may do now (organizers; duo ties: owner only). */
  decisionActions: OrganizerPollAction[];
  pickable: string[];
  /** Q15: tied (incl. a 50/50) at close. Flagged to organizers as "Split decision". */
  splitDecision: boolean;
  /** Organizer controls while open. */
  canManage: boolean;
  runoffOfPollId: string | null;
  runoffPollId: string | null;
  /** Organizers: turnout as numbers only (FR-42). */
  turnout: { voted: number; eligible: number } | null;
}

function buildView(args: {
  p: PollRow;
  size: TripSize;
  me: Me;
  results: PollResult[];
  optionRows: { id: string; imageUrl: string | null; ideaId: string | null }[];
  myOptionId: string | null;
  eligibleIds: string[];
  stopName: string | null;
  cityClock: { name: string; timeZone: string } | null;
  closedByName: string | null;
  runoffPollId: string | null;
  now: Date;
}): PollView {
  const { p, size, me, results, optionRows, now } = args;
  const status = pollStatus(p, now);
  const closed = status === "decided" || status === "needs_decision";
  const counts = results.map((r) => ({ optionId: r.optionId, count: r.voteCount ?? 0 }));
  const outcome = closed ? pollOutcomeFromTally(size, counts, args.eligibleIds.length) : null;
  const labels = Object.fromEntries(results.map((r) => [r.optionId, r.label]));
  const decision =
    outcome && !p.winningOptionId && me.isOrganizer
      ? organizerPollActions(outcome, { role: me.role })
      : { actions: [] as OrganizerPollAction[], pickable: [] as string[] | "any" };
  const imgById = new Map(optionRows.map((o) => [o.id, o]));
  return {
    id: p.id,
    question: p.question,
    kind: p.kind,
    stage: p.stage,
    stopId: p.stopId,
    stopName: args.stopName,
    cityClock: args.cityClock,
    status,
    closesAt: p.closesAt?.toISOString() ?? null,
    myOptionId: args.myOptionId,
    eligible: args.eligibleIds.includes(me.memberId),
    options: results.map((r) => ({
      id: r.optionId,
      label: r.label,
      imageUrl: imgById.get(r.optionId)?.imageUrl ?? null,
      ideaId: imgById.get(r.optionId)?.ideaId ?? null,
      count: r.voteCount,
      voters: r.voters ? r.voters.map((v) => (v.member_id === me.memberId ? "You" : v.display_name)) : null,
      mine: args.myOptionId === r.optionId,
    })),
    resultText: outcome
      ? outcomeText(outcome, labels, { winningOptionId: p.winningOptionId, closedEarlyBy: args.closedByName })
      : null,
    winningOptionId: p.winningOptionId,
    decisionActions: decision.actions,
    pickable: decision.pickable === "any" ? results.map((r) => r.optionId) : decision.pickable,
    splitDecision: me.isOrganizer && !!outcome && isSplitDecision(outcome),
    canManage: me.isOrganizer,
    runoffOfPollId: p.runoffOfPollId,
    runoffPollId: args.runoffPollId,
    turnout:
      me.isOrganizer && !closed
        ? { voted: 0, eligible: args.eligibleIds.length } // filled by listPolls via app.turnout
        : null,
  };
}

async function viewsFor(tx: Tx, claims: Claims, tripId: string, rows: PollRow[], now: Date): Promise<PollView[]> {
  const me = await meIn(tx, claims, tripId);
  if (!me) return [];
  const active = await activeMembers(tx, tripId);
  const size = tripSize(active.length);
  const names = new Map(active.map((m) => [m.memberId, m.displayName]));
  const stopRows = await tx
    .select({ id: stops.id, name: stops.name, position: stops.position, timezone: stops.timezone })
    .from(stops)
    .where(eq(stops.tripId, tripId));
  const ids = rows.map((r) => r.id);
  const optionRows = ids.length
    ? await tx
        .select({ id: pollOptions.id, pollId: pollOptions.pollId, imageUrl: pollOptions.imageUrl, ideaId: pollOptions.ideaId })
        .from(pollOptions)
        .where(inArray(pollOptions.pollId, ids))
    : [];
  const mine = ids.length
    ? await tx
        .select({ pollId: pollVotes.pollId, optionId: pollVotes.optionId })
        .from(pollVotes)
        .where(and(inArray(pollVotes.pollId, ids), eq(pollVotes.memberId, me.memberId)))
    : [];
  const runoffs = ids.length
    ? await tx.select({ id: polls.id, of: polls.runoffOfPollId }).from(polls).where(inArray(polls.runoffOfPollId, ids))
    : [];
  const turnoutRows = me.isOrganizer
    ? new Map(
        (await turnout(tx, tripId))
          .filter((t) => t.kind === "poll")
          .map((t) => [t.itemId, t]),
      )
    : new Map();
  const out: PollView[] = [];
  for (const p of rows) {
    const v = buildView({
      p,
      size,
      me,
      results: await pollResults(tx, p.id),
      optionRows: optionRows.filter((o) => o.pollId === p.id),
      myOptionId: mine.find((m) => m.pollId === p.id)?.optionId ?? null,
      eligibleIds: await eligibleFor(tx, p),
      stopName: stopRows.length > 1 ? (stopRows.find((s) => s.id === p.stopId)?.name ?? null) : null,
      cityClock: tripClock(stopRows, p.stopId),
      closedByName: p.closedByMemberId ? (names.get(p.closedByMemberId) ?? "an organizer") : null,
      runoffPollId: runoffs.find((r) => r.of === p.id)?.id ?? null,
      now,
    });
    const t = turnoutRows.get(p.id) as { voterCount: number; eligibleCount: number } | undefined;
    if (v.turnout && t) v.turnout = { voted: t.voterCount, eligible: t.eligibleCount };
    out.push(v);
  }
  return out;
}

/** All polls the caller can see (surprise polls never appear for hidden members, FR-91). */
export async function listPolls(db: Db, claims: Claims, tripId: string, now: Date = new Date()): Promise<PollView[]> {
  await closeDuePolls(db, now, tripId);
  return withSession(db, claims, async (tx) => {
    const rows = await tx.select().from(polls).where(eq(polls.tripId, tripId)).orderBy(desc(polls.createdAt));
    return viewsFor(tx, claims, tripId, rows, now);
  });
}

export async function getPoll(db: Db, claims: Claims, tripId: string, pollId: string, now: Date = new Date()) {
  await closeDuePolls(db, now, tripId);
  return withSession(db, claims, async (tx) => {
    const rows = await tx.select().from(polls).where(and(eq(polls.id, pollId), eq(polls.tripId, tripId)));
    const [v] = await viewsFor(tx, claims, tripId, rows, now);
    return v ?? null;
  });
}

/** Ideas an organizer can put in a poll (open ideas visible to them). */
export async function pollableIdeas(db: Db, claims: Claims, tripId: string) {
  return withSession(db, claims, (tx) =>
    tx
      .select({ id: ideas.id, title: ideas.title, stopId: ideas.stopId, category: ideas.category, stage: ideas.stage })
      .from(ideas)
      .where(and(eq(ideas.tripId, tripId), inArray(ideas.status, ["idea", "shortlisted"])))
      .orderBy(asc(ideas.createdAt)),
  );
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export class PollError extends Error {
  constructor(
    public readonly code:
      | PollDraftError
      | "not_a_member"
      | "organizers_only"
      | "not_available_for_trip_size"
      | "not_found"
      | "bad_stop"
      | "bad_idea"
      | "not_eligible"
      | "not_open"
      | "not_allowed",
  ) {
    super(code);
    this.name = "PollError";
  }
}

async function organizerFor(tx: Tx, claims: Claims, tripId: string) {
  const me = await meIn(tx, claims, tripId);
  if (!me) throw new PollError("not_a_member");
  const size = tripSize((await activeMembers(tx, tripId)).length);
  const d = can({ memberId: me.memberId, role: me.role, status: "active", scope: claims.sub ? "full" : "link" }, "create_poll", {
    tripSize: size,
  });
  if (!d.allowed) throw new PollError(d.reason === "not_available_for_trip_size" ? "not_available_for_trip_size" : "organizers_only");
  return { me, size };
}

/** FR-47 / FR-S12 / FR-92: create a poll between ideas or custom options (optional images). */
export async function createPoll(
  db: Db,
  claims: Claims,
  args: {
    tripId: string;
    question: string;
    kind: "ideas" | "custom";
    stopId?: string | null;
    stage?: StageKind | null;
    closesAt?: Date | null;
    options: { label?: string; ideaId?: string | null; imageUrl?: string | null }[];
    runoffOfPollId?: string | null;
    hiddenFrom?: string[];
  },
  now: Date = new Date(),
): Promise<string> {
  return withSession(db, claims, async (tx) => {
    const { me } = await organizerFor(tx, claims, args.tripId);
    if (args.stopId) {
      const [s] = await tx.select({ id: stops.id }).from(stops).where(and(eq(stops.id, args.stopId), eq(stops.tripId, args.tripId)));
      if (!s) throw new PollError("bad_stop");
    }
    let options = args.options.map((o) => ({ label: o.label ?? "", ideaId: o.ideaId ?? null, imageUrl: o.imageUrl ?? null }));
    if (args.kind === "ideas") {
      const ids = options.map((o) => o.ideaId).filter((x): x is string => !!x);
      const rows = ids.length
        ? await tx.select({ id: ideas.id, title: ideas.title }).from(ideas).where(and(eq(ideas.tripId, args.tripId), inArray(ideas.id, ids)))
        : [];
      if (rows.length !== ids.length || ids.length !== options.length) throw new PollError("bad_idea");
      options = options.map((o) => ({ ...o, label: o.label || rows.find((r) => r.id === o.ideaId)!.title.slice(0, 80) }));
    } else {
      options = options.map((o) => ({ ...o, ideaId: null }));
    }
    const v = validatePollDraft({ question: args.question, options, closesAt: args.closesAt ?? null }, now);
    if (!v.ok) throw new PollError(v.error);
    const [p] = await tx
      .insert(polls)
      .values({
        tripId: args.tripId,
        stopId: args.stopId ?? null,
        stage: args.stage ?? null,
        kind: args.kind,
        question: v.draft.question,
        closesAt: args.closesAt ?? null,
        createdByMemberId: me.memberId,
        runoffOfPollId: args.runoffOfPollId ?? null,
        hiddenFrom: args.hiddenFrom ?? [],
      })
      .returning({ id: polls.id });
    await tx.insert(pollOptions).values(
      v.draft.options.map((o, position) => ({
        pollId: p!.id,
        label: o.label,
        ideaId: o.ideaId ?? null,
        imageUrl: o.imageUrl ?? null,
        position,
      })),
    );
    return p!.id;
  });
}

/**
 * FR-47/43: vote, change or clear while open. Personal-link sessions may vote (FR-5). The DB
 * trigger rejects closed/paused polls and members not attending the poll's Stop.
 */
export async function votePoll(db: Db, claims: Claims, args: { tripId: string; pollId: string; optionId: string | null }) {
  return withSession(db, claims, async (tx) => {
    const me = await meIn(tx, claims, args.tripId);
    if (!me) throw new PollError("not_a_member");
    const [p] = await tx.select().from(polls).where(and(eq(polls.id, args.pollId), eq(polls.tripId, args.tripId)));
    if (!p) throw new PollError("not_found");
    if (pollStatus(p, new Date()) !== "open") throw new PollError("not_open");
    if (!(await eligibleFor(tx, p)).includes(me.memberId)) throw new PollError("not_eligible");
    if (args.optionId === null) {
      await tx.delete(pollVotes).where(and(eq(pollVotes.pollId, p.id), eq(pollVotes.memberId, me.memberId)));
      return;
    }
    await tx
      .insert(pollVotes)
      .values({ pollId: p.id, memberId: me.memberId, optionId: args.optionId, tripId: p.tripId, castInSize: "solo" })
      .onConflictDoUpdate({ target: [pollVotes.pollId, pollVotes.memberId], set: { optionId: args.optionId } });
  });
}

async function loadForOrganizer(tx: Tx, claims: Claims, tripId: string, pollId: string) {
  const { me, size } = await organizerFor(tx, claims, tripId);
  const [p] = await tx.select().from(polls).where(and(eq(polls.id, pollId), eq(polls.tripId, tripId)));
  if (!p) throw new PollError("not_found");
  return { me, size, p };
}

/** V-12: organizer closes early; "Closed early by Sam, 4 of 9 voted". */
export async function closePollEarly(db: Db, claims: Claims, args: { tripId: string; pollId: string }) {
  const winner = await withSession(db, claims, async (tx) => {
    const { me, p } = await loadForOrganizer(tx, claims, args.tripId, args.pollId);
    if (pollStatus(p, new Date()) !== "open" && pollStatus(p, new Date()) !== "paused") throw new PollError("not_open");
    await tx.update(polls).set({ closedAt: new Date(), closedByMemberId: me.memberId, pausedAt: null }).where(eq(polls.id, p.id));
    return p.id;
  });
  // The winner needs raw ballots: computed by the service, only the winning id is stored.
  await asService(db, async (tx) => {
    const [p] = await tx.select().from(polls).where(eq(polls.id, winner));
    const outcome = await rawOutcome(tx, p!);
    if (outcome.kind === "winner") await tx.update(polls).set({ winningOptionId: outcome.optionId }).where(eq(polls.id, winner));
  });
}

async function closedOutcome(tx: Tx, p: PollRow, size: TripSize): Promise<PollOutcome> {
  const results = await pollResults(tx, p.id);
  return pollOutcomeFromTally(
    size,
    results.map((r) => ({ optionId: r.optionId, count: r.voteCount ?? 0 })),
    (await eligibleFor(tx, p)).length,
  );
}

/** FR-48 / FR-T7: the organizer (duo tie: the owner) picks the winner of an undecided poll. */
export async function decidePoll(db: Db, claims: Claims, args: { tripId: string; pollId: string; optionId: string }) {
  return withSession(db, claims, async (tx) => {
    const { me, size, p } = await loadForOrganizer(tx, claims, args.tripId, args.pollId);
    if (pollStatus(p, new Date()) !== "needs_decision") throw new PollError("not_allowed");
    const outcome = await closedOutcome(tx, p, size);
    const optionIds = (await tx.select({ id: pollOptions.id }).from(pollOptions).where(eq(pollOptions.pollId, p.id))).map((o) => o.id);
    if (!canPick(outcome, me.role, args.optionId, optionIds)) throw new PollError("not_allowed");
    await tx.update(polls).set({ winningOptionId: args.optionId }).where(eq(polls.id, p.id));
  });
}

/** FR-48 / V-8: extend the deadline (re-opens an undecided poll). Default 24h. */
export async function extendPoll(
  db: Db,
  claims: Claims,
  args: { tripId: string; pollId: string; byMs?: number },
  now: Date = new Date(),
) {
  return withSession(db, claims, async (tx) => {
    const { me, size, p } = await loadForOrganizer(tx, claims, args.tripId, args.pollId);
    const status = pollStatus(p, now);
    if (status === "decided") throw new PollError("not_allowed");
    if (status === "needs_decision") {
      const { actions } = organizerPollActions(await closedOutcome(tx, p, size), { role: me.role });
      if (!actions.includes("extend")) throw new PollError("not_allowed");
    }
    const byMs = Math.min(Math.max(args.byMs ?? DEFAULT_EXTENSION_MS, 3_600_000), 14 * 86_400_000);
    await tx
      .update(polls)
      .set({
        closesAt: extendDeadline(status === "needs_decision" ? null : p.closesAt, now, byMs),
        closedAt: null,
        closedByMemberId: null,
        winningOptionId: null,
      })
      .where(eq(polls.id, p.id));
  });
}

/** FR-48 / V-7: "Run-off between A and B, 24h". Returns the new poll id. */
export async function runoffPoll(db: Db, claims: Claims, args: { tripId: string; pollId: string }, now: Date = new Date()) {
  const draft = await withSession(db, claims, async (tx) => {
    const { me, size, p } = await loadForOrganizer(tx, claims, args.tripId, args.pollId);
    if (pollStatus(p, now) !== "needs_decision") throw new PollError("not_allowed");
    const outcome = await closedOutcome(tx, p, size);
    const { actions, pickable } = organizerPollActions(outcome, { role: me.role });
    if (!actions.includes("runoff") || pickable === "any") throw new PollError("not_allowed");
    const opts = await tx.select().from(pollOptions).where(inArray(pollOptions.id, pickable)).orderBy(asc(pollOptions.position));
    return { p, opts };
  });
  return createPoll(
    db,
    claims,
    {
      tripId: args.tripId,
      question: `Run-off: ${draft.p.question}`.slice(0, 140),
      kind: draft.p.kind,
      stopId: draft.p.stopId,
      stage: draft.p.stage,
      closesAt: new Date(now.getTime() + DEFAULT_EXTENSION_MS),
      options: draft.opts.map((o) => ({ label: o.label, ideaId: o.ideaId, imageUrl: o.imageUrl })),
      runoffOfPollId: draft.p.id,
      hiddenFrom: draft.p.hiddenFrom,
    },
    now,
  );
}

/** S-4 / S-6: pause or resume. Resuming gives back the time that was left. */
export async function setPollPaused(
  db: Db,
  claims: Claims,
  args: { tripId: string; pollId: string; paused: boolean },
  now: Date = new Date(),
) {
  return withSession(db, claims, async (tx) => {
    const { p } = await loadForOrganizer(tx, claims, args.tripId, args.pollId);
    const status = pollStatus(p, now);
    if (args.paused) {
      if (status !== "open") throw new PollError("not_open");
      await tx.update(polls).set({ pausedAt: now }).where(eq(polls.id, p.id));
    } else {
      if (status !== "paused") throw new PollError("not_allowed");
      await tx
        .update(polls)
        .set({ pausedAt: null, closesAt: resumedDeadline({ closesAt: p.closesAt, pausedAt: p.pausedAt! }, now) })
        .where(eq(polls.id, p.id));
    }
  });
}

