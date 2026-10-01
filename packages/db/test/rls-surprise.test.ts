/**
 * Surprise mode (FR-91, FR-T11, NFR-3): hidden items are invisible to hidden members, including
 * in counts, reveals, comments, polls, plan items, expenses and the audit log.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import { comments, ideas, members } from "../src/schema";
import { ideaReveals, pollResults, turnout } from "../src/reveals";
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
  vote,
  type Trip,
} from "./fixtures";

let db: Db;
let t: Trip<"owner" | "org" | "a" | "b" | "goh">;
let hiddenIdea: string;
let openIdea: string;
let hiddenPoll: string;
let hiddenExpense: string;

beforeAll(async () => {
  db = await freshDb();
  t = await seedTrip(db, {
    owner: { name: "Olivia", role: "owner" },
    org: { name: "Raj", role: "organizer" },
    a: { name: "Ana" },
    b: { name: "Ben" },
    goh: { name: "Gina", guestOfHonor: true },
  });
  openIdea = await seedIdea(db, t.tripId, { title: "Beach day" });
  // Organizer creates the surprise through RLS (not the service), proving the normal path works.
  const [row] = await as(db, t.m.org.full, (tx) =>
    tx.insert(ideas).values({ tripId: t.tripId, title: "Surprise yacht", hiddenFrom: [t.m.goh.memberId] }).returning(),
  );
  hiddenIdea = row!.id;
  await vote(db, t.m.a.full, hiddenIdea, t.m.a.memberId, "must");
  await vote(db, t.m.b.full, hiddenIdea, t.m.b.memberId, "pass");
  await vote(db, t.m.goh.full, openIdea, t.m.goh.memberId, "down");
  await query(db, t.m.a.full, sql`insert into comments (trip_id, idea_id, member_id, body)
    values (${t.tripId}, ${hiddenIdea}, ${t.m.a.memberId}, 'She will love it')`);

  hiddenPoll = randomUUID();
  await query(db, t.m.org.full, sql`insert into polls (id, trip_id, kind, question, hidden_from)
    values (${hiddenPoll}, ${t.tripId}, 'custom', 'Which yacht?', ${`{${t.m.goh.memberId}}`}::uuid[])`);
  await query(db, t.m.org.full, sql`insert into poll_options (poll_id, label) values (${hiddenPoll}, 'Big one')`);
  await query(db, t.m.org.full, sql`insert into plan_items (trip_id, stop_id, idea_id, day_index, hidden_from)
    values (${t.tripId}, ${t.stopId}, ${hiddenIdea}, 1, ${`{${t.m.goh.memberId}}`}::uuid[])`);
  const [exp] = await query<{ id: string }>(
    db,
    t.m.org.full,
    sql`insert into expenses (trip_id, merchant, currency, total_minor, paid_by_member_id, uploaded_by_member_id, hidden_from)
      values (${t.tripId}, 'Yacht Co', 'EUR', 120000, ${t.m.org.memberId}, ${t.m.org.memberId}, ${`{${t.m.goh.memberId}}`}::uuid[])
      returning id`,
  );
  hiddenExpense = exp!.id;
  await query(db, t.m.org.full, sql`insert into expense_shares (expense_id, member_id, share_minor) values
    (${hiddenExpense}, ${t.m.org.memberId}, 60000), (${hiddenExpense}, ${t.m.a.memberId}, 60000)`);
});

describe("hidden from the guest of honor", () => {
  it("ideas are invisible, including in counts", async () => {
    const rows = await as(db, t.m.goh.full, (tx) => tx.select({ id: ideas.id }).from(ideas));
    expect(rows.map((r) => r.id)).toEqual([openIdea]);
    expect(await query(db, t.m.goh.link, sql`select count(*)::int as n from ideas`)).toEqual([{ n: 1 }]);
    expect(await query(db, t.m.a.full, sql`select count(*)::int as n from ideas`)).toEqual([{ n: 2 }]);
  });

  it("reveals omit the hidden idea entirely", async () => {
    const r = await as(db, t.m.goh.full, (tx) => ideaReveals(tx, t.tripId));
    expect(r.map((x) => x.ideaId)).toEqual([openIdea]);
    const forAna = await as(db, t.m.a.full, (tx) => ideaReveals(tx, t.tripId));
    expect(forAna.map((x) => x.ideaId).sort()).toEqual([openIdea, hiddenIdea].sort());
  });

  it("the guest of honor cannot vote on, edit or discover the hidden idea", async () => {
    await expectDenied(vote(db, t.m.goh.full, hiddenIdea, t.m.goh.memberId, "must"), /idea not found/);
    const updated = await as(db, t.m.goh.full, (tx) =>
      tx.update(ideas).set({ title: "x" }).where(eq(ideas.id, hiddenIdea)).returning(),
    );
    expect(updated).toHaveLength(0);
    expect(await query(db, t.m.goh.full, sql`select * from idea_sources`)).toHaveLength(0);
  });

  it("comments on the hidden idea are invisible and inherit its surprise list", async () => {
    expect(await as(db, t.m.goh.full, (tx) => tx.select().from(comments))).toHaveLength(0);
    const [c] = await svc(db, (tx) => tx.select().from(comments).where(eq(comments.ideaId, hiddenIdea)));
    expect(c!.hiddenFrom).toEqual([t.m.goh.memberId]);
    await expectDenied(
      query(db, t.m.goh.full, sql`insert into comments (trip_id, idea_id, member_id, body)
        values (${t.tripId}, ${hiddenIdea}, ${t.m.goh.memberId}, 'what is this?')`),
      /not a member|row-level security/, // same error as for an idea that doesn't exist
    );
  });

  it("polls, options, results and plan items are invisible", async () => {
    expect(await query(db, t.m.goh.full, sql`select * from polls`)).toHaveLength(0);
    expect(await query(db, t.m.goh.full, sql`select * from poll_options`)).toHaveLength(0);
    expect(await as(db, t.m.goh.full, (tx) => pollResults(tx, hiddenPoll))).toEqual([]);
    expect(await query(db, t.m.goh.full, sql`select * from plan_items`)).toHaveLength(0);
    expect(await query(db, t.m.a.full, sql`select * from plan_items`)).toHaveLength(1);
  });

  it("expenses and their shares are invisible", async () => {
    expect(await query(db, t.m.goh.full, sql`select * from expenses`)).toHaveLength(0);
    expect(await query(db, t.m.goh.full, sql`select * from expense_shares`)).toHaveLength(0);
    expect(await query(db, t.m.a.full, sql`select * from expenses`)).toHaveLength(1);
  });

  it("a guest of honor who is also an organizer still can't see it, in turnout or the audit log", async () => {
    await svc(db, (tx) => tx.update(members).set({ role: "organizer" }).where(eq(members.id, t.m.goh.memberId)));
    try {
      const turn = await as(db, t.m.goh.full, (tx) => turnout(tx, t.tripId));
      expect(turn.map((x) => x.itemId)).toEqual([openIdea]);
      const audit = await query<{ entity_id: string }>(db, t.m.goh.full, sql`select entity_id from audit_log`);
      expect(audit.map((x) => x.entity_id)).not.toContain(hiddenExpense);
      const forOrg = await query<{ entity_id: string }>(db, t.m.org.full, sql`select entity_id from audit_log`);
      expect(forOrg.map((x) => x.entity_id)).toContain(hiddenExpense);
      // Can't edit or unhide what she can't see.
      const r = await as(db, t.m.goh.full, (tx) =>
        tx.update(ideas).set({ hiddenFrom: [] }).where(eq(ideas.id, hiddenIdea)).returning(),
      );
      expect(r).toHaveLength(0);
    } finally {
      await svc(db, (tx) => tx.update(members).set({ role: "member" }).where(eq(members.id, t.m.goh.memberId)));
    }
  });

  it("hidden members' votes are excluded from counts on items hidden from them", async () => {
    // Even if a service bug wrote one, a hidden member's vote never counts.
    await svc(db, (tx) =>
      q(tx, sql`insert into votes (idea_id, member_id, trip_id, value, cast_in_size)
        values (${hiddenIdea}, ${t.m.goh.memberId}, ${t.tripId}, 'pass', 'group')`),
    );
    const r = (await as(db, t.m.a.full, (tx) => ideaReveals(tx, t.tripId))).find((x) => x.ideaId === hiddenIdea)!;
    expect(r).toMatchObject({ mustCount: 1, passCount: 1, voterCount: 2 });
    await svc(db, (tx) => q(tx, sql`delete from votes where member_id = ${t.m.goh.memberId} and idea_id = ${hiddenIdea}`));
  });
});

describe("who can hide things", () => {
  it("only organizers may set or change hidden_from", async () => {
    await expectDenied(
      as(db, t.m.a.full, (tx) =>
        tx.insert(ideas).values({ tripId: t.tripId, title: "My surprise", hiddenFrom: [t.m.goh.memberId] }),
      ),
      /only organizers can hide/,
    );
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.update(ideas).set({ hiddenFrom: [t.m.goh.memberId] }).where(eq(ideas.id, openIdea))),
      /only organizers can hide/,
    );
    await expectDenied(
      as(db, t.m.a.full, (tx) => tx.update(ideas).set({ hiddenFrom: [] }).where(eq(ideas.id, hiddenIdea))),
      /only organizers can hide/,
    );
    await expectDenied(
      query(db, t.m.a.full, sql`insert into expenses (trip_id, merchant, currency, total_minor, paid_by_member_id, uploaded_by_member_id, hidden_from)
        values (${t.tripId}, 'x', 'EUR', 1, ${t.m.a.memberId}, ${t.m.a.memberId}, ${`{${t.m.goh.memberId}}`}::uuid[])`),
      /only organizers can hide/,
    );
  });

  it("an organizer cannot hide an item from themselves", async () => {
    await expectDenied(
      as(db, t.m.org.full, (tx) =>
        tx.insert(ideas).values({ tripId: t.tripId, title: "Oops", hiddenFrom: [t.m.org.memberId] }),
      ),
      RLS_DENIED,
    );
  });

  it("organizers can hide an existing idea, which also hides it from reveals", async () => {
    const id = await seedIdea(db, t.tripId, { title: "Cake" });
    await as(db, t.m.org.full, (tx) => tx.update(ideas).set({ hiddenFrom: [t.m.goh.memberId] }).where(eq(ideas.id, id)));
    const r = await as(db, t.m.goh.full, (tx) => ideaReveals(tx, t.tripId));
    expect(r.map((x) => x.ideaId)).not.toContain(id);
  });
});
