/**
 * Bachelor/bachelorette mode (§6.7): guest of honor (FR-90) and surprise mode (FR-91).
 *
 * RLS + triggers enforce who may hide things and that hidden members can't read them. This module
 * adds the cascade the DB can't infer: hiding an idea also hides its plan items and every poll
 * that offers it, so nothing leaks through a poll option, a plan block or a count.
 */
import { and, eq, inArray } from "drizzle-orm";
import { expenses, ideas, members, planItems, pollOptions, polls, trips, withSession, type Claims, type Db, type Tx } from "@wandr/db";

const uniq = (xs: string[]) => [...new Set(xs)].sort();

async function activeMemberIds(tx: Tx, tripId: string) {
  const rows = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.tripId, tripId), eq(members.status, "active")));
  return new Set(rows.map((r) => r.id));
}

/** Organizers can't hide an item from themselves (they'd lose it); only active members count. */
async function cleanHiddenList(tx: Tx, tripId: string, memberIds: string[], myMemberId: string) {
  const active = await activeMemberIds(tx, tripId);
  return uniq(memberIds.filter((id) => active.has(id) && id !== myMemberId));
}

async function myMember(tx: Tx, claims: Claims, tripId: string) {
  const [me] = await tx
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(
      and(
        eq(members.tripId, tripId),
        claims.sub ? eq(members.userId, claims.sub) : eq(members.id, claims.link_member ?? ""),
      ),
    );
  if (!me || me.role === "member") throw new Error("not_allowed");
  return me;
}

/** FR-91: hide an idea (and its plan items and polls) from these members. Empty list = visible. */
export async function setIdeaHiddenFrom(db: Db, claims: Claims, args: { ideaId: string; memberIds: string[] }) {
  return withSession(db, claims, async (tx) => {
    const [idea] = await tx.select({ tripId: ideas.tripId, hiddenFrom: ideas.hiddenFrom }).from(ideas).where(eq(ideas.id, args.ideaId));
    if (!idea) throw new Error("not_found");
    const me = await myMember(tx, claims, idea.tripId);
    const hidden = await cleanHiddenList(tx, idea.tripId, args.memberIds, me.id);
    await tx.update(ideas).set({ hiddenFrom: hidden }).where(eq(ideas.id, args.ideaId));
    await tx.update(planItems).set({ hiddenFrom: hidden }).where(eq(planItems.ideaId, args.ideaId));
    // A poll offering this idea must be hidden from everyone it's hidden from (union, never shrink).
    const pollIds = (
      await tx.select({ pollId: pollOptions.pollId }).from(pollOptions).where(eq(pollOptions.ideaId, args.ideaId))
    ).map((r) => r.pollId);
    if (pollIds.length) {
      const rows = await tx.select({ id: polls.id, hiddenFrom: polls.hiddenFrom }).from(polls).where(inArray(polls.id, pollIds));
      for (const p of rows) {
        await tx.update(polls).set({ hiddenFrom: uniq([...p.hiddenFrom, ...hidden]) }).where(eq(polls.id, p.id));
      }
    }
    return hidden;
  });
}

export async function setPollHiddenFrom(db: Db, claims: Claims, args: { pollId: string; memberIds: string[] }) {
  return withSession(db, claims, async (tx) => {
    const [poll] = await tx.select({ tripId: polls.tripId }).from(polls).where(eq(polls.id, args.pollId));
    if (!poll) throw new Error("not_found");
    const me = await myMember(tx, claims, poll.tripId);
    const hidden = await cleanHiddenList(tx, poll.tripId, args.memberIds, me.id);
    await tx.update(polls).set({ hiddenFrom: hidden }).where(eq(polls.id, args.pollId));
    return hidden;
  });
}

/** FR-91: e.g. the bach house deposit hidden from the guest of honor. */
export async function setExpenseHiddenFrom(db: Db, claims: Claims, args: { expenseId: string; memberIds: string[] }) {
  return withSession(db, claims, async (tx) => {
    const [x] = await tx.select({ tripId: expenses.tripId }).from(expenses).where(eq(expenses.id, args.expenseId));
    if (!x) throw new Error("not_found");
    const me = await myMember(tx, claims, x.tripId);
    const hidden = await cleanHiddenList(tx, x.tripId, args.memberIds, me.id);
    await tx.update(expenses).set({ hiddenFrom: hidden }).where(eq(expenses.id, args.expenseId));
    return hidden;
  });
}

/** FR-90: mark/unmark a guest of honor (organizers; RLS + trigger enforce and audit). */
export async function setGuestOfHonor(db: Db, claims: Claims, args: { tripId: string; memberId: string; on: boolean }) {
  return withSession(db, claims, async (tx) => {
    await myMember(tx, claims, args.tripId);
    await tx
      .update(members)
      .set({ isGuestOfHonor: args.on })
      .where(and(eq(members.id, args.memberId), eq(members.tripId, args.tripId)));
  });
}

/** §6.7 opt-in; §6.10: bachelor/bachelorette mode is for groups only. */
export async function setBachMode(db: Db, claims: Claims, args: { tripId: string; on: boolean }) {
  return withSession(db, claims, async (tx) => {
    await myMember(tx, claims, args.tripId);
    if (args.on && (await activeMemberIds(tx, args.tripId)).size < 3) throw new Error("group_only");
    await tx.update(trips).set({ bachMode: args.on }).where(eq(trips.id, args.tripId));
  });
}

/** The one-tap surprise target: everyone marked guest of honor. */
export async function guestsOfHonor(db: Db, claims: Claims, tripId: string) {
  return withSession(db, claims, async (tx) =>
    tx
      .select({ id: members.id, displayName: members.displayName })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.status, "active"), eq(members.isGuestOfHonor, true))),
  );
}
