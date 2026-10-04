/**
 * Money (§6.5): full scope only (FR-5); who edits (FR-68); lock after payment (FR-69);
 * payments and adjustments append-only (FR-71, NFR-5); budgets (FR-74, FR-T4/T5/T9).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import { budgetAnswers, expenses, payments } from "../src/schema";
import { budgetView, type BudgetRow } from "../src/reveals";
import type { Claims } from "../src/session";
import {
  addActiveMember,
  as,
  expectDenied,
  freshDb,
  q,
  query,
  RLS_DENIED,
  seedTrip,
  setStatus,
  sql,
  svc,
  type Actor,
  type Trip,
} from "./fixtures";

let db: Db;
let t: Trip<"owner" | "org" | "a" | "b" | "c">;

beforeAll(async () => {
  db = await freshDb();
  t = await seedTrip(db, {
    owner: { name: "Olivia", role: "owner" },
    org: { name: "Raj", role: "organizer" },
    a: { name: "Ana" },
    b: { name: "Ben" },
    c: { name: "Cat" },
  });
});

async function addExpense(
  who: Actor,
  opts: { currency?: string; total?: number; paidBy?: string; shares?: [string, number][] } = {},
): Promise<string> {
  return as(db, who.full, async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({
        tripId: t.tripId,
        merchant: "Cervejaria Ramiro",
        currency: opts.currency ?? "EUR",
        totalMinor: opts.total ?? 9000,
        paidByMemberId: opts.paidBy ?? who.memberId,
        uploadedByMemberId: who.memberId,
      })
      .returning();
    for (const [memberId, share] of opts.shares ?? []) {
      await q(tx, sql`insert into expense_shares (expense_id, member_id, share_minor) values (${row!.id}, ${memberId}, ${share})`);
    }
    return row!.id;
  });
}

const rename = (claims: Claims, id: string, merchant: string) =>
  as(db, claims, (tx) => tx.update(expenses).set({ merchant }).where(eq(expenses.id, id)).returning());

describe("expenses (FR-68)", () => {
  it("uploader is always the caller and the row is unlocked on insert", async () => {
    const [row] = await as(db, t.m.a.full, (tx) =>
      tx
        .insert(expenses)
        .values({
          tripId: t.tripId,
          merchant: "x",
          currency: "EUR",
          totalMinor: 100,
          paidByMemberId: t.m.a.memberId,
          uploadedByMemberId: t.m.b.memberId,
          lockedAt: new Date(),
        })
        .returning(),
    );
    expect(row).toMatchObject({ uploadedByMemberId: t.m.a.memberId, lockedAt: null });
  });

  it("only the uploader, organizers and the owner can edit", async () => {
    const id = await addExpense(t.m.a);
    expect(await rename(t.m.b.full, id, "nope")).toHaveLength(0);
    expect(await rename(t.m.a.full, id, "by uploader")).toHaveLength(1);
    expect(await rename(t.m.org.full, id, "by organizer")).toHaveLength(1);
    expect(await rename(t.m.owner.full, id, "by owner")).toHaveLength(1);
    expect(await rename(t.m.a.link, id, "by link")).toHaveLength(0);
  });

  it("payer must be in the trip; uploader and lock fields are read-only", async () => {
    const outsider = await seedTrip(db, { x: { name: "X", role: "owner" } });
    await expectDenied(addExpense(t.m.a, { paidBy: outsider.m.x.memberId }), /payer is not in this trip/);
    const id = await addExpense(t.m.a);
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.update(expenses).set({ lockedAt: new Date() }).where(eq(expenses.id, id))),
      /read-only/,
    );
    await expectDenied(
      as(db, t.m.org.full, (tx) => tx.update(expenses).set({ uploadedByMemberId: t.m.org.memberId }).where(eq(expenses.id, id))),
      /read-only/,
    );
  });

  it("never hard-deleted by clients; soft delete by the uploader works; service may delete", async () => {
    const id = await addExpense(t.m.a);
    await expectDenied(as(db, t.m.a.full, (tx) => tx.delete(expenses).where(eq(expenses.id, id))), /permission denied/);
    await as(db, t.m.a.full, (tx) => tx.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id)));
    await expectDenied(rename(t.m.a.full, id, "zombie"), /deleted/);
    await svc(db, (tx) => tx.delete(expenses).where(eq(expenses.id, id)));
  });

  it("members claim their own items; only editors assign others (FR-62)", async () => {
    const id = await addExpense(t.m.a);
    const [item] = await query<{ id: string }>(
      db,
      t.m.a.full,
      sql`insert into expense_items (expense_id, label, amount_minor) values (${id}, 'Prawns', 3000) returning id`,
    );
    await expectDenied(
      query(db, t.m.b.full, sql`insert into expense_items (expense_id, label, amount_minor) values (${id}, 'Beer', 500)`),
      RLS_DENIED,
    );
    await query(db, t.m.b.full, sql`insert into expense_item_claims (item_id, member_id) values (${item!.id}, ${t.m.b.memberId})`);
    await expectDenied(
      query(db, t.m.b.full, sql`insert into expense_item_claims (item_id, member_id) values (${item!.id}, ${t.m.c.memberId})`),
      RLS_DENIED,
    );
    await query(db, t.m.a.full, sql`insert into expense_item_claims (item_id, member_id) values (${item!.id}, ${t.m.c.memberId})`);
    await expectDenied(
      query(db, t.m.b.link, sql`insert into expense_item_claims (item_id, member_id) values (${item!.id}, ${t.m.b.memberId})`),
      RLS_DENIED,
    );
  });
});

describe("payments lock expenses (FR-69, FR-71, NFR-5)", () => {
  let dinner: string; // Ana paid, shared with Ben
  let taxi: string; // Cat paid, Ben has a share
  let unrelated: string; // Raj paid, only Raj and Cat
  let usd: string; // Ana paid, other currency
  let paymentId: string;

  beforeAll(async () => {
    dinner = await addExpense(t.m.a, { shares: [[t.m.a.memberId, 4500], [t.m.b.memberId, 4500]] });
    taxi = await addExpense(t.m.c, { shares: [[t.m.b.memberId, 1000], [t.m.c.memberId, 1000]] });
    unrelated = await addExpense(t.m.org, { shares: [[t.m.org.memberId, 500], [t.m.c.memberId, 500]] });
    usd = await addExpense(t.m.a, { currency: "USD", shares: [[t.m.b.memberId, 100]] });
    const [p] = await as(db, t.m.b.full, (tx) =>
      tx
        .insert(payments)
        .values({
          tripId: t.tripId,
          fromMemberId: t.m.b.memberId,
          toMemberId: t.m.a.memberId,
          currency: "EUR",
          amountMinor: 4500,
          recordedByMemberId: t.m.a.memberId,
        })
        .returning(),
    );
    paymentId = p!.id;
    expect(p!.recordedByMemberId).toBe(t.m.b.memberId);
  });

  it("locks expenses in that currency involving either party, and only those", async () => {
    const rows = await svc(db, (tx) =>
      q<{ id: string; locked: boolean }>(tx, sql`select id, locked_at is not null as locked from expenses
        where id in (${dinner}, ${taxi}, ${unrelated}, ${usd})`),
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.locked]))).toEqual({
      [dinner]: true,
      [taxi]: true,
      [unrelated]: false,
      [usd]: false,
    });
  });

  it("locked expenses reject edits and soft deletes from everyone, organizers included", async () => {
    await expectDenied(rename(t.m.a.full, dinner, "edited"), /locked/);
    await expectDenied(rename(t.m.owner.full, dinner, "edited"), /locked/);
    await expectDenied(
      as(db, t.m.org.full, (tx) => tx.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, dinner))),
      /locked/,
    );
    await expectDenied(
      query(db, t.m.a.full, sql`update expense_shares set share_minor = 1 where expense_id = ${dinner}`),
      /locked/,
    );
    await expectDenied(
      query(db, t.m.a.full, sql`insert into expense_shares (expense_id, member_id, share_minor) values (${dinner}, ${t.m.c.memberId}, 1)`),
      /locked/,
    );
    await expectDenied(query(db, t.m.a.full, sql`delete from expense_shares where expense_id = ${dinner}`), /locked/);
    expect(await rename(t.m.org.full, unrelated, "still editable")).toHaveLength(1);
  });

  it("fixes go through append-only adjustment entries", async () => {
    const [adj] = await query<{ id: string; trip_id: string; created_by_member_id: string }>(
      db,
      t.m.a.full,
      sql`insert into expense_adjustments (expense_id, trip_id, member_id, delta_minor, reason, created_by_member_id)
        values (${dinner}, ${randomUUID()}, ${t.m.b.memberId}, -500, 'Ben skipped dessert', ${t.m.c.memberId})
        returning id, trip_id, created_by_member_id`,
    );
    expect(adj).toMatchObject({ trip_id: t.tripId, created_by_member_id: t.m.a.memberId });
    // Not the uploader or an organizer:
    await expectDenied(
      query(db, t.m.c.full, sql`insert into expense_adjustments (expense_id, trip_id, member_id, delta_minor, reason, created_by_member_id)
        values (${dinner}, ${t.tripId}, ${t.m.b.memberId}, 1, 'x', ${t.m.c.memberId})`),
      RLS_DENIED,
    );
    await expectDenied(query(db, t.m.a.full, sql`update expense_adjustments set delta_minor = 0`), /permission denied/);
    await expectDenied(svc(db, (tx) => q(tx, sql`update expense_adjustments set delta_minor = 0 where id = ${adj!.id}`)), /append-only/);
    await expectDenied(svc(db, (tx) => q(tx, sql`delete from expense_adjustments where id = ${adj!.id}`)), /append-only/);
  });

  it("payments can never be updated or deleted, not even by the service", async () => {
    await expectDenied(
      query(db, t.m.b.full, sql`update payments set amount_minor = 1 where id = ${paymentId}`),
      /permission denied/,
    );
    await expectDenied(query(db, t.m.b.full, sql`delete from payments where id = ${paymentId}`), /permission denied/);
    await expectDenied(svc(db, (tx) => q(tx, sql`update payments set amount_minor = 1 where id = ${paymentId}`)), /append-only/);
    await expectDenied(svc(db, (tx) => q(tx, sql`delete from payments where id = ${paymentId}`)), /append-only/);
    await expectDenied(svc(db, (tx) => q(tx, sql`truncate payments`)), /append-only/);
    const [row] = await svc(db, (tx) => tx.select().from(payments).where(eq(payments.id, paymentId)));
    expect(row!.amountMinor).toBe(4500);
  });

  it("validates payments and keeps them full-scope only", async () => {
    const pay = (claims: Claims, from: string, to: string, amount: number) =>
      as(db, claims, (tx) =>
        tx.insert(payments).values({
          tripId: t.tripId,
          fromMemberId: from,
          toMemberId: to,
          currency: "EUR",
          amountMinor: amount,
          recordedByMemberId: from,
        }),
      );
    await expectDenied(pay(t.m.a.full, t.m.a.memberId, t.m.a.memberId, 100), /different members/);
    await expectDenied(pay(t.m.a.full, t.m.a.memberId, t.m.b.memberId, 0), /positive/);
    await expectDenied(pay(t.m.a.link, t.m.a.memberId, t.m.b.memberId, 100), RLS_DENIED);
    expect(await query(db, t.m.a.link, sql`select * from payments`)).toHaveLength(0);
    expect(await query(db, t.m.a.link, sql`select * from expense_shares`)).toHaveLength(0);
    expect((await query(db, t.m.c.full, sql`select * from payments`)).length).toBeGreaterThan(0);
  });

  it("an audit trail records creation, edits and locks (FR-68)", async () => {
    const rows = await query<{ action: string }>(
      db,
      t.m.org.full,
      sql`select action from audit_log where entity = 'expense' and entity_id = ${dinner} order by created_at, action`,
    );
    expect(rows.map((r) => r.action).sort()).toEqual(["create", "lock"]);
  });
});

describe("budget check-in (FR-74, FR-T4/T5/T9, NFR-3)", () => {
  const answer = (who: Actor, min: number, max: number, currency = "USD") =>
    as(db, who.full, (tx) =>
      tx
        .insert(budgetAnswers)
        .values({ memberId: who.memberId, tripId: randomUUID(), currency, minMinor: min, maxMinor: max, openTo: [] })
        .onConflictDoUpdate({
          target: budgetAnswers.memberId,
          set: { minMinor: min, maxMinor: max, currency },
        }),
    );
  const kinds = (rows: BudgetRow[]) => rows.map((r) => `${r.kind}:${r.displayName ?? "-"}`).sort();

  it("is refused while the check-in is off", async () => {
    await expectDenied(answer(t.m.a, 100, 200), /check-in is off/);
  });

  it("group: the band appears only with 3+ answers, rounded outward to 50 major units", async () => {
    const g = await seedTrip(
      db,
      { o: { name: "Olivia", role: "owner" }, a: { name: "Ana" }, b: { name: "Ben" }, c: { name: "Cat" } },
      { budgetCheckIn: true },
    );
    await answer(g.m.a, 31_000, 52_000);
    await answer(g.m.b, 40_000, 61_234);
    let view = await as(db, g.m.a.full, (tx) => budgetView(tx, g.tripId));
    expect(kinds(view)).toEqual(["own:Ana"]);
    expect(await query(db, g.m.a.full, sql`select member_id from budget_answers`)).toEqual([{ member_id: g.m.a.memberId }]);
    expect(await query(db, g.m.o.full, sql`select * from budget_answers`)).toHaveLength(0);

    await answer(g.m.c, 35_000, 45_000);
    view = await as(db, g.m.o.full, (tx) => budgetView(tx, g.tripId));
    expect(view).toEqual([
      { kind: "band", memberId: null, displayName: null, currency: "USD", minMinor: 30_000, maxMinor: 65_000, answerCount: 3 },
    ]);
    expect(await as(db, g.m.a.link, (tx) => budgetView(tx, g.tripId))).toEqual([]);
    // A removed member's answer stops counting.
    await setStatus(db, g.m.c.memberId, "removed");
    expect(kinds(await as(db, g.m.o.full, (tx) => budgetView(tx, g.tripId)))).toEqual([]);
  });

  it("cannot write someone else's answer or spoof open_to", async () => {
    const g = await seedTrip(db, { a: { name: "Ana", role: "owner" }, b: { name: "Ben" }, c: { name: "Cat" } }, { budgetCheckIn: true });
    await expectDenied(
      as(db, g.m.a.full, (tx) =>
        tx.insert(budgetAnswers).values({ memberId: g.m.b.memberId, tripId: g.tripId, currency: "USD", minMinor: 1, maxMinor: 2 }),
      ),
      RLS_DENIED,
    );
    await as(db, g.m.a.full, (tx) =>
      tx.insert(budgetAnswers).values({
        memberId: g.m.a.memberId,
        tripId: g.tripId,
        currency: "USD",
        minMinor: 1,
        maxMinor: 2,
        openTo: [g.m.b.memberId],
      }),
    );
    const [row] = await svc(db, (tx) => tx.select().from(budgetAnswers).where(eq(budgetAnswers.memberId, g.m.a.memberId)));
    expect(row!.openTo).toEqual([]);
    await expectDenied(answer(g.m.b, 500, 100), /invalid budget range/);
  });

  it("duo: each sees the other's range only after both answered (FR-T9)", async () => {
    const d = await seedTrip(db, { a: { name: "Ana", role: "owner" }, b: { name: "Ben" } }, { budgetCheckIn: true });
    await answer(d.m.a, 50_000, 80_000);
    expect(kinds(await as(db, d.m.b.full, (tx) => budgetView(tx, d.tripId)))).toEqual([]);
    expect(kinds(await as(db, d.m.a.full, (tx) => budgetView(tx, d.tripId)))).toEqual(["own:Ana"]);
    await answer(d.m.b, 60_000, 90_000);
    expect(kinds(await as(db, d.m.a.full, (tx) => budgetView(tx, d.tripId)))).toEqual(["member:Ben", "own:Ana"]);
    expect(kinds(await as(db, d.m.b.full, (tx) => budgetView(tx, d.tripId)))).toEqual(["member:Ana", "own:Ben"]);

    // Duo → group (FR-T4): the pair keeps seeing each other; the newcomer gets only the band rule.
    const cat = await addActiveMember(db, d.tripId, "Cat");
    expect(kinds(await as(db, d.m.a.full, (tx) => budgetView(tx, d.tripId)))).toEqual(["member:Ben", "own:Ana"]);
    expect(kinds(await as(db, cat.full, (tx) => budgetView(tx, d.tripId)))).toEqual([]);
    await answer(cat, 20_000, 30_000);
    expect(kinds(await as(db, cat.full, (tx) => budgetView(tx, d.tripId)))).toEqual(["band:-", "own:Cat"]);
    // Ana re-saving the same range keeps it open; changing it in a group makes it private.
    await answer(d.m.a, 50_000, 80_000);
    expect(kinds(await as(db, d.m.b.full, (tx) => budgetView(tx, d.tripId)))).toContain("member:Ana");
    await answer(d.m.a, 55_000, 80_000);
    expect(kinds(await as(db, d.m.b.full, (tx) => budgetView(tx, d.tripId)))).not.toContain("member:Ana");
  });

  it("group → duo: answers given in the group are never revealed (FR-T5)", async () => {
    const g = await seedTrip(db, { a: { name: "Ana", role: "owner" }, b: { name: "Ben" }, c: { name: "Cat" } }, { budgetCheckIn: true });
    await answer(g.m.a, 10_000, 20_000);
    await answer(g.m.b, 15_000, 25_000);
    await setStatus(db, g.m.c.memberId, "removed");
    expect(kinds(await as(db, g.m.a.full, (tx) => budgetView(tx, g.tripId)))).toEqual(["own:Ana"]);
    await answer(g.m.b, 15_000, 25_000); // unchanged re-save stays private
    expect(kinds(await as(db, g.m.a.full, (tx) => budgetView(tx, g.tripId)))).toEqual(["own:Ana"]);
    // New answers from both follow duo rules.
    await answer(g.m.a, 11_000, 20_000);
    await answer(g.m.b, 16_000, 25_000);
    expect(kinds(await as(db, g.m.a.full, (tx) => budgetView(tx, g.tripId)))).toEqual(["member:Ben", "own:Ana"]);
  });
});
