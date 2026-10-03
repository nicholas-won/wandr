import { describe, expect, it } from "vitest";
import {
  canRestore,
  decideGroupJoin,
  isGroupLinkPaused,
  isPendingExpired,
  JOIN_LIMITS,
  lastSizeTransition,
  openBalancesFor,
  pendingSizeNotices,
  planBalanceResolution,
  ResolutionError,
  shouldPauseAfterRequest,
  type GroupJoinInput,
} from "../src/joining";
import { computeBalances } from "../src/money/balances";

const DAY = 86_400_000;
const base: GroupJoinInput = {
  linkActive: true,
  inviteListOnly: false,
  existing: null,
  invitedMatch: null,
  openPending: 0,
};

describe("decideGroupJoin (FR-6/7, J-7/8/9)", () => {
  it("unknown number becomes a request", () => {
    expect(decideGroupJoin(base)).toEqual({ kind: "request" });
  });
  it("invite-list number gets a name check (J-8)", () => {
    expect(decideGroupJoin({ ...base, invitedMatch: { memberId: "m1", displayName: "Jess" } })).toEqual({
      kind: "confirm_name",
      memberId: "m1",
      expectedName: "Jess",
    });
  });
  it("invite-list number still joins in invite-list-only mode; unknown is told to ask (FR-7)", () => {
    const only = { ...base, inviteListOnly: true };
    expect(decideGroupJoin({ ...only, invitedMatch: { memberId: "m1", displayName: "J" } }).kind).toBe("confirm_name");
    expect(decideGroupJoin(only).kind).toBe("ask_organizer");
  });
  it("existing statuses", () => {
    expect(decideGroupJoin({ ...base, existing: { status: "active" } }).kind).toBe("already_member");
    expect(decideGroupJoin({ ...base, existing: { status: "not_attending" } }).kind).toBe("already_member");
    expect(decideGroupJoin({ ...base, existing: { status: "pending" } }).kind).toBe("already_pending");
    expect(decideGroupJoin({ ...base, existing: { status: "removed" } }).kind).toBe("ask_organizer");
  });
  it("members still get in when the link is off; others don't", () => {
    expect(decideGroupJoin({ ...base, linkActive: false, existing: { status: "active" } }).kind).toBe("already_member");
    expect(decideGroupJoin({ ...base, linkActive: false }).kind).toBe("link_off");
  });
  it("only the open-request cap pauses the link; no hourly/daily limits (JR6)", () => {
    expect(JOIN_LIMITS).not.toHaveProperty("requestsPerTripHour");
    expect(JOIN_LIMITS).not.toHaveProperty("requestsPerTripDay");
    expect(decideGroupJoin({ ...base, openPending: JOIN_LIMITS.pendingCap - 1 }).kind).toBe("request");
    expect(decideGroupJoin({ ...base, openPending: JOIN_LIMITS.pendingCap }).kind).toBe("link_off");
    expect(shouldPauseAfterRequest(19)).toBe(false);
    expect(shouldPauseAfterRequest(20)).toBe(true);
    expect(shouldPauseAfterRequest(21)).toBe(false); // recorded once, when the cap is reached
  });
  it("the link turns back on by itself once requests drop below the cap (JR5)", () => {
    expect(isGroupLinkPaused(JOIN_LIMITS.pendingCap)).toBe(true);
    expect(isGroupLinkPaused(JOIN_LIMITS.pendingCap - 1)).toBe(false);
    expect(isGroupLinkPaused(0)).toBe(false);
  });
});

describe("expiry and restore windows", () => {
  it("pending expires after 14 days (J-7)", () => {
    const now = Date.UTC(2026, 9, 20);
    expect(isPendingExpired(now - 13 * DAY, now)).toBe(false);
    expect(isPendingExpired(now - 14 * DAY, now)).toBe(true);
  });
  it("restore within 30 days, only for people who had joined (M-11)", () => {
    const now = Date.UTC(2026, 9, 20);
    const m = { status: "removed" as const, removedAt: now - 29 * DAY, joinedAt: now - 60 * DAY };
    expect(canRestore(m, now)).toBe(true);
    expect(canRestore({ ...m, removedAt: now - 30 * DAY }, now)).toBe(false);
    expect(canRestore({ ...m, joinedAt: null }, now)).toBe(false); // denied request
    expect(canRestore({ ...m, status: "active" }, now)).toBe(false);
  });
});

describe("planBalanceResolution (FR-9)", () => {
  // A paid 9000 USD split A/B/C/D evenly; C owes 2250. D paid 1000 EUR for D/C → C owes 500 EUR.
  const balances = computeBalances({
    expenses: [
      {
        currency: "USD",
        totalMinor: 9000,
        payerId: "a",
        shares: [
          { memberId: "a", shareMinor: 2250 },
          { memberId: "b", shareMinor: 2250 },
          { memberId: "c", shareMinor: 2250 },
          { memberId: "d", shareMinor: 2250 },
        ],
      },
      {
        currency: "EUR",
        totalMinor: 1000,
        payerId: "d",
        shares: [
          { memberId: "c", shareMinor: 500 },
          { memberId: "d", shareMinor: 500 },
        ],
      },
    ],
  });
  const remaining = ["a", "b", "d"];

  const after = (entries: ReturnType<typeof planBalanceResolution>) =>
    computeBalances({
      expenses: [],
      adjustments: [
        ...entries,
        // re-add the original balances as an adjustment set so we can read the result
        ...Object.entries(balances).flatMap(([currency, row]) =>
          Object.entries(row).map(([memberId, deltaMinor]) => ({ memberId, currency, deltaMinor })),
        ),
      ],
    });

  it("lists open balances per currency", () => {
    expect(openBalancesFor(balances, "c")).toEqual([
      { currency: "EUR", balanceMinor: -500 },
      { currency: "USD", balanceMinor: -2250 },
    ]);
    expect(openBalancesFor(balances, "zzz")).toEqual([]);
  });

  it("reassign moves the whole balance to one person", () => {
    const e = planBalanceResolution(balances, "c", { kind: "reassign", toMemberId: "b" }, remaining);
    const r = after(e);
    expect(r.USD!.c).toBe(0);
    expect(r.EUR!.c).toBe(0);
    expect(r.USD!.b).toBe(-4500);
    expect(r.EUR!.b).toBe(-500);
  });

  it("split_group spreads evenly over the rest, exact to the cent", () => {
    const e = planBalanceResolution(balances, "c", { kind: "split_group" }, remaining);
    const r = after(e);
    expect(r.USD!.c).toBe(0);
    expect(r.USD!.a! + r.USD!.b! + r.USD!.d!).toBe(0);
    expect(r.USD).toEqual({ a: 6000, b: -3000, c: 0, d: -3000 }); // 2250 / 3 = 750 each
    expect(r.EUR!.a! + r.EUR!.b! + r.EUR!.d!).toBe(0);
  });

  it("write_off is absorbed by the people owed, proportionally", () => {
    const e = planBalanceResolution(balances, "c", { kind: "write_off" }, remaining);
    const r = after(e);
    expect(r.USD).toEqual({ a: 4500, b: -2250, c: 0, d: -2250 }); // only A was owed
    expect(r.EUR).toEqual({ c: 0, d: 0 }); // D forgives 500
  });

  it("each currency's entries sum to zero", () => {
    for (const kind of ["split_group", "write_off"] as const) {
      const e = planBalanceResolution(balances, "c", { kind }, remaining);
      for (const cur of ["USD", "EUR"]) {
        expect(e.filter((x) => x.currency === cur).reduce((s, x) => s + x.deltaMinor, 0)).toBe(0);
      }
    }
  });

  it("rejects a bad reassign target and an empty pool", () => {
    expect(() => planBalanceResolution(balances, "c", { kind: "reassign", toMemberId: "c" }, remaining)).toThrow(
      ResolutionError,
    );
    expect(() => planBalanceResolution(balances, "c", { kind: "reassign", toMemberId: "x" }, remaining)).toThrow(
      ResolutionError,
    );
    expect(() => planBalanceResolution(balances, "c", { kind: "split_group" }, [])).toThrow(ResolutionError);
  });

  it("no open balance → no entries", () => {
    expect(planBalanceResolution(balances, "nobody", { kind: "split_group" }, remaining)).toEqual([]);
  });
});

describe("size notices from history (FR-T4/T5)", () => {
  const t = (n: number) => Date.UTC(2026, 9, 1) + n * 1000;
  it("duo → group notifies the original two only", () => {
    const last = lastSizeTransition([
      { memberId: "a", at: t(0), active: true },
      { memberId: "b", at: t(1), active: true },
      { memberId: "c", at: t(2), active: true },
    ]);
    expect(last).toMatchObject({ from: "duo", to: "group", before: ["a", "b"] });
    expect(pendingSizeNotices(last, "group", "a", [])).toEqual(["duo_to_group"]);
    expect(pendingSizeNotices(last, "group", "c", [])).toEqual([]);
    expect(pendingSizeNotices(last, "group", "a", ["duo_to_group"])).toEqual([]);
  });
  it("group → duo notifies the remaining members", () => {
    const last = lastSizeTransition([
      { memberId: "a", at: t(0), active: true },
      { memberId: "b", at: t(1), active: true },
      { memberId: "c", at: t(2), active: true },
      { memberId: "c", at: t(3), active: false },
    ]);
    expect(last).toMatchObject({ from: "group", to: "duo" });
    expect(pendingSizeNotices(last, "duo", "b", [])).toEqual(["group_to_duo"]);
  });
  it("stale or irrelevant transitions show nothing", () => {
    const solo = lastSizeTransition([
      { memberId: "a", at: t(0), active: true },
      { memberId: "b", at: t(1), active: true },
    ]);
    expect(pendingSizeNotices(solo, "duo", "a", [])).toEqual([]); // FR-T3/T6 handled elsewhere
    expect(pendingSizeNotices(null, "group", "a", [])).toEqual([]);
    const last = lastSizeTransition([
      { memberId: "a", at: t(0), active: true },
      { memberId: "b", at: t(1), active: true },
      { memberId: "c", at: t(2), active: true },
    ]);
    expect(pendingSizeNotices(last, "duo", "a", [])).toEqual([]); // size moved on since
  });
});
