/**
 * Expenses slice against real Postgres + RLS (PGlite): §6.5 FR-60–FR-75, FR-90, FR-12/13,
 * FR-T8/T9/T10, FR-126, NFR-4/5.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { asService, expenses, members, stopAttendance, stops, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import type { StructuredModel } from "@wandr/ai";
import { localStorageAdapter } from "@/lib/storage/receipts";
import { parseFrankfurterRates } from "@/lib/fx";
import { createTrip } from "../trips";
import {
  applyDropOutDecisions,
  applyLateJoiner,
  correctLockedExpense,
  createExpense,
  deleteExpense,
  dropOutChecklist,
  exportExpensesCsv,
  getBudget,
  getExpenseDetail,
  getMoneyOverview,
  hasExpenses,
  lateJoinerChecklist,
  membershipReviews,
  recordPayment,
  recordRefund,
  restoreExpense,
  saveBudgetAnswer,
  setAbsorbed,
  setBudgetCheckIn,
  setClaim,
  setGuestOfHonorInSplits,
  updateExpense,
} from "../expenses";
import { createReceiptUpload, getReceiptUpload, openReceiptImage, readReceiptJob } from "../receipts";

type Person = { userId: string; memberId: string; claims: { sub: string } };

async function setup(names: string[]) {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const ids = names.map(() => randomUUID());
  await asService(d, (tx) =>
    tx.insert(users).values(names.map((n, i) => ({ id: ids[i]!, displayName: n, phone: `+1202555${String(1000 + i)}` }))),
  );
  const t = await createTrip(d, { userId: ids[0]!, ownerName: names[0]!, name: "Lisbon", city: "Lisbon" });
  const people: Record<string, Person> = {
    [names[0]!]: { userId: ids[0]!, memberId: t.memberId, claims: { sub: ids[0]! } },
  };
  for (let i = 1; i < names.length; i++) {
    const [m] = await asService(d, (tx) =>
      tx
        .insert(members)
        .values({ tripId: t.tripId, userId: ids[i]!, displayName: names[i]!, status: "active", joinedAt: new Date() })
        .returning({ id: members.id }),
    );
    people[names[i]!] = { userId: ids[i]!, memberId: m!.id, claims: { sub: ids[i]! } };
  }
  return { d, tripId: t.tripId, stopId: t.stopId, p: people };
}

const add = (d: Db, who: Person, tripId: string, extra: Partial<Parameters<typeof createExpense>[2]> = {}) =>
  createExpense(d, who.claims, {
    tripId,
    merchant: "Taberna",
    currency: "USD",
    totalMinor: 10000,
    category: "food_drink",
    ...extra,
  });

async function okId(r: ReturnType<typeof createExpense>) {
  const v = await r;
  if (!v.ok) throw new Error("expected ok");
  return v.expenseId;
}

describe("duo (founder's first test, FR-T8)", () => {
  it("even split defaults to both, 'You owe Sam' per currency, payment locks, corrections are adjustments", async () => {
    const s = await setup(["Nick", "Sam"]);
    const { Nick, Sam } = s.p as Record<string, Person>;
    expect(await hasExpenses(s.d, Nick!.claims, s.tripId)).toBe(false);
    const id = await okId(add(s.d, Nick!, s.tripId, { totalMinor: 9001 }));
    await okId(add(s.d, Sam!, s.tripId, { merchant: "Cafe", currency: "EUR", totalMinor: 2000 }));
    expect(await hasExpenses(s.d, Nick!.claims, s.tripId)).toBe(true);

    let o = await getMoneyOverview(s.d, Sam!.claims, s.tripId);
    expect(o.size).toBe("duo");
    // 90.01 split two ways: shares sum exactly (NFR-4).
    const det = await getExpenseDetail(s.d, Nick!.claims, s.tripId, id);
    expect(det!.shares.reduce((a, b) => a + b.shareMinor, 0)).toBe(9001);
    expect(o.mine.map((l) => [l.currency, l.direction, l.otherName])).toEqual([
      ["EUR", "owes_you", "Nick"],
      ["USD", "you_owe", "Nick"],
    ]);
    const owe = o.mine.find((l) => l.currency === "USD")!;

    await recordPayment(s.d, Sam!.claims, {
      tripId: s.tripId,
      fromMemberId: Sam!.memberId,
      toMemberId: Nick!.memberId,
      currency: "USD",
      amountMinor: owe.amountMinor,
    });
    o = await getMoneyOverview(s.d, Sam!.claims, s.tripId);
    expect(o.mine.filter((l) => l.currency === "USD")).toEqual([]);
    expect(o.expenses.find((e) => e.id === id)!.locked).toBe(true);

    // FR-69: locked → no edit or delete; corrections become adjustments.
    await expect(updateExpense(s.d, Nick!.claims, { tripId: s.tripId, expenseId: id, totalMinor: 12001 })).rejects.toThrow(/settled/);
    await expect(deleteExpense(s.d, Nick!.claims, s.tripId, id)).rejects.toThrow(/settled/);
    await correctLockedExpense(s.d, Nick!.claims, {
      tripId: s.tripId,
      expenseId: id,
      totalMinor: 11001,
      paidByMemberId: Nick!.memberId,
      reason: "Forgot the dessert",
    });
    o = await getMoneyOverview(s.d, Sam!.claims, s.tripId);
    const usd = o.mine.find((l) => l.currency === "USD")!;
    expect(usd).toMatchObject({ direction: "you_owe", amountMinor: 1000 });
    // A second correction is relative to the corrected state.
    await correctLockedExpense(s.d, Nick!.claims, {
      tripId: s.tripId,
      expenseId: id,
      totalMinor: 9001,
      paidByMemberId: Nick!.memberId,
      reason: "Actually no dessert",
    });
    o = await getMoneyOverview(s.d, Sam!.claims, s.tripId);
    expect(o.mine.filter((l) => l.currency === "USD")).toEqual([]);
    for (const row of Object.values(o.balances)) expect(Object.values(row).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("only payer, payee or organizers record a payment; Sam can't record one between Nick and a third party", async () => {
    const s = await setup(["Nick", "Sam", "Ana"]);
    const { Nick, Sam, Ana } = s.p as Record<string, Person>;
    await expect(
      recordPayment(s.d, Sam!.claims, { tripId: s.tripId, fromMemberId: Ana!.memberId, toMemberId: Nick!.memberId, currency: "USD", amountMinor: 100 }),
    ).rejects.toThrow(/payments you made/);
  });
});

describe("solo (FR-T10)", () => {
  it("records 'paid by me, for me' and moves no balance", async () => {
    const s = await setup(["Nick"]);
    const { Nick } = s.p as Record<string, Person>;
    const id = await okId(add(s.d, Nick!, s.tripId, { method: "even", participantIds: [] }));
    const o = await getMoneyOverview(s.d, Nick!.claims, s.tripId);
    expect(o.expenses[0]!.method).toBe("just_me");
    expect(o.mine).toEqual([]);
    expect(o.spend.USD![Nick!.memberId]).toBe(10000);
    expect(o.categories.USD!.food_drink).toBe(10000);

    // FR-T10 + FR-12: a second person joins; the owner turns it into a shared expense.
    const samId = randomUUID();
    await asService(s.d, (tx) => tx.insert(users).values({ id: samId, displayName: "Sam" }));
    const [sam] = await asService(s.d, (tx) =>
      tx
        .insert(members)
        .values({ tripId: s.tripId, userId: samId, displayName: "Sam", status: "active", joinedAt: new Date(Date.now() + 1000) })
        .returning({ id: members.id }),
    );
    const list = await lateJoinerChecklist(s.d, Nick!.claims, s.tripId, sam!.id);
    expect(list.map((x) => x.expenseId)).toEqual([id]);
    await applyLateJoiner(s.d, Nick!.claims, { tripId: s.tripId, memberId: sam!.id, include: [id], skip: [] });
    const det = await getExpenseDetail(s.d, Nick!.claims, s.tripId, id);
    expect(det!.method).toBe("even");
    expect(det!.shares.map((x) => x.shareMinor)).toEqual([5000, 5000]);
    expect(await lateJoinerChecklist(s.d, Nick!.claims, s.tripId, sam!.id)).toEqual([]);
  });
});

describe("group", () => {
  it("money is full scope only (FR-5): link sessions and strangers see nothing", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben } = s.p as Record<string, Person>;
    await okId(add(s.d, Olivia!, s.tripId));
    await expect(getMoneyOverview(s.d, { link_member: Ben!.memberId }, s.tripId)).rejects.toThrow(/Confirm/);
    await expect(getMoneyOverview(s.d, { sub: randomUUID() }, s.tripId)).rejects.toThrow(/not_found/);
    expect(await hasExpenses(s.d, { link_member: Ben!.memberId }, s.tripId)).toBe(false);
  });

  it("even split defaults to people attending the Stop (FR-62, FR-S7)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Cat } = s.p as Record<string, Person>;
    const porto = randomUUID();
    await asService(s.d, async (tx) => {
      await tx.insert(stops).values({ id: porto, tripId: s.tripId, name: "Porto", position: 1 });
      await tx.insert(stopAttendance).values({ stopId: porto, memberId: Cat!.memberId, attending: false });
    });
    const id = await okId(add(s.d, Olivia!, s.tripId, { stopId: porto, totalMinor: 1000 }));
    const det = await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id);
    expect(det!.shares.map((x) => x.memberId).sort()).not.toContain(Cat!.memberId);
    expect(det!.shares.reduce((a, b) => a + b.shareMinor, 0)).toBe(1000);
  });

  it("itemized: pending claims count at the even default; claims, absorb and tax/tip are proportional (FR-62, E-1, E-4)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben, Cat } = s.p as Record<string, Person>;
    const id = await okId(
      add(s.d, Olivia!, s.tripId, {
        method: "itemized",
        totalMinor: 6600,
        items: [
          { label: "Steak", amountMinor: 3000 },
          { label: "Salad", amountMinor: 1000 },
          { label: "Wine", amountMinor: 2000 },
        ],
        charges: [
          { kind: "tax", amountMinor: 300 },
          { kind: "tip", amountMinor: 300 },
        ],
      }),
    );
    let det = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!;
    expect(det.validation!.balanced).toBe(true);
    expect(det.shares.map((x) => x.shareMinor)).toEqual([2200, 2200, 2200]);
    let o = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(o.expenses[0]!).toMatchObject({ pendingClaims: 3, needsMyAttention: true });

    const [steak, salad, wine] = ["Steak", "Salad", "Wine"].map((l) => det.items.find((i) => i.label === l)!);
    await setClaim(s.d, Ben!.claims, { tripId: s.tripId, expenseId: id, itemId: steak!.id, memberId: Ben!.memberId, weight: 1 });
    // Ben can't claim for Cat; Olivia (uploader) can assign.
    await expect(
      setClaim(s.d, Ben!.claims, { tripId: s.tripId, expenseId: id, itemId: salad!.id, memberId: Cat!.memberId, weight: 1 }),
    ).rejects.toThrow(/own items/);
    await setClaim(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, itemId: salad!.id, memberId: Cat!.memberId, weight: 1 });
    await setAbsorbed(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, itemId: wine!.id, absorbed: true });
    det = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!;
    const share = (m: Person) => det.shares.find((x) => x.memberId === m.memberId)!.shareMinor;
    // Steak 3000 + 10% charges = 3300; salad 1100; wine 2200 absorbed by the payer.
    expect([share(Ben!), share(Cat!), share(Olivia!)]).toEqual([3300, 1100, 2200]);
    o = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(o.expenses[0]!.pendingClaims).toBe(0);
  });

  it("itemized receipts that don't add up need a decision (E-6)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia } = s.p as Record<string, Person>;
    await expect(
      add(s.d, Olivia!, s.tripId, { method: "itemized", totalMinor: 5000, items: [{ label: "A", amountMinor: 4000 }] }),
    ).rejects.toThrow(/don't add up/);
    const id = await okId(
      add(s.d, Olivia!, s.tripId, {
        method: "itemized",
        totalMinor: 5000,
        items: [{ label: "A", amountMinor: 4000 }],
        difference: { assignTo: Olivia!.memberId },
      }),
    );
    const det = await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id);
    expect(det!.shares.reduce((a, b) => a + b.shareMinor, 0)).toBe(5000);
  });

  it("duplicate receipts are flagged, never auto-deleted (FR-64, E-11)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben } = s.p as Record<string, Person>;
    await okId(add(s.d, Olivia!, s.tripId, { merchant: "Taberna LLC", spentOn: "2026-10-01" }));
    const r = await add(s.d, Ben!, s.tripId, { merchant: "taberna", spentOn: "2026-10-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.duplicates[0]).toMatchObject({ uploadedBy: "Olivia", reason: "merchant_total_time" });
    const again = await add(s.d, Ben!, s.tripId, { merchant: "taberna", spentOn: "2026-10-01", confirmDuplicate: true });
    expect(again.ok).toBe(true);
  });

  it("guest of honor: one tap excludes them from unlocked splits (FR-90)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat", "Dee"]);
    const { Olivia, Ben, Dee } = s.p as Record<string, Person>;
    const id = await okId(add(s.d, Olivia!, s.tripId, { totalMinor: 1200 }));
    await expect(setGuestOfHonorInSplits(s.d, Ben!.claims, { tripId: s.tripId, memberId: Dee!.memberId, on: true })).rejects.toThrow(/organizers/);
    const r = await setGuestOfHonorInSplits(s.d, Olivia!.claims, { tripId: s.tripId, memberId: Dee!.memberId, on: true });
    expect(r).toEqual({ resplit: 1, settledUnchanged: 0 });
    let det = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!;
    expect(det.shares.map((x) => x.shareMinor)).toEqual([400, 400, 400]);
    expect(det.shares.some((x) => x.memberId === Dee!.memberId)).toBe(false);
    // New expenses exclude them too; turning it off restores them.
    await setGuestOfHonorInSplits(s.d, Olivia!.claims, { tripId: s.tripId, memberId: Dee!.memberId, on: false });
    det = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!;
    expect(det.shares).toHaveLength(4);
  });

  it("refunds reuse the original split and can't exceed it (FR-72, E-12)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben } = s.p as Record<string, Person>;
    const id = await okId(add(s.d, Olivia!, s.tripId, { totalMinor: 9000 }));
    await recordRefund(s.d, Ben!.claims, { tripId: s.tripId, expenseId: id, amountMinor: 3000 });
    await expect(recordRefund(s.d, Ben!.claims, { tripId: s.tripId, expenseId: id, amountMinor: 6001 })).rejects.toThrow(/more than/);
    const o = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(o.balances.USD![Olivia!.memberId]).toBe(4000);
    const det = await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id);
    expect(det!.refundableMinor).toBe(6000);
  });

  it("edit rights (FR-68), soft delete with undo (NFR-5, P7)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben, Cat } = s.p as Record<string, Person>;
    const id = await okId(add(s.d, Ben!, s.tripId));
    await expect(updateExpense(s.d, Cat!.claims, { tripId: s.tripId, expenseId: id, merchant: "x" })).rejects.toThrow(/Only/);
    await updateExpense(s.d, Olivia!.claims, { tripId: s.tripId, expenseId: id, totalMinor: 3000, participantIds: [Olivia!.memberId, Ben!.memberId] });
    let det = (await getExpenseDetail(s.d, Ben!.claims, s.tripId, id))!;
    expect(det.shares.map((x) => x.shareMinor)).toEqual([1500, 1500]);
    await deleteExpense(s.d, Ben!.claims, s.tripId, id);
    expect((await getMoneyOverview(s.d, Ben!.claims, s.tripId)).expenses).toHaveLength(0);
    await expect(restoreExpense(s.d, Cat!.claims, s.tripId, id)).rejects.toThrow();
    await restoreExpense(s.d, Ben!.claims, s.tripId, id);
    det = (await getExpenseDetail(s.d, Ben!.claims, s.tripId, id))!;
    expect(det.deleted).toBe(false);
  });

  it("drop-outs: organizer decides per expense (FR-13); late joiner replaces a flagged share", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Cat } = s.p as Record<string, Person>;
    const a = await okId(add(s.d, Olivia!, s.tripId, { merchant: "Villa", totalMinor: 9000 }));
    const b = await okId(add(s.d, Olivia!, s.tripId, { merchant: "Boat", totalMinor: 3000 }));
    await asService(s.d, (tx) => tx.update(members).set({ status: "not_attending" }).where(eq(members.id, Cat!.memberId)));
    expect((await membershipReviews(s.d, Olivia!.claims, s.tripId)).map((r) => [r.name, r.kind])).toEqual([["Cat", "drop_out"]]);
    expect((await dropOutChecklist(s.d, Olivia!.claims, s.tripId, Cat!.memberId)).map((x) => x.expenseId).sort()).toEqual([a, b].sort());
    await applyDropOutDecisions(s.d, Olivia!.claims, {
      tripId: s.tripId,
      memberId: Cat!.memberId,
      decisions: [
        { expenseId: a, decision: "refund_if_replaced" },
        { expenseId: b, decision: "redistribute" },
      ],
    });
    const boat = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, b))!;
    expect(boat.shares.map((x) => x.shareMinor)).toEqual([1500, 1500]);

    const danId = randomUUID();
    await asService(s.d, (tx) => tx.insert(users).values({ id: danId, displayName: "Dan" }));
    const [dan] = await asService(s.d, (tx) =>
      tx
        .insert(members)
        .values({ tripId: s.tripId, userId: danId, displayName: "Dan", status: "active", joinedAt: new Date(Date.now() + 1000) })
        .returning({ id: members.id }),
    );
    const list = await lateJoinerChecklist(s.d, Olivia!.claims, s.tripId, dan!.id);
    const villa = list.find((x) => x.expenseId === a)!;
    expect(villa.replaces).toMatchObject({ name: "Cat", shareMinor: 3000 });
    await applyLateJoiner(s.d, Olivia!.claims, { tripId: s.tripId, memberId: dan!.id, include: [], skip: [b], replace: [a] });
    const v = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, a))!;
    expect(v.shares.find((x) => x.memberId === dan!.id)?.shareMinor).toBe(3000);
    expect(v.shares.some((x) => x.memberId === Cat!.memberId)).toBe(false);
    expect(await lateJoinerChecklist(s.d, Olivia!.claims, s.tripId, dan!.id)).toEqual([]);
  });

  it("late joiner on a locked expense becomes adjustment entries (FR-12 + FR-69)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben } = s.p as Record<string, Person>;
    const id = await okId(add(s.d, Olivia!, s.tripId, { totalMinor: 9000 }));
    await recordPayment(s.d, Ben!.claims, { tripId: s.tripId, fromMemberId: Ben!.memberId, toMemberId: Olivia!.memberId, currency: "USD", amountMinor: 3000 });
    const danId = randomUUID();
    await asService(s.d, (tx) => tx.insert(users).values({ id: danId, displayName: "Dan" }));
    const [dan] = await asService(s.d, (tx) =>
      tx
        .insert(members)
        .values({ tripId: s.tripId, userId: danId, displayName: "Dan", status: "active", joinedAt: new Date(Date.now() + 1000) })
        .returning({ id: members.id }),
    );
    await applyLateJoiner(s.d, Olivia!.claims, { tripId: s.tripId, memberId: dan!.id, include: [id], skip: [] });
    const det = (await getExpenseDetail(s.d, Olivia!.claims, s.tripId, id))!;
    expect(det.locked).toBe(true);
    expect(det.adjustments.length).toBeGreaterThan(0);
    const o = await getMoneyOverview(s.d, Olivia!.claims, s.tripId);
    expect(o.balances.USD![dan!.id]).toBe(-2250);
    expect(Object.values(o.balances.USD!).reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("CSV export escapes formulas and has exact decimals (FR-126)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia } = s.p as Record<string, Person>;
    await okId(add(s.d, Olivia!, s.tripId, { merchant: "=HYPERLINK(\"x\")", totalMinor: 1001 }));
    const { csv, filename } = await exportExpensesCsv(s.d, Olivia!.claims, s.tripId);
    expect(filename).toBe("Lisbon-expenses.csv");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",10.01,");
    expect(csv).toMatch(/3\.34|3\.33/);
  });

  it("budget check-in: organizer toggle, private ranges, band only with 3+ answers (FR-74)", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben, Cat } = s.p as Record<string, Person>;
    await expect(setBudgetCheckIn(s.d, Ben!.claims, s.tripId, true)).rejects.toThrow(/organizers/);
    await setBudgetCheckIn(s.d, Olivia!.claims, s.tripId, true);
    await saveBudgetAnswer(s.d, Olivia!.claims, { tripId: s.tripId, currency: "USD", minMinor: 50000, maxMinor: 100000 });
    await saveBudgetAnswer(s.d, Ben!.claims, { tripId: s.tripId, currency: "USD", minMinor: 30000, maxMinor: 80000 });
    let b = await getBudget(s.d, Ben!.claims, s.tripId);
    expect(b.rows.map((r) => r.kind)).toEqual(["own"]);
    await saveBudgetAnswer(s.d, Cat!.claims, { tripId: s.tripId, currency: "USD", minMinor: 40000, maxMinor: 120000 });
    b = await getBudget(s.d, Ben!.claims, s.tripId);
    expect(b.rows.find((r) => r.kind === "band")).toMatchObject({ answerCount: 3 });
    expect(b.rows.some((r) => r.kind === "member")).toBe(false);
  });
});

describe("receipts (FR-60/61, E-31)", () => {
  const fakeModel = (out: unknown): StructuredModel => ({
    model: "fake",
    async generate() {
      return { output: out as never, stopReason: "end_turn", model: "fake" };
    },
  });
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);

  it("upload → AI read → prefill → expense; photo visible only to people on the expense", async () => {
    const s = await setup(["Olivia", "Ben", "Cat"]);
    const { Olivia, Ben, Cat } = s.p as Record<string, Person>;
    const storage = localStorageAdapter(mkdtempSync(join(tmpdir(), "wandr-rcpt-")));
    await expect(createReceiptUpload(s.d, Olivia!.claims, { tripId: s.tripId, bytes: new Uint8Array([1, 2, 3]) }, storage)).rejects.toThrow(
      /photo/,
    );
    await expect(createReceiptUpload(s.d, { sub: randomUUID() }, { tripId: s.tripId, bytes: JPEG }, storage)).rejects.toThrow();
    const up = await createReceiptUpload(s.d, Olivia!.claims, { tripId: s.tripId, bytes: JPEG }, storage);
    expect(up.duplicateOfExpenseId).toBeNull();
    await readReceiptJob(s.d, up.uploadId, {
      storage,
      model: fakeModel({
        merchant: "Cervejaria Ramiro",
        date: "2026-09-30",
        currency: "EUR",
        currencyAmbiguous: false,
        items: [{ label: "Prawns", labelOriginal: null, quantity: 1, amountMinor: 4000, discountMinor: 0 }],
        subtotalMinor: 4000,
        taxMinor: 0,
        taxIncluded: true,
        tipMinor: 500,
        serviceChargeMinor: 400,
        serviceChargeLabel: "Service charge",
        feesMinor: 0,
        discountMinor: 0,
        totalMinor: 4900,
        handwrittenTip: false,
        category: "food_drink",
      }),
    });
    const view = (await getReceiptUpload(s.d, Olivia!.claims, s.tripId, up.uploadId))!;
    expect(view.status).toBe("read");
    expect(view.reading!.receipt.merchant).toBe("Cervejaria Ramiro");
    expect(view.reading!.validation.issues.map((i) => i.code)).toContain("auto_gratuity_and_tip");
    // Someone else can't read Olivia's pending upload.
    expect(await getReceiptUpload(s.d, Ben!.claims, s.tripId, up.uploadId)).toBeNull();

    const id = await okId(
      add(s.d, Olivia!, s.tripId, {
        merchant: "Cervejaria Ramiro",
        currency: "EUR",
        totalMinor: 4900,
        participantIds: [Olivia!.memberId, Ben!.memberId],
        receiptUploadId: up.uploadId,
      }),
    );
    expect(await openReceiptImage(s.d, Ben!.claims, s.tripId, up.uploadId, storage)).toMatchObject({ contentType: "image/jpeg" });
    expect(await openReceiptImage(s.d, Cat!.claims, s.tripId, up.uploadId, storage)).toBeNull(); // not on the expense (E-31)
    const [row] = await asService(s.d, (tx) => tx.select().from(expenses).where(eq(expenses.id, id)));
    expect(row!.receiptHash).toHaveLength(64);

    // Same photo again → flagged as a duplicate (FR-64).
    const again = await createReceiptUpload(s.d, Ben!.claims, { tripId: s.tripId, bytes: JPEG }, storage);
    expect(again.duplicateOfExpenseId).toBe(id);
    const r = await add(s.d, Ben!, s.tripId, { merchant: "Other", totalMinor: 1, receiptUploadId: again.uploadId });
    expect(r.ok).toBe(false);
  });

  it("without a model an image-only receipt falls back to manual entry", async () => {
    const s = await setup(["Olivia"]);
    const storage = localStorageAdapter(mkdtempSync(join(tmpdir(), "wandr-rcpt-")));
    const up = await createReceiptUpload(s.d, s.p.Olivia!.claims, { tripId: s.tripId, bytes: JPEG }, storage);
    await readReceiptJob(s.d, up.uploadId, { storage, model: null });
    expect((await getReceiptUpload(s.d, s.p.Olivia!.claims, s.tripId, up.uploadId))!.status).toBe("failed");
  });
});

describe("Frankfurter parsing (FR-66)", () => {
  it("keeps rates as exact decimal strings", () => {
    const r = parseFrankfurterRates('{"amount":1.0,"base":"USD","date":"2026-09-30","rates":{"EUR":0.9241,"JPY":157.23}}', "USD");
    expect(r).toEqual({ base: "USD", rates: { EUR: "0.9241", JPY: "157.23" } });
  });
});
