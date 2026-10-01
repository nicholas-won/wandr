/**
 * Typed wrappers for the privacy-preserving SQL functions in migrations/0001_rls.sql.
 * These are the only way other members' votes, poll tallies, turnout and budgets leave the DB;
 * call them inside `withSession` so they run as the caller.
 */
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "./session";

type TripSize = "solo" | "duo" | "group";
export type VoteValue = "must" | "down" | "pass";

/** Rows from `tx.execute` across drivers (PGlite returns `{ rows }`, postgres-js an array). */
export async function rowsOf<T>(tx: Tx, query: SQL): Promise<T[]> {
  const r = (await tx.execute(query)) as unknown;
  return (Array.isArray(r) ? r : (r as { rows: T[] }).rows) as T[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface IdeaReveal {
  ideaId: string;
  viewerVoted: boolean;
  /** Null while blind (group, caller hasn't voted) and always in solo trips. */
  mustCount: number | null;
  downCount: number | null;
  passCount: number | null;
  voterCount: number | null;
  /** Never includes non-voters; Pass names only where the caller may see them (FR-42, FR-T4/T5). */
  voters: { member_id: string; display_name: string; value: VoteValue }[] | null;
}

/** FR-41/42/44, §6.10: per-idea reveal for the caller. */
export async function ideaReveals(tx: Tx, tripId: string): Promise<IdeaReveal[]> {
  const rows = await rowsOf<Record<string, unknown>>(tx, sql`select * from app.idea_reveals(${tripId})`);
  return rows.map((r) => ({
    ideaId: r.idea_id as string,
    viewerVoted: r.viewer_voted as boolean,
    mustCount: num(r.must_count),
    downCount: num(r.down_count),
    passCount: num(r.pass_count),
    voterCount: num(r.voter_count),
    voters: (r.voters as IdeaReveal["voters"]) ?? null,
  }));
}

export interface PollResult {
  optionId: string;
  label: string;
  position: number;
  /** Null until the caller voted or the poll closed; always null in solo trips. */
  voteCount: number | null;
  viewerVoted: boolean;
  /** Group: null (counts only). Duo: names except group-era votes. Solo: own vote. */
  voters: { member_id: string; display_name: string }[] | null;
}

/** FR-47/48, FR-T7. */
export async function pollResults(tx: Tx, pollId: string): Promise<PollResult[]> {
  const rows = await rowsOf<Record<string, unknown>>(tx, sql`select * from app.poll_results(${pollId})`);
  return rows.map((r) => ({
    optionId: r.option_id as string,
    label: r.label as string,
    position: Number(r.position),
    voteCount: num(r.vote_count),
    viewerVoted: r.viewer_voted as boolean,
    voters: (r.voters as PollResult["voters"]) ?? null,
  }));
}

export interface Turnout {
  kind: "idea" | "poll";
  itemId: string;
  eligibleCount: number;
  voterCount: number;
  changedCount: number;
}

/** FR-42/43/48: organizers only; numbers, never names. Empty for everyone else. */
export async function turnout(tx: Tx, tripId: string): Promise<Turnout[]> {
  const rows = await rowsOf<Record<string, unknown>>(tx, sql`select * from app.turnout(${tripId})`);
  return rows.map((r) => ({
    kind: r.kind as Turnout["kind"],
    itemId: r.item_id as string,
    eligibleCount: Number(r.eligible_count),
    voterCount: Number(r.voter_count),
    changedCount: Number(r.changed_count),
  }));
}

export interface BudgetRow {
  kind: "own" | "member" | "band";
  memberId: string | null;
  displayName: string | null;
  currency: string;
  minMinor: number;
  maxMinor: number;
  /** Band rows only. */
  answerCount: number | null;
}

/**
 * FR-74, FR-T4/T5/T9: own answer; another member's answer only if both answered openly as a duo
 * (kept after the trip grows, never for group-era answers); a band per currency with >= 3 answers.
 */
export async function budgetView(tx: Tx, tripId: string): Promise<BudgetRow[]> {
  const rows = await rowsOf<Record<string, unknown>>(tx, sql`select * from app.budget_view(${tripId})`);
  return rows.map((r) => ({
    kind: r.kind as BudgetRow["kind"],
    memberId: (r.member_id as string | null) ?? null,
    displayName: (r.display_name as string | null) ?? null,
    currency: r.currency as string,
    minMinor: Number(r.min_minor),
    maxMinor: Number(r.max_minor),
    answerCount: num(r.answer_count),
  }));
}

/** J-7: what a pending/invited person may see (outsider name), or the real name for members. */
export async function tripPublic(
  tx: Tx,
  tripId: string,
): Promise<{ tripId: string; displayName: string; ownerName: string | null } | null> {
  const [r] = await rowsOf<Record<string, unknown>>(tx, sql`select * from app.trip_public(${tripId})`);
  return r
    ? { tripId: r.trip_id as string, displayName: r.display_name as string, ownerName: (r.owner_name as string) ?? null }
    : null;
}

/** FR-2: the owner hands ownership to an active verified member and becomes an organizer. */
export async function transferOwnership(tx: Tx, tripId: string, toMemberId: string): Promise<void> {
  await tx.execute(sql`select app.transfer_ownership(${tripId}, ${toMemberId})`);
}

/** Trip size from active members (FR-T1); null when the caller isn't in the trip. */
export async function tripSize(tx: Tx, tripId: string): Promise<TripSize | null> {
  const [r] = await rowsOf<{ size: TripSize | null }>(tx, sql`select app.trip_size(${tripId}) as size`);
  return r?.size ?? null;
}
