/**
 * Account settings (FR-3, FR-9, FR-16, NFR-5, NFR-7; J-4, J-6, J-11, M-1, M-2).
 *
 * - The account page: name, masked phone, email (J-6).
 * - Deleting an account: hand over or delete owned trips, then anonymize. Member rows stay as
 *   "Former member" so other people's balances still add up (NFR-5/NFR-7).
 * - The recycled-number recheck: organizers confirm it's them, in the app (FR-16, D65: no texts).
 * - The money-only view for removed members (FR-9, M-1, M-2): only through the SQL functions in
 *   migrations/0012_account_recheck_rls.sql, run as the caller.
 *
 * Every function takes the verified user id; callers (Server Actions / pages) authenticate first.
 */
import { and, count, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import {
  asService,
  auditLog,
  boardItems,
  boardMembers,
  boards,
  memberContacts,
  members,
  otpRequests,
  outboundMessages,
  savedIdeaNotes,
  savedIdeas,
  savedIdeaSources,
  savedIdeaTripSends,
  smsOpenQuestions,
  smsUndo,
  users,
  withSession,
  type Db,
  type Tx,
} from "@wandr/db";
import { rowsOf } from "@wandr/db/reveals";
import { formerMemberLedger, myFormerTrips, recordFormerPayment, type FormerLedger } from "@wandr/db/former";
import {
  accountDeleteConfirmed,
  can,
  FORMER_MEMBER_NAME,
  money,
  openBalancesFor,
  planAccountDeletion,
  type AccountTripPlan,
} from "@wandr/core";
import { revokeLinksForMembers } from "@/lib/auth/personal-link";
import { maskPhone } from "@/lib/auth/phone";
import { clearRecheck } from "@/lib/auth/signin";
import { handOverOwnership, loadAccountTrips, softDeleteTripTx, tripBalances, type OpenBalance } from "./membership";

export class AccountError extends Error {
  constructor(public readonly code: "not_found" | "confirmation_mismatch" | "not_allowed" | "invalid") {
    super(code);
    this.name = "AccountError";
  }
}

// ---------------------------------------------------------------------------
// The account page (J-6)
// ---------------------------------------------------------------------------

export interface AccountView {
  name: string;
  /** "•••• 0100", never the full number. */
  phone: string | null;
  email: string | null;
  recheckPending: boolean;
}

export async function getAccount(db: Db, userId: string): Promise<AccountView | null> {
  const [u] = await asService(db, (tx) =>
    tx
      .select({ name: users.displayName, phone: users.phone, email: users.email, recheck: users.recheckPendingAt, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId)),
  );
  if (!u || u.deletedAt) return null;
  return { name: u.name, phone: u.phone ? maskPhone(u.phone) : null, email: u.email, recheckPending: !!u.recheck };
}

// ---------------------------------------------------------------------------
// Deleting an account (FR-3, J-11, NFR-5, NFR-7)
// ---------------------------------------------------------------------------

export interface AccountDeletionPreview {
  plans: AccountTripPlan[];
  /** Open balances per trip (non-zero, per currency), so they can settle first (M-1, M-2). */
  balances: Record<string, OpenBalance[]>;
  library: { saves: number; boards: number };
}

async function libraryCounts(tx: Tx, userId: string) {
  const [s] = await tx.select({ n: count() }).from(savedIdeas).where(eq(savedIdeas.userId, userId));
  const [b] = await tx.select({ n: count() }).from(boards).where(eq(boards.ownerUserId, userId));
  return { saves: s?.n ?? 0, boards: b?.n ?? 0 };
}

/** Exactly what deleting the account would do, trip by trip. */
export async function accountDeletionPreview(db: Db, userId: string, picks: Record<string, string> = {}): Promise<AccountDeletionPreview> {
  return asService(db, async (tx) => {
    const trips = await loadAccountTrips(tx, userId);
    const plans = planAccountDeletion(trips, picks);
    const balances: Record<string, OpenBalance[]> = {};
    for (const t of trips) {
      const open = openBalancesFor(await tripBalances(tx, t.tripId), t.myMemberId);
      if (open.length) balances[t.tripId] = open;
    }
    return { plans, balances, library: await libraryCounts(tx, userId) };
  });
}

/**
 * FR-3 / NFR-7: delete the account after the typed confirmation. In one transaction:
 * 1. Owned trips go to the picked (or default) successor; trips with nobody else are soft-deleted.
 * 2. Every member row of theirs becomes "Former member", removed, links revoked. Rows (and so
 *    expenses, shares and payments) are kept: balances still sum to zero (NFR-5).
 * 3. Library saves, notes and boards are deleted; board memberships end.
 * 4. The user row is anonymized (no phone, email or name) and marked deleted, which signs out
 *    every device (getSession refuses it). Contact copies and message logs are scrubbed.
 */
export async function deleteAccount(
  db: Db,
  args: { userId: string; confirmation: string; picks?: Record<string, string>; now?: Date },
): Promise<{ handedOver: number; deletedTrips: number; left: number }> {
  if (!accountDeleteConfirmed(args.confirmation)) throw new AccountError("confirmation_mismatch");
  const now = args.now ?? new Date();
  return asService(db, async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, args.userId)).for("update");
    if (!u || u.deletedAt) throw new AccountError("not_found");

    const plans = planAccountDeletion(await loadAccountTrips(tx, args.userId), args.picks ?? {});
    const tally = { handedOver: 0, deletedTrips: 0, left: 0 };
    for (const p of plans) {
      if (p.kind === "hand_over") {
        await handOverOwnership(tx, { tripId: p.tripId, fromMemberId: p.myMemberId, toMemberId: p.successorMemberId, picked: p.picked });
        tally.handedOver++;
      } else if (p.kind === "delete_trip") {
        await softDeleteTripTx(tx, { tripId: p.tripId, actorId: p.myMemberId, now, reason: "account_deleted" });
        tally.deletedTrips++;
      } else if (!p.alreadyFormer) {
        tally.left++;
      }
    }

    // 2. Member rows: kept, anonymized, removed.
    const mine = await tx.select({ id: members.id, tripId: members.tripId, status: members.status }).from(members).where(eq(members.userId, args.userId));
    const ids = mine.map((m) => m.id);
    if (ids.length) {
      for (const m of mine) {
        await tx
          .update(members)
          .set({
            displayName: FORMER_MEMBER_NAME,
            role: "member",
            status: "removed",
            ...(m.status === "removed" ? {} : { removedAt: now }),
            isGuestOfHonor: false,
          })
          .where(eq(members.id, m.id));
        if (m.status !== "removed") {
          await tx.insert(auditLog).values({ tripId: m.tripId, actorMemberId: m.id, action: "member.account_deleted", entity: "member", entityId: m.id });
        }
      }
      await revokeLinksForMembers(tx, ids);
      await tx.update(memberContacts).set({ phone: null, email: null }).where(inArray(memberContacts.memberId, ids));
      await tx.delete(smsOpenQuestions).where(inArray(smsOpenQuestions.memberId, ids));
    }

    // 3. Library (FR-L*): their saves, notes and boards go; board-only saves on their boards too.
    const myBoards = (await tx.select({ id: boards.id }).from(boards).where(eq(boards.ownerUserId, args.userId))).map((b) => b.id);
    if (myBoards.length) {
      const boardOnly = await tx
        .select({ id: savedIdeas.id })
        .from(savedIdeas)
        .innerJoin(boardItems, eq(boardItems.savedIdeaId, savedIdeas.id))
        .where(and(isNull(savedIdeas.userId), inArray(boardItems.boardId, myBoards)));
      await tx.delete(boards).where(inArray(boards.id, myBoards));
      if (boardOnly.length) {
        // Only those no other board still holds.
        const still = new Set(
          (await tx.select({ id: boardItems.savedIdeaId }).from(boardItems).where(inArray(boardItems.savedIdeaId, boardOnly.map((b) => b.id)))).map((r) => r.id),
        );
        const gone = boardOnly.map((b) => b.id).filter((id) => !still.has(id));
        if (gone.length) await tx.delete(savedIdeas).where(inArray(savedIdeas.id, gone));
      }
    }
    await tx.delete(savedIdeaTripSends).where(eq(savedIdeaTripSends.sentByUserId, args.userId));
    await tx.delete(savedIdeaNotes).where(eq(savedIdeaNotes.userId, args.userId));
    await tx.delete(savedIdeas).where(eq(savedIdeas.userId, args.userId));
    await tx.update(savedIdeaSources).set({ addedByUserId: null }).where(eq(savedIdeaSources.addedByUserId, args.userId));
    await tx.update(savedIdeas).set({ queuedForUserId: null }).where(eq(savedIdeas.queuedForUserId, args.userId));
    await tx.delete(boardMembers).where(eq(boardMembers.userId, args.userId));

    // 4. The person: anonymized, deleted, signed out everywhere. STOP opt-outs stay (keyed by a
    // hash of the number in audit_log), so a deleted person is never texted again (FR-85).
    const contacts = [u.phone, u.email].filter((c): c is string => !!c);
    if (contacts.length) {
      await tx.delete(otpRequests).where(inArray(otpRequests.destination, contacts));
      await tx.delete(smsOpenQuestions).where(inArray(smsOpenQuestions.phone, contacts));
      await tx.delete(smsUndo).where(inArray(smsUndo.phone, contacts));
    }
    await tx
      .update(outboundMessages)
      .set({ toAddress: "deleted", body: "" })
      .where(
        or(
          contacts.length ? inArray(outboundMessages.toAddress, contacts) : sql`false`,
          ids.length ? inArray(outboundMessages.memberId, ids) : sql`false`,
        ),
      );
    await tx
      .update(users)
      .set({ phone: null, email: null, displayName: FORMER_MEMBER_NAME, deletedAt: now, recheckPendingAt: null })
      .where(eq(users.id, args.userId));
    await tx.insert(auditLog).values({ action: "user.deleted", entity: "user", entityId: args.userId, data: tally });
    return tally;
  });
}

// ---------------------------------------------------------------------------
// Recycled-number recheck: organizers confirm in the app (FR-16, J-4, D65)
// ---------------------------------------------------------------------------

export interface RecheckRequest {
  memberId: string;
  name: string;
  since: Date;
}

async function organizerOf(db: Db, userId: string, tripId: string) {
  return withSession(db, { sub: userId }, async (tx) => {
    const [me] = await tx
      .select({ id: members.id, role: members.role, status: members.status })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)));
    // RLS: app.is_organizer is false while the organizer's own recheck is pending.
    const [ok] = await rowsOf<{ v: boolean }>(tx, sql`select app.is_organizer(${tripId}::uuid) as v`);
    if (!me || !ok?.v || !can({ memberId: me.id, role: me.role, status: me.status, scope: "full" }, "approve_join").allowed) return null;
    return me;
  });
}

/** People in this trip waiting for someone to confirm it's them. Organizers only. */
export async function listRecheckRequests(db: Db, userId: string, tripId: string): Promise<RecheckRequest[]> {
  const me = await organizerOf(db, userId, tripId);
  if (!me) return [];
  return asService(db, (tx) =>
    tx
      .select({ memberId: members.id, name: members.displayName, since: users.recheckPendingAt })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.tripId, tripId),
          inArray(members.status, ["active", "not_attending"]),
          ne(members.id, me.id),
          isNotNull(users.recheckPendingAt),
          isNull(users.deletedAt),
        ),
      )
      .then((rows) => rows.map((r) => ({ ...r, since: r.since! }))),
  );
}

/**
 * An organizer confirms "Yes, that's Sam" (FR-16, J-4). Clears the check for Sam's account:
 * the organizer knows the person, which is the second factor J-4 asks for.
 */
export async function approveRecheck(db: Db, args: { userId: string; tripId: string; memberId: string }): Promise<void> {
  const me = await organizerOf(db, args.userId, args.tripId);
  if (!me) throw new AccountError("not_allowed");
  await asService(db, async (tx) => {
    const [target] = await tx
      .select({ userId: members.userId, pending: users.recheckPendingAt })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.id, args.memberId), eq(members.tripId, args.tripId), inArray(members.status, ["active", "not_attending"])));
    if (!target?.userId || !target.pending || target.userId === args.userId) throw new AccountError("not_found");
    await clearRecheck(tx, target.userId, "organizer", me.id, args.tripId);
  });
}

/** For the recheck screen: does any trip of theirs have an organizer who can confirm them? */
export async function recheckHasOrganizer(db: Db, userId: string): Promise<boolean> {
  return asService(db, async (tx) => {
    const [r] = await tx
      .select({ n: count() })
      .from(members)
      .where(
        and(
          inArray(members.status, ["active", "not_attending"]),
          eq(members.userId, userId),
          sql`exists (select 1 from members o where o.trip_id = ${members.tripId} and o.status = 'active'
                and o.role in ('owner','organizer') and o.user_id is not null and o.user_id <> ${userId})`,
        ),
      );
    return (r?.n ?? 0) > 0;
  });
}

// ---------------------------------------------------------------------------
// Money-only view for removed members (FR-9, M-1, M-2)
// ---------------------------------------------------------------------------

export interface FormerTripSummary {
  tripId: string;
  tripName: string;
  /** Per currency; zero = settled. */
  balances: Record<string, number>;
}

export function ledgerBalances(l: FormerLedger): Record<string, number> {
  return money.ownBalances({ expenses: l.expenses, adjustments: l.adjustments, payments: l.payments });
}

/** "Former trips · settle up" on /trips: trips they were removed from that have money in them. */
export async function listFormerTrips(db: Db, userId: string): Promise<FormerTripSummary[]> {
  return withSession(db, { sub: userId }, async (tx) => {
    const out: FormerTripSummary[] = [];
    for (const t of await myFormerTrips(tx)) {
      const l = await formerMemberLedger(tx, t.tripId);
      if (!l || (l.expenses.length === 0 && l.adjustments.length === 0 && l.payments.length === 0)) continue;
      out.push({ tripId: t.tripId, tripName: t.tripName, balances: ledgerBalances(l) });
    }
    return out;
  });
}

export async function getFormerMoney(db: Db, userId: string, tripId: string): Promise<(FormerLedger & { balances: Record<string, number> }) | null> {
  return withSession(db, { sub: userId }, async (tx) => {
    const l = await formerMemberLedger(tx, tripId);
    return l ? { ...l, balances: ledgerBalances(l) } : null;
  });
}

/** A former member records "I paid Olivia" / "Olivia paid me" (FR-71). The DB checks everything again. */
export async function recordFormerSettleUp(
  db: Db,
  userId: string,
  input: { tripId: string; otherMemberId: string; iPaid: boolean; currency: string; amountMinor: number; note?: string | null },
): Promise<void> {
  money.assertPayment({ fromMemberId: "me", toMemberId: input.otherMemberId, currency: input.currency, amountMinor: input.amountMinor });
  await withSession(db, { sub: userId }, (tx) => recordFormerPayment(tx, input)).catch((e: unknown) => {
    const msg = e instanceof Error ? `${e.message} ${(e as { cause?: Error }).cause?.message ?? ""}` : "";
    if (/not a former member/.test(msg)) throw new AccountError("not_found");
    if (/pick someone|currency|positive/.test(msg)) throw new AccountError("invalid");
    throw e;
  });
}
