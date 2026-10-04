/**
 * Money-only view for removed members (FR-9, M-1, M-2, P-8), the recycled-number recheck
 * (FR-16, J-4) and deleted accounts (NFR-7), against real Postgres + RLS
 * (migrations/0012_account_recheck_rls.sql).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { money } from "@wandr/core";
import type { Db } from "../src/client";
import { formerMemberLedger, myFormerTrips, recordFormerPayment } from "../src/former";
import { as, expectDenied, freshDb, q, query, seedIdea, seedTrip, setStatus, sql, svc, type Trip } from "./fixtures";

let db: Db;
let t: Trip<"owner" | "a" | "b" | "c">;
const ids = { dinner: "", taxi: "", surprise: "", elsewhere: "" };

async function expense(paidBy: string, total: number, shares: [string, number][], opts: { hiddenFrom?: string[]; currency?: string; merchant?: string } = {}) {
  const id = randomUUID();
  await svc(db, async (tx) => {
    await tx.execute(sql`insert into expenses (id, trip_id, merchant, currency, total_minor, paid_by_member_id, uploaded_by_member_id, hidden_from)
      values (${id}, ${t.tripId}, ${opts.merchant ?? "Dinner"}, ${opts.currency ?? "EUR"}, ${total}, ${paidBy}, ${paidBy},
              ${`{${(opts.hiddenFrom ?? []).join(",")}}`}::uuid[])`);
    for (const [m, s] of shares) {
      await tx.execute(sql`insert into expense_shares (expense_id, member_id, share_minor) values (${id}, ${m}, ${s})`);
    }
  });
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  t = await seedTrip(db, {
    owner: { name: "Olivia", role: "owner" },
    a: { name: "Ana" },
    b: { name: "Ben" },
    c: { name: "Cat" },
  });
  const { owner, a, b, c } = t.m;
  await seedIdea(db, t.tripId, { title: "Secret rooftop" });
  ids.dinner = await expense(owner.memberId, 9000, [[owner.memberId, 3000], [a.memberId, 3000], [b.memberId, 3000]], { merchant: "Cervejaria Ramiro" });
  ids.taxi = await expense(a.memberId, 2000, [[a.memberId, 1000], [b.memberId, 1000]], { merchant: "Taxi" });
  // Surprise expense hidden from Ana, even though she has a share (FR-91).
  ids.surprise = await expense(b.memberId, 4000, [[a.memberId, 2000], [b.memberId, 2000]], { hiddenFrom: [a.memberId], merchant: "Cake for Ana" });
  // Not Ana's at all.
  ids.elsewhere = await expense(c.memberId, 500, [[c.memberId, 250], [owner.memberId, 250]], { currency: "USD", merchant: "Owner and Cat" });
  await setStatus(db, a.memberId, "removed");
});

describe("removed member: money-only view (FR-9, M-1, M-2)", () => {
  it("reads nothing from the trip through tables", async () => {
    const a = t.m.a.full;
    for (const table of ["ideas", "expenses", "expense_shares", "payments", "expense_adjustments", "trips", "stops", "votes", "polls", "plan_items", "comments"]) {
      const rows = await query(db, a, sql.raw(`select * from ${table}`));
      expect(rows, table).toHaveLength(0);
    }
    // Only her own member row (status removed); nobody else's.
    const rows = await query<{ id: string }>(db, a, sql`select id from members`);
    expect(rows.map((r) => r.id)).toEqual([t.m.a.memberId]);
  });

  it("gets her own ledger: her expenses, never the hidden one or other people's", async () => {
    const l = await as(db, t.m.a.full, (tx) => formerMemberLedger(tx, t.tripId));
    expect(l).not.toBeNull();
    expect(l!.tripName).toBe("Lisbon 2026");
    expect(l!.memberId).toBe(t.m.a.memberId);
    expect(l!.expenses.map((e) => e.id).sort()).toEqual([ids.dinner, ids.taxi].sort());
    expect(JSON.stringify(l)).not.toContain("Cake for Ana");
    expect(JSON.stringify(l)).not.toContain("Owner and Cat");
    expect(JSON.stringify(l)).not.toContain("Secret rooftop");
    const taxi = l!.expenses.find((e) => e.id === ids.taxi)!;
    expect(taxi).toMatchObject({ myPaidMinor: 2000, myShareMinor: 1000, paidByMe: true, payerName: "Ana" });
    const dinner = l!.expenses.find((e) => e.id === ids.dinner)!;
    expect(dinner).toMatchObject({ myPaidMinor: 0, myShareMinor: 3000, payerName: "Olivia" });
    // People: names on her own expenses only (not Cat).
    expect(l!.people.map((p) => p.name).sort()).toEqual(["Ben", "Olivia"]);
    expect(money.ownBalances({ expenses: l!.expenses })).toEqual({ EUR: -2000 });
  });

  it("is refused for other scopes and other people", async () => {
    const ledger = (claims: Parameters<typeof as>[1]) => as(db, claims, (tx) => formerMemberLedger(tx, t.tripId));
    expect(await ledger(t.m.a.link)).toBeNull(); // personal link: money needs a code (FR-5)
    await expectDenied(ledger({}), /permission denied/); // anon has no grant at all
    expect(await ledger(t.m.b.full)).toBeNull(); // active members use the normal money page
    expect(await ledger({ sub: randomUUID() })).toBeNull();
    expect(await as(db, t.m.b.full, (tx) => myFormerTrips(tx))).toEqual([]);
    const mine = await as(db, t.m.a.full, (tx) => myFormerTrips(tx));
    expect(mine).toMatchObject([{ tripId: t.tripId, tripName: "Lisbon 2026", memberId: t.m.a.memberId }]);
  });

  it("records a settle-up only with someone on her ledger, in a ledger currency", async () => {
    const pay = (args: Partial<Parameters<typeof recordFormerPayment>[1]>, claims = t.m.a.full) =>
      as(db, claims, (tx) =>
        recordFormerPayment(tx, { tripId: t.tripId, otherMemberId: t.m.owner.memberId, iPaid: true, currency: "EUR", amountMinor: 2000, ...args }),
      );
    await expectDenied(pay({ otherMemberId: t.m.c.memberId }), /pick someone/);
    await expectDenied(pay({ amountMinor: 0 }), /positive/);
    await expectDenied(pay({ currency: "USD" }), /currency/);
    await expectDenied(pay({}, t.m.b.full), /not a former member/);
    await expectDenied(pay({}, t.m.a.link), /not a former member/);
    const id = await pay({ note: "  Venmo  " });
    const [row] = await svc(db, (tx) => q<{ from_member_id: string; to_member_id: string; recorded_by_member_id: string; note: string }>(tx, sql`select * from payments where id = ${id}`));
    expect(row).toMatchObject({ from_member_id: t.m.a.memberId, to_member_id: t.m.owner.memberId, recorded_by_member_id: t.m.a.memberId, note: "Venmo" });
    const l = await as(db, t.m.a.full, (tx) => formerMemberLedger(tx, t.tripId));
    expect(l!.payments).toMatchObject([{ fromMe: true, otherName: "Olivia", amountMinor: 2000 }]);
    expect(money.ownBalances({ expenses: l!.expenses, payments: l!.payments })).toEqual({ EUR: 0 });
    // Still can't read the payments table directly.
    expect(await query(db, t.m.a.full, sql`select * from payments`)).toHaveLength(0);
    // The active members see it on the normal ledger.
    expect(await query(db, t.m.owner.full, sql`select * from payments where id = ${id}`)).toHaveLength(1);
  });

  it("disappears when the trip is deleted (JR3)", async () => {
    const t2 = await seedTrip(db, { o: { name: "O", role: "owner" }, x: { name: "X" } });
    await svc(db, (tx) => tx.execute(sql`update members set status = 'removed' where id = ${t2.m.x.memberId}`));
    expect(await as(db, t2.m.x.full, (tx) => formerMemberLedger(tx, t2.tripId))).not.toBeNull();
    await svc(db, (tx) => tx.execute(sql`update trips set deleted_at = now() where id = ${t2.tripId}`));
    expect(await as(db, t2.m.x.full, (tx) => formerMemberLedger(tx, t2.tripId))).toBeNull();
  });
});

describe("recheck pending / deleted account (FR-16, J-4, NFR-7)", () => {
  it("keeps view + vote but hides money and organizer powers until resolved", async () => {
    const t3 = await seedTrip(db, { o: { name: "Owner", role: "owner" }, s: { name: "Sam" } });
    await seedIdea(db, t3.tripId);
    await svc(db, (tx) =>
      tx.execute(sql`insert into expenses (trip_id, merchant, currency, total_minor, paid_by_member_id, uploaded_by_member_id)
        values (${t3.tripId}, 'Lunch', 'USD', 100, ${t3.m.o.memberId}, ${t3.m.o.memberId})`),
    );
    const flag = (col: "recheck_pending_at" | "deleted_at", userId: string, on: boolean) =>
      svc(db, (tx) => tx.execute(sql`update users set ${sql.raw(col)} = ${on ? sql`now()` : sql`null`} where id = ${userId}`));
    expect(await query(db, t3.m.o.full, sql`select * from expenses`)).toHaveLength(1);

    await flag("recheck_pending_at", t3.m.o.userId!, true);
    expect(await query(db, t3.m.o.full, sql`select * from ideas`)).toHaveLength(1); // still views
    expect(await query(db, t3.m.o.full, sql`select * from expenses`)).toHaveLength(0);
    const [org] = await query<{ v: boolean }>(db, t3.m.o.full, sql`select app.is_organizer(${t3.tripId}::uuid) as v`);
    expect(org!.v).toBe(false);
    await expectDenied(
      as(db, t3.m.o.full, (tx) =>
        tx.execute(sql`insert into payments (trip_id, from_member_id, to_member_id, currency, amount_minor, recorded_by_member_id)
          values (${t3.tripId}, ${t3.m.o.memberId}, ${t3.m.s.memberId}, 'USD', 50, ${t3.m.o.memberId})`),
      ),
    );
    await flag("recheck_pending_at", t3.m.o.userId!, false);
    expect(await query(db, t3.m.o.full, sql`select * from expenses`)).toHaveLength(1);

    await flag("deleted_at", t3.m.s.userId!, true);
    expect(await query(db, t3.m.s.full, sql`select * from expenses`)).toHaveLength(0);
  });

  it("a removed member with a pending recheck gets no ledger", async () => {
    await svc(db, (tx) => tx.execute(sql`update users set recheck_pending_at = now() where id = ${t.m.a.userId}`));
    expect(await as(db, t.m.a.full, (tx) => formerMemberLedger(tx, t.tripId))).toBeNull();
    expect(await as(db, t.m.a.full, (tx) => myFormerTrips(tx))).toEqual([]);
    await svc(db, (tx) => tx.execute(sql`update users set recheck_pending_at = null where id = ${t.m.a.userId}`));
  });
});
