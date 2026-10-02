/**
 * Founder money decisions of 2026-10-02 against real Postgres + RLS (PGlite):
 * Q16 unclaimed → uploader, Q18 rounding flag, Q19 guest-of-honor items, Q21 reports follow
 * corrections, Q22 late joiners claim, Q23 several payers / covered by / personal-only,
 * Q24 line-item duplicates, MT1 "What changed", JR10 removal totals include hidden expenses.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { asService, expenses, members, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { createTrip } from "../trips";
import {
  correctLockedExpense,
  createExpense,
  getExpenseDetail,
  getMoneyOverview,
  lateJoinerClaimables,
  recordPayment,
  recordRefund,
  resolveDuplicatePair,
  setClaim,
  setGuestOfHonorInSplits,
  updateExpense,
} from "../expenses";
import { balanceFor } from "../membership";

type Person = { userId: string; memberId: string; claims: { sub: string } };

async function setup(names: string[]) {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const ids = names.map(() => randomUUID());
  await asService(d, (tx) =>
    tx.insert(users).values(names.map((n, i) => ({ id: ids[i]!, displayName: n, phone: `+1202555${String(2000 + i)}` }))),
  );
  const t = await createTrip(d, { userId: ids[0]!, ownerName: names[0]!, name: "Lisbon", city: "Lisbon" });
  const p: Record<string, Person> = { [names[0]!]: { userId: ids[0]!, memberId: t.memberId, claims: { sub: ids[0]! } } };
  for (let i = 1; i < names.length; i++) {
    const [m] = await asService(d, (tx) =>
      tx
        .insert(members)
        .values({ tripId: t.tripId, userId: ids[i]!, displayName: names[i]!, status: "active", joinedAt: new Date() })
        .returning({ id: members.id }),
    );
    p[names[i]!] = { userId: ids[i]!, memberId: m!.id, claims: { sub: ids[i]! } };
  }
  return { d, tripId: t.tripId, p: p as Record<string, Person> };
}

async function ok(r: ReturnType<typeof createExpense>) {
  const v = await r;
  if (!v.ok) throw new Error("expected ok");
  return v.expenseId;
}

const base = (tripId: string) => ({ tripId, merchant: "Taberna", currency: "USD", totalMinor: 9000, category: "food_drink" as const });

describe("Q23a several payers", () => {
  it("each payer is credited with their part; parts must add up; refunds go back in proportion", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben, Cat } = s.p;
    await expect(
      createExpense(s.d, Olivia!.claims, { ...base(s.tripId), payers: [{ memberId: Olivia!.memberId, paidMinor: 5000 }] }),
    ).rejects.toThrow(/add up/);
    const id = await ok(
      createExpense(s.d, Olivia!.claims, {
        ...base(s.tripId),
        payers: [
          { memberId: Olivia!.memberId, paidMinor: 6000 },
          { memberId: Ben!.memberId, paidMinor: 3000 },
        ],
      }),
    );
    const o = await getMoneyOverview(s.d, Cat!.claims, s.tripId);
    expect(o.balances.USD).toEqual({ [Olivia!.memberId]: 3000, [Ben!.memberId]: 0, [Cat!.memberId]: -3000 });
    expect(o.expenses[0]!.payerCount).toBe(2);
    const d = (await getExpenseDetail(s.d, Cat!.claims, s.tripId, id))!;
    expect(d.payers.map((p) => p.paidMinor).sort()).toEqual([3000, 6000]);
    await recordRefund(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, amountMinor: 900 });
    const after = await getMoneyOverview(s.d, Cat!.claims, s.tripId);
    // Refund 900: payers get back 600/300, shares drop 300 each.
    expect(after.balances.USD).toEqual({ [Olivia!.memberId]: 2700, [Ben!.memberId]: 0, [Cat!.memberId]: -2700 });
    // A payment between Ben and Cat locks it (Ben paid part of it).
    await recordPayment(s.d, Cat!.claims, { tripId: s.tripId, fromMemberId: Cat!.memberId, toMemberId: Ben!.memberId, currency: "USD", amountMinor: 1 });
    expect((await getExpenseDetail(s.d, Cat!.claims, s.tripId, id))!.locked).toBe(true);
  });
});

describe("Q23b covered by", () => {
  it("the coverer takes the share in balances and spend", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben, Cat } = s.p;
    const id = await ok(createExpense(s.d, Olivia!.claims, { ...base(s.tripId), coveredBy: [{ memberId: Cat!.memberId, coveredBy: Ben!.memberId }] }));
    const o = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(o.balances.USD).toEqual({ [Olivia!.memberId]: 6000, [Ben!.memberId]: -6000 });
    expect(o.spend.USD![Ben!.memberId]).toBe(6000);
    const d = (await getExpenseDetail(s.d, Cat!.claims, s.tripId, id))!;
    expect(d.coveredBy).toEqual([{ memberId: Cat!.memberId, name: "You", coveredById: Ben!.memberId, coveredByName: "Ben" }]);
    await updateExpense(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, coveredBy: [] });
    expect((await getMoneyOverview(s.d, Olivia!.claims, s.tripId)).balances.USD![Cat!.memberId]).toBe(-3000);
    await expect(
      updateExpense(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, coveredBy: [{ memberId: Ben!.memberId, coveredBy: Ben!.memberId }] }),
    ).rejects.toThrow();
  });
});

describe("Q23c personal-only", () => {
  it("visible only to its member (not even organizers), never in group balances or reports", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben } = s.p;
    await ok(createExpense(s.d, Olivia!.claims, base(s.tripId)));
    const mine = await ok(createExpense(s.d, Ben!.claims, { ...base(s.tripId), merchant: "Souvenir", totalMinor: 2500, category: "shopping", personal: true }));
    const forBen = await getMoneyOverview(s.d, Ben!.claims, s.tripId);
    expect(forBen.expenses.find((e) => e.id === mine)!.personal).toBe(true);
    expect(forBen.personalSpend).toEqual({ USD: 2500 });
    expect(forBen.categories.USD).toEqual({ food_drink: 9000 });
    // Organizer Olivia can't see it at all (RLS), and balances are the same for both.
    const forOlivia = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(forOlivia.expenses.some((e) => e.id === mine)).toBe(false);
    expect(await getExpenseDetail(s.d, Olivia!.claims, s.tripId, mine)).toBeNull();
    expect(forOlivia.balances).toEqual(forBen.balances);
    // Payments never lock it; it stays editable for Ben.
    await recordPayment(s.d, Ben!.claims, { tripId: s.tripId, fromMemberId: Ben!.memberId, toMemberId: Olivia!.memberId, currency: "USD", amountMinor: 3000 });
    expect((await getExpenseDetail(s.d, Ben!.claims, s.tripId, mine))!.locked).toBe(false);
    await updateExpense(s.d, Ben!.claims, { tripId: s.tripId, expenseId: mine, totalMinor: 2600 });
    // The DB refuses a personal expense recorded for someone else.
    await expect(
      asService(s.d, (tx) => tx.update(expenses).set({ paidByMemberId: Olivia!.memberId }).where(eq(expenses.id, mine))),
    ).rejects.toThrow();
  });
});

describe("Q18 / Q16 / Q19 / Q22", () => {
  it("leftover pennies go to the uploader and the expense is flagged", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben, Cat } = s.p;
    const id = await ok(createExpense(s.d, Cat!.claims, { ...base(s.tripId), totalMinor: 1001, paidByMemberId: Olivia!.memberId }));
    const d = (await getExpenseDetail(s.d, Ben!.claims, s.tripId, id))!;
    expect(d.shares.find((x) => x.memberId === Cat!.memberId)!.shareMinor).toBe(335);
    expect(d.rounding).toEqual({ leftoverMinor: 2, name: "Cat" });
    const even = await ok(createExpense(s.d, Cat!.claims, { ...base(s.tripId), merchant: "Even", totalMinor: 900 }));
    expect((await getExpenseDetail(s.d, Ben!.claims, s.tripId, even))!.rounding).toBeNull();
  });

  it("guest-of-honor items: default only the sharers; the uploader can switch to even", async () => {
    const s = await setup(["Olivia", "Ben", "Cat", "Dee"]);
    const { Olivia, Ben, Cat, Dee } = s.p;
    await setGuestOfHonorInSplits(s.d, Olivia!.claims, { tripId: s.tripId, memberId: Dee!.memberId, on: true });
    const id = await ok(
      createExpense(s.d, Olivia!.claims, {
        ...base(s.tripId),
        method: "itemized",
        totalMinor: 6000,
        items: [
          { label: "Wine", amountMinor: 3000 },
          { label: "Pasta", amountMinor: 1500 },
          { label: "Salad", amountMinor: 1500 },
        ],
      }),
    );
    let d = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!;
    const item = (l: string) => d.items.find((i) => i.label === l)!.id;
    const claim = (who: Person, l: string) =>
      setClaim(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, itemId: item(l), memberId: who.memberId, weight: 1 });
    await claim(Dee!, "Wine");
    await claim(Ben!, "Wine");
    await claim(Ben!, "Pasta");
    await claim(Cat!, "Salad");
    d = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!;
    expect(d.guestOfHonorItems).toEqual({ names: ["Dee"], policy: "sharers", fallbackItems: 0 });
    const sh = (m: Person) => d.shares.find((x) => x.memberId === m.memberId)?.shareMinor ?? 0;
    expect([sh(Ben!), sh(Cat!), sh(Dee!)]).toEqual([4500, 1500, 0]);
    await updateExpense(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, gohPolicy: "even" });
    d = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!;
    // Dee's half of the wine (1500) is split evenly over Olivia, Ben and Cat.
    expect([sh(Olivia!), sh(Ben!), sh(Cat!)]).toEqual([500, 3500, 2000]);
  });

  it("organizers see unclaimed items on the uploader and late joiners' claimable receipts", async () => {
    const s = await setup(["Olivia", "Ben"]);
    const { Olivia, Ben } = s.p;
    const id = await ok(
      createExpense(s.d, Ben!.claims, { ...base(s.tripId), method: "itemized", totalMinor: 2000, items: [{ label: "A", amountMinor: 2000 }] }),
    );
    const o = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(o.organizer.unclaimed).toEqual([{ expenseId: id, merchant: "Taberna", uploaderName: "Ben", count: 1 }]);
    expect((await getMoneyOverview(s.d, Ben!.claims, s.tripId)).organizer.unclaimed).toEqual([]);
    // A late joiner: listed for organizers; they (or an organizer) claim items.
    const late = randomUUID();
    await asService(s.d, (tx) => tx.insert(users).values({ id: late, displayName: "Zoe", phone: "+12025559999" }));
    const [z] = await asService(s.d, (tx) =>
      tx
        .insert(members)
        .values({ tripId: s.tripId, userId: late, displayName: "Zoe", status: "active", joinedAt: new Date(Date.now() + 1000) })
        .returning({ id: members.id }),
    );
    const c = await lateJoinerClaimables(s.d, Olivia!.claims, s.tripId);
    expect(c.find((x) => x.memberId === z!.id)!.receipts.map((r) => r.expenseId)).toEqual([id]);
    const itemId = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!.items[0]!.id;
    await setClaim(s.d, { sub: late }, { tripId: s.tripId, expenseId: id, itemId, memberId: z!.id, weight: 1 });
    expect((await lateJoinerClaimables(s.d, Olivia!.claims, s.tripId)).some((x) => x.memberId === z!.id)).toBe(false);
  });
});

describe("Q21 / Q24 / MT1 / JR10", () => {
  it("a correction to a settled expense updates category totals and spend per person", async () => {
    const s = await setup(["Olivia", "Ben"]);
    const { Olivia, Ben } = s.p;
    const id = await ok(createExpense(s.d, Olivia!.claims, { ...base(s.tripId), totalMinor: 1000 }));
    await recordPayment(s.d, Ben!.claims, { tripId: s.tripId, fromMemberId: Ben!.memberId, toMemberId: Olivia!.memberId, currency: "USD", amountMinor: 500 });
    await correctLockedExpense(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, totalMinor: 1400, paidByMemberId: Olivia!.memberId, reason: "Tip" });
    const o = await getMoneyOverview(s.d, Ben!.claims, s.tripId);
    expect(o.categories.USD).toEqual({ food_drink: 1400 });
    expect(o.spend.USD).toEqual({ [Olivia!.memberId]: 700, [Ben!.memberId]: 700 });
    expect((await getExpenseDetail(s.d, Ben!.claims, s.tripId, id))!.correctedTotalMinor).toBe(1400);
    // MT1: Ben sees what changed, newest first, with the effect on his balance.
    expect(o.activity.map((a) => [a.kind, a.effectMinor])).toEqual([
      ["correction", -200],
      ["payment", 500],
      ["expense", -500],
    ]);
  });

  it("receipts with near-identical line items are flagged for organizers until resolved", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben } = s.p;
    const items = [
      { label: "Margherita", amountMinor: 1200 },
      { label: "Coke", amountMinor: 300 },
      { label: "Tiramisu", amountMinor: 800 },
    ];
    const a = await ok(createExpense(s.d, Olivia!.claims, { ...base(s.tripId), merchant: "Pizzeria Roma", method: "itemized", totalMinor: 2300, items, spentOn: "2026-10-01" }));
    // Different merchant reading and total (tip added): the merchant/total check misses it.
    const b = await ok(
      createExpense(s.d, Ben!.claims, {
        ...base(s.tripId),
        merchant: "PIZZ. ROMA SRL",
        method: "itemized",
        totalMinor: 2600,
        items,
        charges: [{ kind: "tip", amountMinor: 300 }],
        spentOn: "2026-10-01",
      }),
    );
    let o = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(o.organizer.duplicates).toHaveLength(1);
    expect([o.organizer.duplicates[0]!.a.id, o.organizer.duplicates[0]!.b.id].sort()).toEqual([a, b].sort());
    expect((await getMoneyOverview(s.d, Ben!.claims, s.tripId)).organizer.duplicates).toEqual([]);
    await expect(resolveDuplicatePair(s.d, Ben!.claims, { tripId: s.tripId, expenseId: a, otherExpenseId: b, resolution: "keep_both" })).rejects.toThrow();
    await resolveDuplicatePair(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: b, otherExpenseId: a, resolution: "keep_both" });
    o = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(o.organizer.duplicates).toEqual([]);
  });

  it("organizers see the full balance during removal, including expenses hidden from them", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben, Cat } = s.p;
    const id = await ok(createExpense(s.d, Cat!.claims, { ...base(s.tripId), participantIds: [Ben!.memberId, Cat!.memberId], totalMinor: 4000 }));
    await asService(s.d, (tx) => tx.update(expenses).set({ hiddenFrom: [Olivia!.memberId] }).where(eq(expenses.id, id)));
    expect((await getMoneyOverview(s.d, Olivia!.claims, s.tripId)).expenses).toEqual([]);
    expect(await balanceFor(s.d, Olivia!.userId, s.tripId, Ben!.memberId)).toEqual([{ currency: "USD", balanceMinor: -2000 }]);
  });
});
