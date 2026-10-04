/**
 * Account settings against real Postgres + RLS: deleting an account (FR-3, J-11, NFR-5, NFR-7),
 * the recycled-number recheck confirmed by an organizer (FR-16, J-4) and the money-only view for
 * removed members (FR-9, M-1, M-2).
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  asService,
  boards,
  expenses,
  expenseShares,
  memberContacts,
  memberLinks,
  members,
  savedIdeas,
  setDbForTests,
  trips,
  users,
  type Db,
} from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { createTrip } from "../trips";
import { decideJoinRequest, joinViaGroupLink, leaveTrip, regenerateGroupLink, setOrganizer, tripBalances } from "../membership";
import {
  accountDeletionPreview,
  AccountError,
  approveRecheck,
  deleteAccount,
  getAccount,
  getFormerMoney,
  listFormerTrips,
  listRecheckRequests,
  recordFormerSettleUp,
} from "../account";
import { getMoneyOverview } from "../expenses";

vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

let d: Db;
let n = 0;
const phone = () => `+1202555${String(2000 + n++).slice(-4)}`;

beforeEach(async () => {
  const { db } = await createPglite();
  d = db as unknown as Db;
  setDbForTests(d);
});

async function user(name: string, email: string | null = null) {
  const id = randomUUID();
  const ph = phone();
  await asService(d, (tx) => tx.insert(users).values({ id, displayName: name, phone: ph, email }));
  return { id, phone: ph };
}

async function trip(ownerName: string, name: string) {
  const owner = await user(ownerName);
  const t = await createTrip(d, { userId: owner.id, ownerName, name });
  const token = (await regenerateGroupLink(d, owner.id, t.tripId)).split("/j/")[1]!;
  return { owner, tripId: t.tripId, ownerMember: t.memberId, token };
}

async function join(t: Awaited<ReturnType<typeof trip>>, name: string, existing?: { id: string }) {
  const u = existing ?? (await user(name));
  const r = await joinViaGroupLink(d, { userId: u.id, token: t.token, name, ageConfirmed: true });
  if (r.kind !== "pending") throw new Error(`expected pending, got ${r.kind}`);
  await decideJoinRequest(d, { userId: t.owner.id, tripId: t.tripId, memberId: r.memberId, approve: true });
  return { ...u, memberId: r.memberId };
}

async function expense(tripId: string, payer: string, people: string[], total: number, currency = "USD", merchant = "Dinner") {
  return asService(d, async (tx) => {
    const [e] = await tx
      .insert(expenses)
      .values({ tripId, merchant, currency, totalMinor: total, paidByMemberId: payer, uploadedByMemberId: payer })
      .returning({ id: expenses.id });
    await tx.insert(expenseShares).values(people.map((m) => ({ expenseId: e!.id, memberId: m, shareMinor: total / people.length })));
    return e!.id;
  });
}

const sumsToZero = (b: Record<string, Record<string, number>>) =>
  Object.values(b).every((row) => Object.values(row).reduce((x, y) => x + y, 0) === 0);

describe("deleting an account (FR-3, J-11, NFR-5, NFR-7)", () => {
  it("previews, hands over, deletes solo trips, anonymizes, and keeps balances whole", async () => {
    const t = await trip("Nick", "Lisbon");
    const ana = await join(t, "Ana");
    const ben = await join(t, "Ben");
    await setOrganizer(d, { userId: t.owner.id, tripId: t.tripId, memberId: ben.memberId, organizer: true });
    await expense(t.tripId, t.ownerMember, [t.ownerMember, ana.memberId, ben.memberId], 9000);
    await expense(t.tripId, ana.memberId, [t.ownerMember, ana.memberId], 4000, "EUR");
    const solo = await createTrip(d, { userId: t.owner.id, ownerName: "Nick", name: "Just me" });
    // Nick is also a member of Ben's trip.
    const other = await trip("Olga", "Porto");
    const nickInOther = await join(other, "Nick", t.owner);
    await expense(other.tripId, other.ownerMember, [other.ownerMember, nickInOther.memberId], 1000);
    // Library.
    await asService(d, async (tx) => {
      await tx.insert(savedIdeas).values({ userId: t.owner.id, title: "Time Out Market" });
      await tx.insert(boards).values({ ownerUserId: t.owner.id, name: "Someday" });
      await tx.insert(memberLinks).values({ memberId: t.ownerMember, tokenHash: "nick-link" });
    });

    const before = await asService(d, (tx) => tripBalances(tx, t.tripId));
    const preview = await accountDeletionPreview(d, t.owner.id);
    expect(preview.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "hand_over", tripId: t.tripId, successorMemberId: ben.memberId, picked: false }),
        expect.objectContaining({ kind: "delete_trip", tripId: solo.tripId }),
        expect.objectContaining({ kind: "leave", tripId: other.tripId }),
      ]),
    );
    expect(preview.balances[t.tripId]).toEqual([
      { currency: "EUR", balanceMinor: -2000 },
      { currency: "USD", balanceMinor: 6000 },
    ]);
    expect(preview.balances[other.tripId]).toEqual([{ currency: "USD", balanceMinor: -500 }]);
    expect(preview.library).toEqual({ saves: 1, boards: 1 });
    // Picking someone changes the preview.
    expect((await accountDeletionPreview(d, t.owner.id, { [t.tripId]: ana.memberId })).plans[0]).toMatchObject({
      successorMemberId: ana.memberId,
      picked: true,
    });

    await expect(deleteAccount(d, { userId: t.owner.id, confirmation: "nope" })).rejects.toBeInstanceOf(AccountError);
    const tally = await deleteAccount(d, { userId: t.owner.id, confirmation: "Delete", picks: { [t.tripId]: ana.memberId } });
    expect(tally).toEqual({ handedOver: 1, deletedTrips: 1, left: 1 });

    await asService(d, async (tx) => {
      const rows = await tx.select().from(members).where(eq(members.userId, t.owner.id));
      expect(rows).toHaveLength(3);
      for (const r of rows) expect(r).toMatchObject({ displayName: "Former member", status: "removed", role: "member" });
      const [ownerNow] = await tx.select().from(members).where(eq(members.id, ana.memberId));
      expect(ownerNow!.role).toBe("owner");
      const [soloTrip] = await tx.select().from(trips).where(eq(trips.id, solo.tripId));
      expect(soloTrip!.deletedAt).not.toBeNull();
      const [u] = await tx.select().from(users).where(eq(users.id, t.owner.id));
      expect(u).toMatchObject({ phone: null, email: null, displayName: "Former member" });
      expect(u!.deletedAt).not.toBeNull();
      const contacts = await tx.select().from(memberContacts).where(inArray(memberContacts.memberId, rows.map((r) => r.id)));
      for (const c of contacts) expect(c).toMatchObject({ phone: null, email: null });
      const [link] = await tx.select().from(memberLinks).where(eq(memberLinks.tokenHash, "nick-link"));
      expect(link!.revokedAt).not.toBeNull();
      expect(await tx.$count(savedIdeas, eq(savedIdeas.userId, t.owner.id))).toBe(0);
      expect(await tx.$count(boards, eq(boards.ownerUserId, t.owner.id))).toBe(0);
    });

    // NFR-5/NFR-7: the ledger is untouched and still sums to zero in every currency.
    const after = await asService(d, (tx) => tripBalances(tx, t.tripId));
    expect(after).toEqual(before);
    expect(sumsToZero(after)).toBe(true);
    expect(sumsToZero(await asService(d, (tx) => tripBalances(tx, other.tripId)))).toBe(true);
    // The others still see the expense, now with a former member on it.
    const o = await getMoneyOverview(d, { sub: ana.id }, t.tripId);
    expect(o.members.find((m) => m.id === t.ownerMember)).toMatchObject({ displayName: "Former member", status: "removed" });
    expect(o.balances.USD![t.ownerMember]).toBe(6000);

    expect(await getAccount(d, t.owner.id)).toBeNull();
    await expect(deleteAccount(d, { userId: t.owner.id, confirmation: "delete" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("recycled-number recheck confirmed by an organizer (FR-16, J-4)", () => {
  it("shows the request to organizers only and clears it on approval", async () => {
    const t = await trip("Nick", "Lisbon");
    const ana = await join(t, "Ana");
    const ben = await join(t, "Ben");
    await asService(d, (tx) => tx.update(users).set({ recheckPendingAt: new Date() }).where(eq(users.id, ana.id)));

    expect(await getAccount(d, ana.id)).toMatchObject({ recheckPending: true });
    expect(await listRecheckRequests(d, ben.id, t.tripId)).toEqual([]); // not an organizer
    await expect(approveRecheck(d, { userId: ben.id, tripId: t.tripId, memberId: ana.memberId })).rejects.toMatchObject({ code: "not_allowed" });
    const reqs = await listRecheckRequests(d, t.owner.id, t.tripId);
    expect(reqs).toMatchObject([{ memberId: ana.memberId, name: "Ana" }]);

    // An organizer whose own recheck is pending can't vouch for anyone.
    await asService(d, (tx) => tx.update(users).set({ recheckPendingAt: new Date() }).where(eq(users.id, t.owner.id)));
    expect(await listRecheckRequests(d, t.owner.id, t.tripId)).toEqual([]);
    await expect(approveRecheck(d, { userId: t.owner.id, tripId: t.tripId, memberId: ana.memberId })).rejects.toMatchObject({ code: "not_allowed" });
    await asService(d, (tx) => tx.update(users).set({ recheckPendingAt: null }).where(eq(users.id, t.owner.id)));

    // Money stays hidden from Ana until then (RLS).
    await expense(t.tripId, t.ownerMember, [t.ownerMember, ana.memberId], 2000);
    await expect(getMoneyOverview(d, { sub: ana.id }, t.tripId)).resolves.toMatchObject({ expenses: [] });

    await approveRecheck(d, { userId: t.owner.id, tripId: t.tripId, memberId: ana.memberId });
    expect(await getAccount(d, ana.id)).toMatchObject({ recheckPending: false });
    expect(await listRecheckRequests(d, t.owner.id, t.tripId)).toEqual([]);
    expect((await getMoneyOverview(d, { sub: ana.id }, t.tripId)).expenses).toHaveLength(1);
    await expect(approveRecheck(d, { userId: t.owner.id, tripId: t.tripId, memberId: ana.memberId })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("money-only view for removed members (FR-9, M-1, M-2)", () => {
  it("lists the former trip with its balance, and settling up brings it to zero", async () => {
    const t = await trip("Nick", "Lisbon");
    const ana = await join(t, "Ana");
    const ben = await join(t, "Ben");
    await expense(t.tripId, t.ownerMember, [t.ownerMember, ana.memberId, ben.memberId], 9000, "USD", "Ramiro");
    await expense(t.tripId, ben.memberId, [t.ownerMember, ben.memberId], 1000, "USD", "Not Ana's");
    await leaveTrip(d, { userId: ana.id, tripId: t.tripId }); // M-4: the balance stays open

    expect(await listFormerTrips(d, ben.id)).toEqual([]);
    expect(await listFormerTrips(d, ana.id)).toEqual([{ tripId: t.tripId, tripName: "Lisbon", balances: { USD: -3000 } }]);
    const view = await getFormerMoney(d, ana.id, t.tripId);
    expect(view!.expenses.map((e) => e.merchant)).toEqual(["Ramiro"]);
    expect(view!.people.map((p) => p.name).sort()).toEqual(["Ben", "Nick"]);
    expect(await getFormerMoney(d, ben.id, t.tripId)).toBeNull();

    await expect(
      recordFormerSettleUp(d, ana.id, { tripId: t.tripId, otherMemberId: t.ownerMember, iPaid: true, currency: "EUR", amountMinor: 3000 }),
    ).rejects.toMatchObject({ code: "invalid" });
    await recordFormerSettleUp(d, ana.id, { tripId: t.tripId, otherMemberId: t.ownerMember, iPaid: true, currency: "USD", amountMinor: 3000, note: "Venmo" });
    expect(await listFormerTrips(d, ana.id)).toEqual([{ tripId: t.tripId, tripName: "Lisbon", balances: { USD: 0 } }]);
    // The trip's ledger agrees, and still sums to zero.
    const b = await asService(d, (tx) => tripBalances(tx, t.tripId));
    expect(b.USD![ana.memberId]).toBe(0);
    expect(sumsToZero(b)).toBe(true);
  });
});
