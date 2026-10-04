/**
 * Access control: roles, grants, phones (NFR-3), membership visibility, pending members (J-7),
 * personal-link scope (FR-5), owner protection (FR-2), idea status (FR-49).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import { ideas, members, trips, users } from "../src/schema";
import { transferOwnership, tripPublic, tripSize } from "../src/reveals";
import {
  as,
  expectDenied,
  freshDb,
  q,
  query,
  RLS_DENIED,
  seedIdea,
  seedTrip,
  sql,
  svc,
  type Trip,
} from "./fixtures";

type K = "owner" | "org" | "a" | "b" | "goh" | "pending" | "removed" | "invited" | "dropped";
let db: Db;
let t: Trip<K>;
let other: Trip<"x">;

beforeAll(async () => {
  db = await freshDb();
  t = await seedTrip(
    db,
    {
      owner: { name: "Olivia", role: "owner" },
      org: { name: "Raj", role: "organizer" },
      a: { name: "Ana" },
      b: { name: "Ben" },
      goh: { name: "Gina", guestOfHonor: true },
      pending: { name: "Pat", status: "pending" },
      removed: { name: "Rex", status: "removed" },
      invited: { name: "Ivy", status: "invited", verified: false },
      dropped: { name: "Dot", status: "not_attending" },
    },
    { name: "Gina's surprise bach", outsiderName: "Summer trip" },
  );
  other = await seedTrip(db, { x: { name: "Xavier", role: "owner" } }, { name: "Other trip" });
});

describe("database setup", () => {
  it("enables RLS on every public table", async () => {
    const rows = await svc(db, (tx) =>
      q<{ relname: string }>(tx, sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`),
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("grants nothing on service-only tables to clients", async () => {
    const serviceOnly = [
      "member_contacts",
      "member_links",
      "otp_requests",
      "outbound_messages",
      "sms_open_questions",
      "sms_undo",
      "extraction_cache",
      "events",
    ];
    for (const table of serviceOnly) {
      await expectDenied(query(db, t.m.org.full, sql.raw(`select * from public.${table}`)), /permission denied/);
      await expectDenied(query(db, t.m.a.link, sql.raw(`select * from public.${table}`)), /permission denied/);
    }
  });

  it("anon sessions can read nothing", async () => {
    for (const table of ["trips", "members", "ideas", "votes", "expenses", "users"]) {
      await expectDenied(query(db, {}, sql.raw(`select * from public.${table}`)), /permission denied/);
    }
  });

  it("keeps trips.size in sync with active members (FR-T1)", async () => {
    const [row] = await svc(db, (tx) => tx.select({ size: trips.size }).from(trips).where(eq(trips.id, t.tripId)));
    expect(row!.size).toBe("group");
    expect(await as(db, t.m.a.link, (tx) => tripSize(tx, t.tripId))).toBe("group");
    expect(await as(db, t.m.a.full, (tx) => tripSize(tx, other.tripId))).toBeNull();
  });
});

describe("phone numbers (NFR-3, P-6)", () => {
  it("member_contacts is unreadable by every member, organizers included", async () => {
    for (const who of [t.m.owner.full, t.m.org.full, t.m.a.full, t.m.a.link]) {
      await expectDenied(query(db, who, sql`select phone from member_contacts`), /permission denied/);
    }
  });

  it("users: each person sees only their own row (and phone)", async () => {
    const rows = await as(db, t.m.a.full, (tx) => tx.select().from(users));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone).toBe(t.m.a.phone);
    expect(await as(db, t.m.a.link, (tx) => tx.select().from(users))).toHaveLength(0);
  });

  it("a user can rename themselves but not change their phone", async () => {
    await as(db, t.m.a.full, (tx) => tx.update(users).set({ displayName: "Ana B" }).where(eq(users.id, t.m.a.userId!)));
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.update(users).set({ phone: "+15555550000" }).where(eq(users.id, t.m.a.userId!))),
      /permission denied/,
    );
    const changed = await as(db, t.m.a.full, (tx) =>
      tx.update(users).set({ displayName: "hacked" }).where(eq(users.id, t.m.b.userId!)).returning(),
    );
    expect(changed).toHaveLength(0);
  });
});

describe("trips and members visibility", () => {
  it("members can read their trip but not other trips", async () => {
    const rows = await as(db, t.m.a.full, (tx) => tx.select().from(trips));
    expect(rows.map((r) => r.id)).toEqual([t.tripId]);
  });

  it("removed and pending people cannot read the trip", async () => {
    expect(await as(db, t.m.removed.full, (tx) => tx.select().from(trips))).toHaveLength(0);
    expect(await as(db, t.m.pending.full, (tx) => tx.select().from(trips))).toHaveLength(0);
    expect(await as(db, t.m.removed.full, (tx) => tx.select().from(ideas))).toHaveLength(0);
  });

  it("pending members see only the outsider name and owner via trip_public (J-7)", async () => {
    const pub = await as(db, t.m.pending.full, (tx) => tripPublic(tx, t.tripId));
    expect(pub).toEqual({ tripId: t.tripId, displayName: "Summer trip", ownerName: "Olivia" });
    const mine = await as(db, t.m.pending.full, (tx) => tx.select().from(members));
    expect(mine.map((r) => r.id)).toEqual([t.m.pending.memberId]);
    expect(await as(db, t.m.a.full, (tx) => tripPublic(tx, t.tripId))).toMatchObject({
      displayName: "Gina's surprise bach",
    });
    expect(await as(db, t.m.removed.full, (tx) => tripPublic(tx, t.tripId))).toBeNull();
    expect(await as(db, other.m.x.full, (tx) => tripPublic(tx, t.tripId))).toBeNull();
  });

  it("members see active, not-attending and former members; pending/invited only for organizers", async () => {
    const names = async (claims: Parameters<typeof as>[1]) =>
      (await as(db, claims, (tx) => tx.select({ n: members.displayName }).from(members))).map((r) => r.n).sort();
    const everyone = ["Ana", "Ben", "Dot", "Gina", "Olivia", "Raj", "Rex"];
    expect(await names(t.m.a.full)).toEqual(everyone);
    expect(await names(t.m.a.link)).toEqual(everyone);
    expect(await names(t.m.org.full)).toEqual([...everyone, "Ivy", "Pat"].sort());
    expect(await names(t.m.owner.full)).toEqual([...everyone, "Ivy", "Pat"].sort());
    // Organizer powers need a verified session (FR-5).
    expect(await names(t.m.org.link)).toEqual(everyone);
  });
});

describe("personal-link scope (FR-5)", () => {
  it("can view ideas but not insert or edit them", async () => {
    const ideaId = await seedIdea(db, t.tripId, { title: "Tram 28" });
    const seen = await as(db, t.m.a.link, (tx) => tx.select().from(ideas).where(eq(ideas.id, ideaId)));
    expect(seen).toHaveLength(1);
    await expectDenied(
      as(db, t.m.a.link, (tx) => tx.insert(ideas).values({ tripId: t.tripId, title: "Link idea" })),
      RLS_DENIED,
    );
    const edited = await as(db, t.m.a.link, (tx) =>
      tx.update(ideas).set({ title: "renamed" }).where(eq(ideas.id, ideaId)).returning(),
    );
    expect(edited).toHaveLength(0);
  });

  it("cannot comment, read money or budgets, or change settings", async () => {
    await expectDenied(
      query(db, t.m.a.link, sql`insert into comments (trip_id, member_id, body) values (${t.tripId}, ${t.m.a.memberId}, 'hi')`),
      RLS_DENIED,
    );
    expect(await query(db, t.m.a.link, sql`select * from expenses`)).toHaveLength(0);
    expect(await query(db, t.m.a.link, sql`select * from payments`)).toHaveLength(0);
    expect(await query(db, t.m.a.link, sql`select * from budget_answers`)).toHaveLength(0);
    expect(await query(db, t.m.a.link, sql`select * from app.budget_view(${t.tripId})`)).toHaveLength(0);
    await expectDenied(
      query(db, t.m.a.link, sql`insert into expenses (trip_id, merchant, currency, total_minor, paid_by_member_id, uploaded_by_member_id)
        values (${t.tripId}, 'Bar', 'EUR', 1000, ${t.m.a.memberId}, ${t.m.a.memberId})`),
      RLS_DENIED,
    );
    const updated = await query(
      db,
      t.m.org.link,
      sql`update trips set invite_list_only = true where id = ${t.tripId} returning id`,
    );
    expect(updated).toHaveLength(0);
  });

  it("a link for a removed member grants nothing (M-12)", async () => {
    expect(await as(db, t.m.removed.link, (tx) => tx.select().from(ideas))).toHaveLength(0);
    expect(await as(db, t.m.removed.link, (tx) => tx.select().from(members))).toHaveLength(1); // own row only
  });
});

describe("roles and membership (FR-2, FR-9, FR-11)", () => {
  it("only organizers update trip settings; protected columns are not grantable", async () => {
    expect(await query(db, t.m.a.full, sql`update trips set pace = 'packed' where id = ${t.tripId} returning id`)).toHaveLength(0);
    expect(await query(db, t.m.org.full, sql`update trips set pace = 'packed' where id = ${t.tripId} returning id`)).toHaveLength(1);
    await expectDenied(
      query(db, t.m.org.full, sql`update trips set size = 'solo' where id = ${t.tripId}`),
      /permission denied/,
    );
    await expectDenied(
      query(db, t.m.org.full, sql`update trips set group_link_hash = 'x' where id = ${t.tripId}`),
      /permission denied/,
    );
  });

  it("a member can rename themselves and mark notices seen, but not change their role", async () => {
    await as(db, t.m.a.link, (tx) =>
      tx.update(members).set({ noticesSeen: ["duo_votes_visible"] }).where(eq(members.id, t.m.a.memberId)),
    );
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.update(members).set({ role: "organizer" }).where(eq(members.id, t.m.a.memberId))),
      /only organizers/,
    );
    const other = await as(db, t.m.a.full, (tx) =>
      tx.update(members).set({ displayName: "x" }).where(eq(members.id, t.m.b.memberId)).returning(),
    );
    expect(other).toHaveLength(0);
  });

  it("nobody can remove or demote the owner; organizers can remove members", async () => {
    await expectDenied(
      as(db, t.m.org.full, (tx) => tx.update(members).set({ status: "removed" }).where(eq(members.id, t.m.owner.memberId))),
      /owner cannot be removed/,
    );
    await expectDenied(
      as(db, t.m.owner.full, (tx) => tx.update(members).set({ role: "member" }).where(eq(members.id, t.m.owner.memberId))),
      /owner cannot be removed or demoted/,
    );
    await expectDenied(
      as(db, t.m.org.full, (tx) => tx.update(members).set({ role: "owner" }).where(eq(members.id, t.m.org.memberId))),
      /transfer_ownership/,
    );
    // Organizer removes Ben, then the service restores him.
    await as(db, t.m.org.full, (tx) =>
      tx.update(members).set({ status: "removed" }).where(eq(members.id, t.m.b.memberId)),
    );
    expect(await as(db, t.m.b.full, (tx) => tx.select().from(ideas))).toHaveLength(0);
    const audit = await query(db, t.m.org.full, sql`select action, entity from audit_log where entity_id = ${t.m.b.memberId}`);
    expect(audit).toEqual([{ action: "update", entity: "member" }]);
    expect(await query(db, t.m.a.full, sql`select * from audit_log`)).toHaveLength(0);
    await svc(db, (tx) => tx.update(members).set({ status: "active" }).where(eq(members.id, t.m.b.memberId)));
  });

  it("identity fields are read-only even for organizers", async () => {
    await expectDenied(
      query(db, t.m.org.full, sql`update members set user_id = ${t.m.org.userId} where id = ${t.m.invited.memberId}`),
      /permission denied/,
    );
  });

  it("organizers invite people; any verified member adds a managed member (FR-11)", async () => {
    await as(db, t.m.org.full, (tx) =>
      tx.insert(members).values({ tripId: t.tripId, displayName: "Newbie", status: "invited" }),
    );
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.insert(members).values({ tripId: t.tripId, displayName: "Sneaky", status: "invited" })),
      RLS_DENIED,
    );
    await expectDenied(
      as(db, t.m.org.full, (tx) => tx.insert(members).values({ tripId: t.tripId, displayName: "Boss", status: "invited", role: "owner" })),
      /FR-2/,
    );
    const kid = randomUUID();
    await as(db, t.m.a.full, (tx) =>
      tx.insert(members).values({
        id: kid,
        tripId: t.tripId,
        displayName: "Kid",
        status: "active",
        managedByMemberId: t.m.a.memberId,
      }),
    );
    await expectDenied(
      as(db, t.m.a.link, (tx) =>
        tx.insert(members).values({ tripId: t.tripId, displayName: "Kid2", status: "active", managedByMemberId: t.m.a.memberId }),
      ),
      RLS_DENIED,
    );
    // Ana votes for the kid; Ben can't.
    const ideaId = await seedIdea(db, t.tripId);
    await as(db, t.m.a.full, (tx) =>
      q(tx, sql`insert into votes (idea_id, member_id, trip_id, value, cast_in_size) values (${ideaId}, ${kid}, ${t.tripId}, 'must', 'group')`),
    );
    await expectDenied(
      as(db, t.m.b.full, (tx) =>
        q(tx, sql`update votes set value = 'pass' where member_id = ${kid} returning 1`).then((r) => {
          if (r.length === 0) throw new Error("permission denied: no rows");
        }),
      ),
      /permission denied/,
    );
    // Managed members count toward size; remove the kid again.
    await svc(db, (tx) => tx.update(members).set({ status: "removed" }).where(eq(members.id, kid)));
  });

  it("ownership moves only through transfer_ownership (FR-2)", async () => {
    await expectDenied(as(db, t.m.org.full, (tx) => transferOwnership(tx, t.tripId, t.m.org.memberId)), /only the owner/);
    await expectDenied(as(db, t.m.owner.link, (tx) => transferOwnership(tx, t.tripId, t.m.org.memberId)), /only the owner/);
    await expectDenied(
      as(db, t.m.owner.full, (tx) => transferOwnership(tx, t.tripId, t.m.invited.memberId)),
      /active verified member/,
    );
    await as(db, t.m.owner.full, (tx) => transferOwnership(tx, t.tripId, t.m.org.memberId));
    const roles = await svc(db, (tx) =>
      q<{ id: string; role: string }>(tx, sql`select id, role from members where id in (${t.m.owner.memberId}, ${t.m.org.memberId})`),
    );
    expect(Object.fromEntries(roles.map((r) => [r.id, r.role]))).toEqual({
      [t.m.owner.memberId]: "organizer",
      [t.m.org.memberId]: "owner",
    });
    await as(db, t.m.org.full, (tx) => transferOwnership(tx, t.tripId, t.m.owner.memberId));
  });
});

describe("ideas (FR-23, FR-49)", () => {
  it("any verified member edits details; only organizers change status", async () => {
    const ideaId = await seedIdea(db, t.tripId, { title: "LX Factory" });
    await as(db, t.m.a.full, (tx) => tx.update(ideas).set({ summary: "Sunday market" }).where(eq(ideas.id, ideaId)));
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.update(ideas).set({ status: "planned" }).where(eq(ideas.id, ideaId))),
      /only organizers can change an idea's status/,
    );
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.insert(ideas).values({ tripId: t.tripId, title: "x", status: "shortlisted" })),
      /FR-49/,
    );
    await as(db, t.m.org.full, (tx) => tx.update(ideas).set({ status: "shortlisted" }).where(eq(ideas.id, ideaId)));
    const [row] = await svc(db, (tx) => tx.select().from(ideas).where(eq(ideas.id, ideaId)));
    expect(row).toMatchObject({ status: "shortlisted", summary: "Sunday market" });
  });

  it("insert forces the creator to the caller and blocks other trips", async () => {
    const [row] = await as(db, t.m.a.full, (tx) =>
      tx.insert(ideas).values({ tripId: t.tripId, title: "Mine", createdByMemberId: t.m.b.memberId }).returning(),
    );
    expect(row!.createdByMemberId).toBe(t.m.a.memberId);
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.insert(ideas).values({ tripId: other.tripId, title: "Intruder" })),
      RLS_DENIED,
    );
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.update(ideas).set({ tripId: other.tripId }).where(eq(ideas.id, row!.id))),
      /read-only|row-level security/,
    );
  });

  it("only organizers delete ideas", async () => {
    const ideaId = await seedIdea(db, t.tripId);
    expect(await as(db, t.m.a.full, (tx) => tx.delete(ideas).where(eq(ideas.id, ideaId)).returning())).toHaveLength(0);
    expect(await as(db, t.m.org.full, (tx) => tx.delete(ideas).where(eq(ideas.id, ideaId)).returning())).toHaveLength(1);
  });

  it("stops and stages are organizer-written, member-read; members set their own attendance (FR-S7)", async () => {
    await expectDenied(query(db, t.m.a.full, sql`insert into stops (trip_id, name) values (${t.tripId}, 'Porto')`), RLS_DENIED);
    const [porto] = await query<{ id: string }>(
      db,
      t.m.org.full,
      sql`insert into stops (trip_id, name) values (${t.tripId}, 'Porto') returning id`,
    );
    expect(await query(db, t.m.a.link, sql`select * from stops where id = ${porto!.id}`)).toHaveLength(1);
    await query(db, t.m.a.full, sql`insert into stop_attendance (stop_id, member_id, attending) values (${porto!.id}, ${t.m.a.memberId}, false)`);
    await expectDenied(
      query(db, t.m.a.full, sql`insert into stop_attendance (stop_id, member_id, attending) values (${porto!.id}, ${t.m.b.memberId}, false)`),
      RLS_DENIED,
    );
    await expectDenied(
      query(db, t.m.b.link, sql`insert into stop_attendance (stop_id, member_id, attending) values (${porto!.id}, ${t.m.b.memberId}, false)`),
      RLS_DENIED,
    );
    await query(db, t.m.org.full, sql`insert into trip_stages (trip_id, stage, status) values (${t.tripId}, 'where', 'set')`);
    await expectDenied(
      query(db, t.m.a.full, sql`insert into trip_stages (trip_id, stage) values (${t.tripId}, 'when')`),
      RLS_DENIED,
    );
  });
});
