/** FR-3, J-11, NFR-7: what deleting an account does to each trip. */
import { describe, expect, it } from "vitest";
import { accountDeleteConfirmed, planAccountDeletion, type AccountTrip, type AccountTripMember } from "../src/account-deletion";

const m = (memberId: string, over: Partial<AccountTripMember> = {}): AccountTripMember => ({
  memberId,
  displayName: memberId.toUpperCase(),
  role: "member",
  status: "active",
  joinedAt: "2026-01-01T00:00:00Z",
  managedByMemberId: null,
  verified: true,
  ...over,
});

const trip = (members: AccountTripMember[], over: Partial<AccountTrip> = {}): AccountTrip => ({
  tripId: "t1",
  tripName: "Lisbon",
  myMemberId: "me",
  myRole: "owner",
  myStatus: "active",
  members: [m("me", { role: "owner", joinedAt: "2025-01-01T00:00:00Z" }), ...members],
  ...over,
});

describe("planAccountDeletion", () => {
  it("defaults to the longest-standing organizer, else the longest-tenured member", () => {
    const [p] = planAccountDeletion([
      trip([
        m("ana", { joinedAt: "2026-01-01T00:00:00Z" }),
        m("ben", { role: "organizer", joinedAt: "2026-03-01T00:00:00Z" }),
      ]),
    ]);
    expect(p).toMatchObject({ kind: "hand_over", successorMemberId: "ben", picked: false });
    expect(p?.kind === "hand_over" && p.candidates.map((c) => c.memberId)).toEqual(["ben", "ana"]);
    const [q] = planAccountDeletion([trip([m("cat", { joinedAt: "2026-05-01T00:00:00Z" }), m("ana")])]);
    expect(q).toMatchObject({ kind: "hand_over", successorMemberId: "ana" });
  });

  it("honors a valid pick and ignores an invalid one", () => {
    const t = trip([m("ana"), m("ben", { role: "organizer" }), m("kid", { managedByMemberId: "me" })]);
    expect(planAccountDeletion([t], { t1: "ana" })[0]).toMatchObject({ successorMemberId: "ana", picked: true });
    expect(planAccountDeletion([t], { t1: "kid" })[0]).toMatchObject({ successorMemberId: "ben", picked: false });
    expect(planAccountDeletion([t], { t1: "me" })[0]).toMatchObject({ successorMemberId: "ben" });
  });

  it("prefers verified people; falls back to a link-only guest before deleting", () => {
    const t = trip([m("guest", { verified: false, joinedAt: "2025-06-01T00:00:00Z" }), m("ana")]);
    expect(planAccountDeletion([t])[0]).toMatchObject({ successorMemberId: "ana" });
    const onlyGuest = trip([m("guest", { verified: false })]);
    expect(planAccountDeletion([onlyGuest])[0]).toMatchObject({ kind: "hand_over", successorMemberId: "guest" });
  });

  it("deletes trips where the caller is the only member (managed and former members don't count)", () => {
    const t = trip([m("kid", { managedByMemberId: "me" }), m("old", { status: "removed" }), m("inv", { status: "invited" })]);
    expect(planAccountDeletion([t])[0]).toMatchObject({ kind: "delete_trip", tripId: "t1" });
    expect(planAccountDeletion([trip([])])[0]!.kind).toBe("delete_trip");
  });

  it("leaves trips the caller doesn't own, or was already removed from", () => {
    expect(planAccountDeletion([trip([m("ana", { role: "owner" })], { myRole: "member" })])[0]).toMatchObject({
      kind: "leave",
      alreadyFormer: false,
    });
    expect(planAccountDeletion([trip([], { myRole: "member", myStatus: "removed" })])[0]).toMatchObject({
      kind: "leave",
      alreadyFormer: true,
    });
  });

  it("typed confirmation", () => {
    expect(accountDeleteConfirmed("  Delete ")).toBe(true);
    expect(accountDeleteConfirmed("delete my account")).toBe(false);
    expect(accountDeleteConfirmed("")).toBe(false);
  });
});
