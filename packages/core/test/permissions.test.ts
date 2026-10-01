import { describe, expect, it } from "vitest";
import { ACTIONS, can, pickSuccessor, type Action, type Actor } from "../src/permissions";
import type { MemberRole, MemberStatus } from "../src/domain";

const actor = (role: MemberRole, scope: "link" | "full" = "full", status: MemberStatus = "active", memberId = "me"): Actor => ({
  memberId,
  role,
  status,
  scope,
});

const ORGANIZER_ONLY: Action[] = [
  "change_idea_status",
  "manage_stages",
  "create_poll",
  "close_poll",
  "invite",
  "approve_join",
  "change_settings",
  "toggle_surprise",
  "mark_guest_of_honor",
];
const ANY_MEMBER: Action[] = [
  "view_trip_name",
  "view_trip",
  "vote",
  "add_idea",
  "comment",
  "edit_idea_details",
  "view_money",
  "add_expense",
  "record_payment",
  "set_attendance",
];

describe("role matrix, full scope (FR-2, FR-23, FR-49)", () => {
  it.each(ANY_MEMBER)("any active member can %s", (a) => {
    for (const role of ["owner", "organizer", "member"] as const) expect(can(actor(role), a).allowed).toBe(true);
  });

  it.each(ORGANIZER_ONLY)("only owner/organizers can %s", (a) => {
    expect(can(actor("owner"), a).allowed).toBe(true);
    expect(can(actor("organizer"), a).allowed).toBe(true);
    expect(can(actor("member"), a)).toEqual({ allowed: false, reason: "organizers_only" });
  });
});

describe("personal-link scope (FR-5)", () => {
  it.each(["view_trip", "vote", "view_trip_name"] as const)("link can %s without a code", (a) => {
    expect(can(actor("member", "link"), a).allowed).toBe(true);
  });

  it.each(ACTIONS.filter((a) => !["view_trip", "vote", "view_trip_name"].includes(a)))(
    "link needs a code for %s (when the role would allow it)",
    (a) => {
      const ctx = {
        target: { memberId: "x", role: "member" as const, managedByMemberId: "me" },
        expense: { uploaderMemberId: "me", locked: false },
      };
      const out = can(actor("owner", "link"), a, ctx);
      expect(out).toEqual({ allowed: false, reason: "needs_code", needsCode: true });
    },
  );

  it("link doesn't ask for a code when the role forbids the action anyway", () => {
    expect(can(actor("member", "link"), "change_settings")).toEqual({ allowed: false, reason: "organizers_only" });
  });
});

describe("status gates (FR-6, FR-9)", () => {
  it.each(ACTIONS)("pending can only see the trip name: %s", (a) => {
    expect(can(actor("member", "full", "pending"), a).allowed).toBe(a === "view_trip_name");
  });
  it.each(ACTIONS)("removed can do nothing: %s", (a) => {
    expect(can(actor("organizer", "full", "removed"), a).allowed).toBe(false);
  });
  it.each(ACTIONS)("invited (not joined) can do nothing: %s", (a) => {
    expect(can(actor("member", "full", "invited"), a).allowed).toBe(false);
  });
  it("not_attending keeps read + money access only (M-9)", () => {
    const na = actor("member", "full", "not_attending");
    expect(can(na, "view_trip").allowed).toBe(true);
    expect(can(na, "view_money").allowed).toBe(true);
    expect(can(na, "record_payment").allowed).toBe(true);
    expect(can(na, "vote").allowed).toBe(false);
    expect(can(na, "add_idea").allowed).toBe(false);
  });
});

describe("remove_member (FR-2, FR-9)", () => {
  const t = (role: MemberRole, memberId = "x") => ({ target: { memberId, role } });
  it("nobody can remove the owner", () => {
    expect(can(actor("organizer"), "remove_member", t("owner"))).toMatchObject({ reason: "owner_cannot_be_removed" });
    expect(can(actor("owner"), "remove_member", t("owner", "other"))).toMatchObject({ reason: "owner_cannot_be_removed" });
  });
  it("organizers can remove members and other organizers", () => {
    expect(can(actor("organizer"), "remove_member", t("member")).allowed).toBe(true);
    expect(can(actor("organizer"), "remove_member", t("organizer")).allowed).toBe(true);
  });
  it("open balance must be resolved first", () => {
    expect(can(actor("owner"), "remove_member", { ...t("member"), targetHasOpenBalance: true })).toMatchObject({
      reason: "resolve_balance_first",
    });
  });
  it("needs a target; can't remove self", () => {
    expect(can(actor("owner"), "remove_member")).toMatchObject({ reason: "target_required" });
    expect(can(actor("organizer"), "remove_member", t("organizer", "me"))).toMatchObject({ reason: "cannot_remove_self" });
  });
});

describe("ownership and roles (FR-2, D34)", () => {
  it("only the owner transfers ownership", () => {
    const ctx = { target: { memberId: "x", role: "organizer" as const } };
    expect(can(actor("owner"), "transfer_ownership", ctx).allowed).toBe(true);
    expect(can(actor("organizer"), "transfer_ownership", ctx)).toMatchObject({ reason: "owner_only" });
  });
  it("the owner's role can't be changed via change_role", () => {
    expect(can(actor("organizer"), "change_role", { target: { memberId: "o", role: "owner" } })).toMatchObject({ reason: "owner_only" });
    expect(can(actor("owner"), "change_role", { target: { memberId: "x", role: "member" } }).allowed).toBe(true);
  });
});

describe("expenses (FR-68, FR-69)", () => {
  const exp = (uploaderMemberId: string, locked = false) => ({ expense: { uploaderMemberId, locked } });
  it.each<[MemberRole, string, boolean, boolean | string]>([
    ["member", "me", false, true],
    ["member", "other", false, "not_uploader"],
    ["organizer", "other", false, true],
    ["owner", "other", false, true],
    ["owner", "me", true, "expense_locked_use_adjustment"],
    ["member", "me", true, "expense_locked_use_adjustment"],
  ])("%s editing expense by %s (locked=%s)", (role, uploader, locked, expected) => {
    const out = can(actor(role), "edit_expense", exp(uploader, locked));
    if (expected === true) expect(out.allowed).toBe(true);
    else expect(out).toMatchObject({ allowed: false, reason: expected });
  });
});

describe("acting for managed members (FR-11, V-14)", () => {
  it("can vote / set attendance for yourself or a member you manage", () => {
    expect(can(actor("member"), "vote", { target: { memberId: "me", role: "member" } }).allowed).toBe(true);
    expect(can(actor("member"), "vote", { target: { memberId: "kid", role: "member", managedByMemberId: "me" } }).allowed).toBe(true);
    expect(can(actor("member"), "set_attendance", { target: { memberId: "x", role: "member" } })).toMatchObject({
      reason: "not_your_member",
    });
    expect(can(actor("organizer"), "vote", { target: { memberId: "x", role: "member" } })).toMatchObject({ reason: "not_your_member" });
  });
});

describe("size gates (§6.10)", () => {
  it.each([
    ["create_poll", "solo", false],
    ["create_poll", "duo", true],
    ["toggle_surprise", "solo", false],
    ["toggle_surprise", "duo", true],
    ["mark_guest_of_honor", "duo", false],
    ["mark_guest_of_honor", "group", true],
    ["invite", "solo", true],
  ] as const)("%s in %s → %s", (a, size, ok) => {
    expect(can(actor("owner"), a, { tripSize: size }).allowed).toBe(ok);
  });
});

describe("pickSuccessor (FR-3, J-11)", () => {
  const m = (memberId: string, role: MemberRole, joinedAt: string, status: MemberStatus = "active", managedByMemberId: string | null = null) => ({
    memberId,
    role,
    status,
    joinedAt,
    managedByMemberId,
  });
  it("longest-standing organizer first", () => {
    const out = pickSuccessor(
      [m("own", "owner", "2026-01-01"), m("old", "member", "2026-01-02"), m("org2", "organizer", "2026-03-01"), m("org1", "organizer", "2026-02-01")],
      "own",
    );
    expect(out).toBe("org1");
  });
  it("else longest-tenured active member, skipping removed and managed", () => {
    const out = pickSuccessor(
      [
        m("own", "owner", "2026-01-01"),
        m("gone", "organizer", "2026-01-01", "removed"),
        m("kid", "member", "2026-01-01", "active", "own"),
        m("b", "member", "2026-02-01"),
        m("a", "member", "2026-01-15"),
      ],
      "own",
    );
    expect(out).toBe("a");
  });
  it("ties break by id; nobody → null", () => {
    expect(pickSuccessor([m("z", "member", "2026-01-01"), m("y", "member", "2026-01-01")], "own")).toBe("y");
    expect(pickSuccessor([m("own", "owner", "2026-01-01")], "own")).toBeNull();
  });
});
