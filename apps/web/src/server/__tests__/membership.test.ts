/**
 * Joining and roles against real Postgres + RLS (FR-2..FR-11, FR-17, FR-T4/T5, J-7/8/9, M-1..M-12).
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  asService,
  auditLog,
  expenseAdjustments,
  expenses,
  expenseShares,
  memberContacts,
  memberLinks,
  members,
  setDbForTests,
  trips,
  users,
  type Db,
} from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { JOIN_LIMITS } from "@wandr/core";
import { createTrip } from "../trips";
import {
  addManagedMember,
  attachVerifiedIdentity,
  balanceFor,
  confirmInviteName,
  decideJoinRequest,
  deleteTrip,
  getGroupLink,
  getPeople,
  getSizeNotices,
  tripDeletionPreview,
  inspectGroupLink,
  joinViaGroupLink,
  leaveTrip,
  listJoinRequests,
  MembershipError,
  ownerSuccessionOnAccountDeletion,
  regenerateGroupLink,
  removeMember,
  restoreMember,
  setOrganizer,
  transferOwnership,
  updateJoinSettings,
} from "../membership";

vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

let d: Db;
let n = 0;
const phone = () => `+1202555${String(1000 + n++).slice(-4)}`;

async function user(name: string, ph: string | null = phone()) {
  const id = randomUUID();
  await asService(d, (tx) => tx.insert(users).values({ id, displayName: name, phone: ph }));
  return { id, phone: ph };
}

const tokenOf = (url: string) => url.split("/j/")[1]!;

async function expectCode(p: Promise<unknown>, code: MembershipError["code"]) {
  await expect(p).rejects.toMatchObject({ code });
}

async function setup() {
  const owner = await user("Nick");
  const { tripId, memberId: ownerMember } = await createTrip(d, { userId: owner.id, ownerName: "Nick", name: "Sarah's surprise bach" });
  const url = await regenerateGroupLink(d, owner.id, tripId);
  return { owner, tripId, ownerMember, token: tokenOf(url) };
}

async function joinAndApprove(s: Awaited<ReturnType<typeof setup>>, name: string) {
  const u = await user(name);
  const r = await joinViaGroupLink(d, { userId: u.id, token: s.token, name, ageConfirmed: true });
  if (r.kind !== "pending") throw new Error(`expected pending, got ${r.kind}`);
  await decideJoinRequest(d, { userId: s.owner.id, tripId: s.tripId, memberId: r.memberId, approve: true });
  return { ...u, memberId: r.memberId };
}

beforeEach(async () => {
  const { db } = await createPglite();
  d = db as unknown as Db;
  setDbForTests(d);
});

describe("group link (FR-6, FR-7, FR-10, J-7)", () => {
  it("gets the same link again, shows only the outsider name, and regenerating kills the old one", async () => {
    const s = await setup();
    const again = await getGroupLink(d, s.owner.id, s.tripId);
    expect(again.url).toContain(`/j/${s.token}`);
    expect(await inspectGroupLink(d, s.token)).toMatchObject({ tripName: "Sarah's surprise bach" });
    await updateJoinSettings(d, s.owner.id, s.tripId, { outsiderName: "Weekend away" });
    expect(await inspectGroupLink(d, s.token)).toMatchObject({ tripName: "Weekend away" });

    const fresh = tokenOf(await regenerateGroupLink(d, s.owner.id, s.tripId));
    expect(fresh).not.toBe(s.token);
    expect(await inspectGroupLink(d, s.token)).toBeNull();
    const u = await user("Late");
    expect(await joinViaGroupLink(d, { userId: u.id, token: s.token, name: "Late", ageConfirmed: true })).toEqual({
      kind: "link_off",
    });
  });

  it("members can't manage the link", async () => {
    const s = await setup();
    const sam = await joinAndApprove(s, "Sam");
    await expectCode(getGroupLink(d, sam.id, s.tripId), "not_allowed");
    await expectCode(regenerateGroupLink(d, sam.id, s.tripId), "not_allowed");
    await expectCode(updateJoinSettings(d, sam.id, s.tripId, { inviteListOnly: true }), "not_allowed");
  });

  it("requires the age attestation (FR-17)", async () => {
    const s = await setup();
    const u = await user("Kid");
    await expectCode(joinViaGroupLink(d, { userId: u.id, token: s.token, name: "Kid", ageConfirmed: false }), "invalid");
  });
});

describe("join requests and approvals (FR-6, FR-8, J-20)", () => {
  it("unknown numbers go pending; organizers see name + last 4 and approve in one tap", async () => {
    const s = await setup();
    const mo = await user("Mo", "+12025550199");
    const r = await joinViaGroupLink(d, { userId: mo.id, token: s.token, name: "Mo", ageConfirmed: true });
    expect(r).toMatchObject({ kind: "pending", paused: false });
    if (r.kind !== "pending") return;

    // Second attempt: still pending, no duplicate.
    expect((await joinViaGroupLink(d, { userId: mo.id, token: s.token, name: "Mo", ageConfirmed: true })).kind).toBe(
      "already_pending",
    );
    // Pending people can't see the trip.
    expect(await getPeople(d, { sub: mo.id }, s.tripId)).toBeNull();

    const reqs = await listJoinRequests(d, s.owner.id, s.tripId);
    expect(reqs).toEqual([expect.objectContaining({ memberId: r.memberId, name: "Mo", last4: "0199" })]);

    const sizes = await decideJoinRequest(d, { userId: s.owner.id, tripId: s.tripId, memberId: r.memberId, approve: true });
    expect(sizes).toEqual({ sizeBefore: "solo", sizeAfter: "duo" });
    expect((await getPeople(d, { sub: mo.id }, s.tripId))!.people.map((p) => p.displayName)).toEqual(["Nick", "Mo"]);
    expect(await listJoinRequests(d, s.owner.id, s.tripId)).toEqual([]);
  });

  it("deny ends the request; the person is told to ask the organizer", async () => {
    const s = await setup();
    const u = await user("Spam");
    const r = await joinViaGroupLink(d, { userId: u.id, token: s.token, name: "Spam", ageConfirmed: true });
    if (r.kind !== "pending") throw new Error();
    await decideJoinRequest(d, { userId: s.owner.id, tripId: s.tripId, memberId: r.memberId, approve: false });
    expect((await joinViaGroupLink(d, { userId: u.id, token: s.token, name: "Spam", ageConfirmed: true })).kind).toBe(
      "ask_organizer",
    );
    const people = await getPeople(d, { sub: s.owner.id }, s.tripId);
    expect(people!.former).toEqual([]); // denied requests aren't "former members"
  });

  it("only organizers decide", async () => {
    const s = await setup();
    const sam = await joinAndApprove(s, "Sam");
    const u = await user("Mo");
    const r = await joinViaGroupLink(d, { userId: u.id, token: s.token, name: "Mo", ageConfirmed: true });
    if (r.kind !== "pending") throw new Error();
    await expectCode(listJoinRequests(d, sam.id, s.tripId), "not_allowed");
    await expectCode(
      decideJoinRequest(d, { userId: sam.id, tripId: s.tripId, memberId: r.memberId, approve: true }),
      "not_allowed",
    );
  });

  it("invite-list-only: unknown numbers are told to ask the organizer (FR-7, J-9)", async () => {
    const s = await setup();
    await updateJoinSettings(d, s.owner.id, s.tripId, { inviteListOnly: true });
    const u = await user("Stranger");
    expect((await joinViaGroupLink(d, { userId: u.id, token: s.token, name: "X", ageConfirmed: true })).kind).toBe(
      "ask_organizer",
    );
  });

  it("no hourly/daily request limits on the group link (JR6)", async () => {
    const s = await setup();
    for (let i = 0; i < 12; i++) {
      const u = await user(`P${i}`);
      expect((await joinViaGroupLink(d, { userId: u.id, token: s.token, name: `P${i}`, ageConfirmed: true })).kind).toBe(
        "pending",
      );
    }
  });

  it("auto-pauses at 20 open requests and turns back on once they're handled (J-7, JR5)", async () => {
    const s = await setup();
    await asService(d, async (tx) => {
      for (let i = 0; i < JOIN_LIMITS.pendingCap - 1; i++) {
        await tx.insert(members).values({ tripId: s.tripId, displayName: `P${i}`, status: "pending" });
      }
      await tx.insert(members).values({
        tripId: s.tripId,
        displayName: "Old",
        status: "pending",
        createdAt: new Date(Date.now() - 15 * 86_400_000),
      });
    });
    const reqs = await listJoinRequests(d, s.owner.id, s.tripId);
    expect(reqs.map((r) => r.name)).not.toContain("Old");
    const u = await user("Twentieth");
    const r = await joinViaGroupLink(d, { userId: u.id, token: s.token, name: "T", ageConfirmed: true });
    expect(r).toMatchObject({ kind: "pending", paused: true });
    expect(await inspectGroupLink(d, s.token)).toMatchObject({ paused: true });
    expect(await getGroupLink(d, s.owner.id, s.tripId)).toMatchObject({ paused: true });
    expect((await getPeople(d, { sub: s.owner.id }, s.tripId))!.linkPaused).toBe(true);
    const late = await user("Late");
    expect((await joinViaGroupLink(d, { userId: late.id, token: s.token, name: "L", ageConfirmed: true })).kind).toBe(
      "link_off",
    );

    // The organizer handles one request: the same link works again, no new link needed (JR5).
    if (r.kind !== "pending") throw new Error();
    await decideJoinRequest(d, { userId: s.owner.id, tripId: s.tripId, memberId: r.memberId, approve: false });
    expect(await inspectGroupLink(d, s.token)).toMatchObject({ paused: false });
    expect(await getGroupLink(d, s.owner.id, s.tripId)).toMatchObject({ paused: false, url: expect.stringContaining(s.token) });
    expect((await getPeople(d, { sub: s.owner.id }, s.tripId))!.linkPaused).toBe(false);
    expect((await joinViaGroupLink(d, { userId: late.id, token: s.token, name: "L", ageConfirmed: true })).kind).toBe(
      "pending",
    );
  });

});

describe("invite-list numbers and identity (J-8, FR-5)", () => {
  async function invite(s: Awaited<ReturnType<typeof setup>>, name: string, ph: string, status: "invited" | "active" = "invited") {
    return asService(d, async (tx) => {
      const [m] = await tx.insert(members).values({ tripId: s.tripId, displayName: name, status }).returning({ id: members.id });
      await tx.insert(memberContacts).values({ memberId: m!.id, phone: ph });
      return m!.id;
    });
  }

  it("asks 'Are you Jess?' and joins on yes, even in invite-list-only mode", async () => {
    const s = await setup();
    await updateJoinSettings(d, s.owner.id, s.tripId, { inviteListOnly: true });
    const jess = await user("Jessica", "+12025550142");
    const jessMember = await invite(s, "Jess", "+12025550142");
    const r = await joinViaGroupLink(d, { userId: jess.id, token: s.token, name: "Jessica", ageConfirmed: true });
    expect(r).toEqual({ kind: "confirm_name", memberId: jessMember, expectedName: "Jess" });
    const c = await confirmInviteName(d, { userId: jess.id, token: s.token, memberId: jessMember, isMe: true, name: "Jessica" });
    expect(c).toEqual({ kind: "joined", tripId: s.tripId });
    const people = (await getPeople(d, { sub: jess.id }, s.tripId))!;
    expect(people.me.memberId).toBe(jessMember);
    // D67/C-JR8: they keep the name they typed.
    expect(people.people.find((p) => p.isMe)!.displayName).toBe("Jessica");
  });

  it("'That's not me' becomes a pending request under the typed name", async () => {
    const s = await setup();
    const mike = await user("Mike", "+12025550143");
    const jessMember = await invite(s, "Jess", "+12025550143");
    await confirmInviteName(d, { userId: mike.id, token: s.token, memberId: jessMember, isMe: false, name: "Mike" });
    const reqs = await listJoinRequests(d, s.owner.id, s.tripId);
    expect(reqs).toEqual([expect.objectContaining({ name: "Mike", notInviteeName: "Jess", last4: "0143" })]);
  });

  it("someone else's invite can't be claimed", async () => {
    const s = await setup();
    const jessMember = await invite(s, "Jess", "+12025550144");
    const eve = await user("Eve");
    await expectCode(
      confirmInviteName(d, { userId: eve.id, token: s.token, memberId: jessMember, isMe: true, name: "Jess" }),
      "not_found",
    );
  });

  it("a personal-link guest who signs in keeps their membership", async () => {
    const s = await setup();
    const sam = await invite(s, "Sam", "+12025550145", "active");
    const u = await user("Sam", "+12025550145");
    expect(await getPeople(d, { sub: u.id }, s.tripId)).toBeNull();
    expect(await asService(d, (tx) => attachVerifiedIdentity(tx, u.id))).toBe(1);
    expect((await getPeople(d, { sub: u.id }, s.tripId))!.me.memberId).toBe(sam);
    // Idempotent; and never attaches a second row in a trip the user is already in.
    expect(await asService(d, (tx) => attachVerifiedIdentity(tx, u.id))).toBe(0);
  });
});

describe("roles (FR-2, FR-3, §6.10)", () => {
  it("duo owner promotes the other person; organizers can't touch the owner", async () => {
    const s = await setup();
    const sam = await joinAndApprove(s, "Sam");
    await setOrganizer(d, { userId: s.owner.id, tripId: s.tripId, memberId: sam.memberId, organizer: true });
    expect((await listJoinRequests(d, sam.id, s.tripId))).toEqual([]); // now allowed
    await expectCode(
      setOrganizer(d, { userId: sam.id, tripId: s.tripId, memberId: s.ownerMember, organizer: false }),
      "not_allowed",
    );
    await expectCode(removeMember(d, { userId: sam.id, tripId: s.tripId, memberId: s.ownerMember }), "not_allowed");
    await setOrganizer(d, { userId: s.owner.id, tripId: s.tripId, memberId: sam.memberId, organizer: false });
    await expectCode(listJoinRequests(d, sam.id, s.tripId), "not_allowed");
  });

  it("members can't change roles; managed members can't organize", async () => {
    const s = await setup();
    const sam = await joinAndApprove(s, "Sam");
    const kid = await addManagedMember(d, { userId: sam.id, tripId: s.tripId, name: "Kid" });
    await expectCode(
      setOrganizer(d, { userId: sam.id, tripId: s.tripId, memberId: sam.memberId, organizer: true }),
      "not_allowed",
    );
    await expectCode(setOrganizer(d, { userId: s.owner.id, tripId: s.tripId, memberId: kid, organizer: true }), "bad_target");
  });

  it("only the owner transfers ownership, to a verified member", async () => {
    const s = await setup();
    const sam = await joinAndApprove(s, "Sam");
    await expectCode(transferOwnership(d, { userId: sam.id, tripId: s.tripId, toMemberId: sam.memberId }), "not_allowed");
    await transferOwnership(d, { userId: s.owner.id, tripId: s.tripId, toMemberId: sam.memberId });
    const p = await getPeople(d, { sub: sam.id }, s.tripId);
    expect(p!.people.find((x) => x.id === sam.memberId)!.role).toBe("owner");
    expect(p!.people.find((x) => x.id === s.ownerMember)!.role).toBe("organizer");
  });

  it("succession on account deletion: pick, else longest-standing organizer (FR-3)", async () => {
    const s = await setup();
    const a = await joinAndApprove(s, "Ana");
    const b = await joinAndApprove(s, "Ben");
    await setOrganizer(d, { userId: s.owner.id, tripId: s.tripId, memberId: b.memberId, organizer: true });
    const [r] = await ownerSuccessionOnAccountDeletion(d, s.owner.id);
    expect(r).toEqual({ tripId: s.tripId, successorMemberId: b.memberId });
    const p = await getPeople(d, { sub: a.id }, s.tripId);
    expect(p!.people.find((x) => x.id === b.memberId)!.role).toBe("owner");
    expect(p!.people.some((x) => x.id === s.ownerMember)).toBe(false);

    // Solo trip: nobody to hand over to.
    const solo = await user("Solo");
    const t2 = await createTrip(d, { userId: solo.id, ownerName: "Solo", name: "Alone" });
    expect(await ownerSuccessionOnAccountDeletion(d, solo.id, { [t2.tripId]: randomUUID() })).toEqual([
      { tripId: t2.tripId, successorMemberId: null },
    ]);
  });
});

describe("removal, leaving, restoring (FR-9, M-1..M-4, M-11, M-12)", () => {
  async function dinner(s: Awaited<ReturnType<typeof setup>>, payer: string, people: string[], total: number) {
    await asService(d, async (tx) => {
      const [e] = await tx
        .insert(expenses)
        .values({ tripId: s.tripId, merchant: "Dinner", currency: "USD", totalMinor: total, paidByMemberId: payer, uploadedByMemberId: payer })
        .returning({ id: expenses.id });
      await tx.insert(expenseShares).values(people.map((m) => ({ expenseId: e!.id, memberId: m, shareMinor: total / people.length })));
    });
  }

  it("requires resolving an open balance, records adjustments, keeps history, revokes links", async () => {
    const s = await setup();
    const a = await joinAndApprove(s, "Ana");
    const b = await joinAndApprove(s, "Ben");
    await dinner(s, s.ownerMember, [s.ownerMember, a.memberId, b.memberId], 9000); // Ben owes 3000
    await asService(d, (tx) => tx.insert(memberLinks).values({ memberId: b.memberId, tokenHash: "h" }));

    expect(await balanceFor(d, s.owner.id, s.tripId, b.memberId)).toEqual([{ currency: "USD", balanceMinor: -3000 }]);
    await expectCode(balanceFor(d, a.id, s.tripId, b.memberId), "not_allowed");
    await expectCode(removeMember(d, { userId: s.owner.id, tripId: s.tripId, memberId: b.memberId }), "resolve_balance_first");
    await expectCode(removeMember(d, { userId: a.id, tripId: s.tripId, memberId: b.memberId }), "not_allowed");

    await removeMember(d, {
      userId: s.owner.id,
      tripId: s.tripId,
      memberId: b.memberId,
      resolution: { kind: "split_group" },
    });
    expect(await balanceFor(d, s.owner.id, s.tripId, b.memberId)).toEqual([]);
    expect(await balanceFor(d, s.owner.id, s.tripId, a.memberId)).toEqual([{ currency: "USD", balanceMinor: -4500 }]);
    const adj = await asService(d, (tx) => tx.select().from(expenseAdjustments));
    expect(adj.every((x) => x.reason === "member_removed:split_group")).toBe(true);
    const [link] = await asService(d, (tx) => tx.select().from(memberLinks).where(eq(memberLinks.memberId, b.memberId)));
    expect(link!.revokedAt).not.toBeNull();
    expect(await getPeople(d, { sub: b.id }, s.tripId)).toBeNull();

    const p = await getPeople(d, { sub: s.owner.id }, s.tripId);
    expect(p!.former).toEqual([{ id: b.memberId, displayName: "Ben", canRestore: true }]);
    await restoreMember(d, { userId: s.owner.id, tripId: s.tripId, memberId: b.memberId });
    expect((await getPeople(d, { sub: b.id }, s.tripId))!.me.memberId).toBe(b.memberId);
  });

  it("restore only within 30 days", async () => {
    const s = await setup();
    const a = await joinAndApprove(s, "Ana");
    await removeMember(d, { userId: s.owner.id, tripId: s.tripId, memberId: a.memberId });
    await expectCode(
      restoreMember(d, { userId: s.owner.id, tripId: s.tripId, memberId: a.memberId, now: new Date(Date.now() + 31 * 86_400_000) }),
      "expired",
    );
  });

  it("members leave (balance stays on the ledger); the owner must hand over first", async () => {
    const s = await setup();
    const a = await joinAndApprove(s, "Ana");
    await dinner(s, s.ownerMember, [s.ownerMember, a.memberId], 4000);
    await expectCode(leaveTrip(d, { userId: s.owner.id, tripId: s.tripId }), "owner_cannot_leave");
    expect(await balanceFor(d, a.id, s.tripId, a.memberId)).toEqual([{ currency: "USD", balanceMinor: -2000 }]);
    await leaveTrip(d, { userId: a.id, tripId: s.tripId });
    expect(await getPeople(d, { sub: a.id }, s.tripId)).toBeNull();
    expect(await balanceFor(d, s.owner.id, s.tripId, a.memberId)).toEqual([{ currency: "USD", balanceMinor: -2000 }]);
    const [log] = await asService(d, (tx) =>
      tx.select().from(auditLog).where(and(eq(auditLog.tripId, s.tripId), eq(auditLog.action, "member.left"))),
    );
    expect(log).toBeDefined();
  });
});

describe("managed members and size notices (FR-11, FR-T3/T4/T5)", () => {
  it("adds a managed member shown as 'managed by'; counts toward size", async () => {
    const s = await setup();
    const sam = await joinAndApprove(s, "Sam");
    const kid = await addManagedMember(d, { userId: sam.id, tripId: s.tripId, name: "Leo" });
    const p = await getPeople(d, { sub: sam.id }, s.tripId);
    expect(p!.size).toBe("group");
    expect(p!.people.find((x) => x.id === kid)).toMatchObject({ managedByName: "Sam", managedByMe: true });
    const [t] = await asService(d, (tx) => tx.select({ size: trips.size }).from(trips).where(eq(trips.id, s.tripId)));
    expect(t!.size).toBe("group");
  });

  it("shows each notice once, to the right people", async () => {
    const s = await setup();
    expect((await getPeople(d, { sub: s.owner.id }, s.tripId))!.notices).toEqual(["solo_to_duo"]);
    const sam = await joinAndApprove(s, "Sam");
    expect((await getPeople(d, { sub: s.owner.id }, s.tripId))!.notices).toEqual([]);
    const cy = await joinAndApprove(s, "Cy"); // duo → group
    expect((await getPeople(d, { sub: s.owner.id }, s.tripId))!.notices).toEqual(["duo_to_group"]);
    expect((await getPeople(d, { sub: sam.id }, s.tripId))!.notices).toEqual(["duo_to_group"]);
    expect((await getPeople(d, { sub: cy.id }, s.tripId))!.notices).toEqual([]);

    await asService(d, (tx) =>
      tx.update(members).set({ noticesSeen: ["duo_to_group"] }).where(eq(members.id, sam.memberId)),
    );
    expect((await getPeople(d, { sub: sam.id }, s.tripId))!.notices).toEqual([]);

    await removeMember(d, { userId: s.owner.id, tripId: s.tripId, memberId: cy.memberId }); // group → duo
    expect((await getPeople(d, { sub: sam.id }, s.tripId))!.notices).toEqual(["group_to_duo"]);
  });
});

describe("founder decisions: delete trip (JR3), managed members (JR11), feed notices (JR13)", () => {
  it("only the owner deletes, after typing the name; hidden for everyone, rows kept", async () => {
    const s = await setup();
    const sam = await joinAndApprove(s, "Sam");
    await expectCode(deleteTrip(d, { userId: sam.id, tripId: s.tripId, confirmation: "Sarah's surprise bach" }), "not_allowed");
    expect(await tripDeletionPreview(d, s.owner.id, s.tripId)).toMatchObject({
      tripName: "Sarah's surprise bach",
      otherMembers: 1,
    });
    await expectCode(deleteTrip(d, { userId: s.owner.id, tripId: s.tripId, confirmation: "nope" }), "confirmation_mismatch");
    await deleteTrip(d, { userId: s.owner.id, tripId: s.tripId, confirmation: "sarah's SURPRISE bach" });
    expect(await getPeople(d, { sub: sam.id }, s.tripId)).toBeNull();
    expect(await getPeople(d, { sub: s.owner.id }, s.tripId)).toBeNull();
    expect(await inspectGroupLink(d, s.token)).toBeNull();
    const [t] = await asService(d, (tx) => tx.select().from(trips).where(eq(trips.id, s.tripId)));
    expect(t!.deletedAt).not.toBeNull();
  });

  it("organizers act for a managed member once their manager leaves", async () => {
    const s = await setup();
    const mia = await joinAndApprove(s, "Mia");
    await addManagedMember(d, { userId: mia.id, tripId: s.tripId, name: "Kid" });
    const kidOf = async () => (await getPeople(d, { sub: s.owner.id }, s.tripId))!.people.find((p) => p.displayName === "Kid")!;
    expect(await kidOf()).toMatchObject({ managedByName: "Mia", managedByMe: false });
    await leaveTrip(d, { userId: mia.id, tripId: s.tripId });
    expect(await kidOf()).toMatchObject({ managedByName: "organizers", managedByMe: true });
  });

  it("size notices are available for the Ideas feed too", async () => {
    const s = await setup();
    const sam = await joinAndApprove(s, "Sam");
    await joinAndApprove(s, "Cy"); // duo → group
    expect(await getSizeNotices(d, { sub: sam.id }, s.tripId)).toEqual({ memberId: sam.memberId, notices: ["duo_to_group"] });
  });
});
