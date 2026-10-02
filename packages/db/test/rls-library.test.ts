/**
 * Idea library privacy (§6.12): libraries are private (FR-L25), shared boards expose only their
 * own items (FR-L14), board-link sessions view + add but don't manage, names never phones
 * (FR-L26), copies to trips stay separate (LB-4/LB-5), import counting (FR-L22, D62).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import {
  boardItems,
  boardMembers,
  boards,
  ideas,
  savedIdeaNotes,
  savedIdeas,
  savedIdeaTripSends,
} from "../src/schema";
import type { Claims } from "../src/session";
import { as, expectDenied, freshDb, q, query, RLS_DENIED, seedTrip, sql, svc, type Trip } from "./fixtures";

let db: Db;
// Sam owns a library and a shared board "Japan with Ana"; Ana is a verified board member;
// Kai is on the board through a board link only; Rex was removed; Ben shares a trip with Sam.
let t: Trip<"sam" | "ana" | "ben">;
const sam = () => t.m.sam;
let boardId: string;
let kai: { boardMemberId: string; claims: Claims };
let rexMemberId: string;
let rexUser: string;
let anaBoardMemberId: string;
let privateSave: string; // in Sam's library only
let boardSave: string; // Sam's, on the board
let anaOwnSave: string; // in Ana's library only

async function save(claims: Claims, title: string, extra: Partial<typeof savedIdeas.$inferInsert> = {}) {
  const [row] = await as(db, claims, (tx) =>
    tx.insert(savedIdeas).values({ title, userId: (claims as { sub?: string }).sub ?? null, ...extra }).returning(),
  );
  return row!.id;
}

beforeAll(async () => {
  db = await freshDb();
  t = await seedTrip(db, { sam: { name: "Sam", role: "owner" }, ana: { name: "Ana" }, ben: { name: "Ben" } });

  const [b] = await as(db, sam().full, (tx) => tx.insert(boards).values({ name: "Japan with Ana", ownerUserId: randomUUID() }).returning());
  boardId = b!.id;
  expect(b!.ownerUserId).toBe(sam().userId);

  const [anaBm] = await as(db, sam().full, (tx) =>
    tx.insert(boardMembers).values({ boardId, userId: t.m.ana.userId, displayName: "Ana" }).returning(),
  );
  anaBoardMemberId = anaBm!.id;
  const [kaiBm] = await as(db, sam().full, (tx) =>
    tx.insert(boardMembers).values({ boardId, displayName: "Kai" }).returning(),
  );
  kai = { boardMemberId: kaiBm!.id, claims: { board_link: kaiBm!.id } };
  rexUser = randomUUID();
  await svc(db, async (tx) => {
    await q(tx, sql`insert into users (id, phone, display_name) values (${rexUser}, '+12025559999', 'Rex')`);
    await q(tx, sql`insert into board_member_contacts (board_member_id, phone) values (${kai.boardMemberId}, '+12025558888')`);
  });
  const [rexBm] = await as(db, sam().full, (tx) =>
    tx.insert(boardMembers).values({ boardId, userId: rexUser, displayName: "Rex" }).returning(),
  );
  rexMemberId = rexBm!.id;

  privateSave = await save(sam().full, "Secret ramen spot", { country: "JP", regionOrCity: "Tokyo" });
  boardSave = await save(sam().full, "teamLab Planets", { country: "JP", regionOrCity: "Tokyo" });
  await as(db, sam().full, (tx) => tx.insert(boardItems).values({ boardId, savedIdeaId: boardSave }));
  await as(db, sam().full, (tx) =>
    tx.insert(savedIdeaNotes).values({ savedIdeaId: boardSave, userId: randomUUID(), note: "Honeymoon?", somedayPriority: "must" }),
  );
  anaOwnSave = await save(t.m.ana.full, "Ana's private bar");
});

const titles = async (claims: Claims) =>
  (await as(db, claims, (tx) => tx.select({ title: savedIdeas.title }).from(savedIdeas))).map((r) => r.title).sort();

describe("a library is private to its owner (FR-L25)", () => {
  it("the owner sees all of their saves", async () => {
    expect(await titles(sam().full)).toEqual(["Secret ramen spot", "teamLab Planets"]);
  });

  it("trip members never see another member's library, even with a trip link", async () => {
    expect(await titles(t.m.ben.full)).toEqual([]);
    expect(await titles(t.m.ben.link)).toEqual([]);
    expect(await titles(sam().link)).toEqual([]); // a trip link is not a library session
    expect(await query(db, t.m.ben.full, sql`select count(*)::int as n from saved_ideas`)).toEqual([{ n: 0 }]);
    expect(await query(db, t.m.ben.full, sql`select * from saved_idea_sources`)).toHaveLength(0);
  });

  it("nobody else can edit, delete or put someone's save on a board", async () => {
    expect(
      await as(db, t.m.ben.full, (tx) => tx.update(savedIdeas).set({ title: "x" }).where(eq(savedIdeas.id, privateSave)).returning()),
    ).toHaveLength(0);
    expect(await as(db, t.m.ana.full, (tx) => tx.delete(savedIdeas).where(eq(savedIdeas.id, boardSave)).returning())).toHaveLength(0);
    await expectDenied(
      as(db, t.m.ana.full, (tx) => tx.insert(boardItems).values({ boardId, savedIdeaId: privateSave })),
      RLS_DENIED,
    );
    await expectDenied(
      as(db, t.m.ben.full, (tx) => tx.insert(savedIdeas).values({ title: "planted", userId: sam().userId })),
      RLS_DENIED,
    );
  });

  it("ownership can't be moved", async () => {
    await expectDenied(
      as(db, sam().full, (tx) => tx.update(savedIdeas).set({ userId: t.m.ben.userId }).where(eq(savedIdeas.id, privateSave))),
      /read-only/,
    );
  });

  it("anonymous sessions get nothing", async () => {
    await expectDenied(query(db, {}, sql`select * from saved_ideas`), /permission denied/);
  });
});

describe("shared boards (FR-L14, FR-L26)", () => {
  it("board members see ONLY that board's saves", async () => {
    expect(await titles(t.m.ana.full)).toEqual(["Ana's private bar", "teamLab Planets"]);
    expect(await titles(kai.claims)).toEqual(["teamLab Planets"]);
  });

  it("the owner's note and someday priority stay private", async () => {
    expect(await as(db, t.m.ana.full, (tx) => tx.select().from(savedIdeaNotes))).toHaveLength(0);
    expect(await as(db, kai.claims, (tx) => tx.select().from(savedIdeaNotes))).toHaveLength(0);
    const [n] = await as(db, sam().full, (tx) => tx.select().from(savedIdeaNotes));
    expect(n).toMatchObject({ note: "Honeymoon?", somedayPriority: "must", userId: sam().userId });
    await expectDenied(
      as(db, t.m.ana.full, (tx) => tx.insert(savedIdeaNotes).values({ savedIdeaId: boardSave, userId: t.m.ana.userId!, note: "mine" })),
      RLS_DENIED,
    );
  });

  it("members see each other's names, never phones", async () => {
    const names = (await as(db, kai.claims, (tx) => tx.select({ n: boardMembers.displayName }).from(boardMembers)))
      .map((r) => r.n)
      .sort();
    expect(names).toEqual(["Ana", "Kai", "Rex", "Sam"]);
    await expectDenied(query(db, kai.claims, sql`select * from board_member_contacts`), /permission denied/);
    await expectDenied(query(db, sam().full, sql`select * from board_member_contacts`), /permission denied/);
    await expectDenied(query(db, sam().full, sql`select * from board_links`), /permission denied/);
    expect(await query(db, kai.claims, sql`select * from users`)).toHaveLength(0);
  });

  it("a verified member adds one of their own saves; it becomes visible to the board", async () => {
    await as(db, t.m.ana.full, (tx) => tx.insert(boardItems).values({ boardId, savedIdeaId: anaOwnSave }));
    expect(await titles(kai.claims)).toEqual(["Ana's private bar", "teamLab Planets"]);
    const [item] = await svc(db, (tx) => tx.select().from(boardItems).where(eq(boardItems.savedIdeaId, anaOwnSave)));
    expect(item!.addedByBoardMemberId).toBe(anaBoardMemberId);
    // Ana can't edit Sam's save even though she can see it.
    expect(
      await as(db, t.m.ana.full, (tx) => tx.update(savedIdeas).set({ title: "x" }).where(eq(savedIdeas.id, boardSave)).returning()),
    ).toHaveLength(0);
  });

  it("a board-link session can view and add, but not manage", async () => {
    const id = await save(kai.claims, "Kyoto tea house", { createdByBoardMemberId: kai.boardMemberId });
    await as(db, kai.claims, (tx) => tx.insert(boardItems).values({ boardId, savedIdeaId: id }));
    await as(db, kai.claims, (tx) =>
      q(tx, sql`insert into saved_idea_sources (saved_idea_id, kind, url) values (${id}, 'tiktok', 'https://tiktok.com/x')`),
    );
    expect(await titles(t.m.ana.full)).toContain("Kyoto tea house");
    // Sam sees it through his board, but it's a board-only save, not part of anyone's library.
    const [row] = await query<{ user_id: string | null; created_by_board_member_id: string }>(
      db,
      sam().full,
      sql`select user_id, created_by_board_member_id from saved_ideas where id = ${id}`,
    );
    expect(row).toEqual({ user_id: null, created_by_board_member_id: kai.boardMemberId });

    // Kai can't manage the board.
    expect(await as(db, kai.claims, (tx) => tx.update(boards).set({ name: "Mine" }).where(eq(boards.id, boardId)).returning())).toHaveLength(0);
    expect(await as(db, kai.claims, (tx) => tx.delete(boardItems).where(eq(boardItems.savedIdeaId, boardSave)).returning())).toHaveLength(0);
    expect(await as(db, kai.claims, (tx) => tx.delete(boardItems).where(eq(boardItems.savedIdeaId, id)).returning())).toHaveLength(0);
    await expectDenied(
      as(db, kai.claims, (tx) => tx.insert(boardMembers).values({ boardId, displayName: "Friend" })),
      RLS_DENIED,
    );
    expect(
      await as(db, kai.claims, (tx) =>
        tx.update(boardMembers).set({ status: "removed" }).where(eq(boardMembers.id, anaBoardMemberId)).returning(),
      ),
    ).toHaveLength(0);
    // Membership changes need a verified session, even for your own row.
    await expectDenied(
      as(db, kai.claims, (tx) => tx.update(boardMembers).set({ status: "removed" }).where(eq(boardMembers.id, kai.boardMemberId))),
      /only the board owner/,
    );
    await expectDenied(
      as(db, kai.claims, (tx) => tx.insert(boards).values({ name: "Kai's board", ownerUserId: randomUUID() })),
      RLS_DENIED,
    );
    // Kai can rename himself.
    await as(db, kai.claims, (tx) => tx.update(boardMembers).set({ displayName: "Kai K" }).where(eq(boardMembers.id, kai.boardMemberId)));
    // A board link grants nothing on trips.
    expect(await query(db, kai.claims, sql`select * from ideas`)).toHaveLength(0);
    expect(await query(db, kai.claims, sql`select * from trips`)).toHaveLength(0);
  });

  it("a board-link session can't spoof a board-only save for someone else", async () => {
    await expectDenied(
      as(db, kai.claims, (tx) => tx.insert(savedIdeas).values({ title: "x", createdByBoardMemberId: anaBoardMemberId })),
      RLS_DENIED,
    );
    await expectDenied(
      as(db, kai.claims, (tx) => tx.insert(savedIdeas).values({ title: "x", userId: sam().userId })),
      RLS_DENIED,
    );
  });

  it("only the owner manages; the owner can't be removed; roles are fixed", async () => {
    await as(db, sam().full, (tx) => tx.update(boards).set({ name: "Japan 2027" }).where(eq(boards.id, boardId)));
    const [ownerRow] = await svc(db, (tx) =>
      tx.select().from(boardMembers).where(eq(boardMembers.userId, sam().userId!)),
    );
    expect(ownerRow).toMatchObject({ role: "owner", displayName: "Sam" });
    await expectDenied(
      as(db, sam().full, (tx) => tx.update(boardMembers).set({ status: "removed" }).where(eq(boardMembers.id, ownerRow!.id))),
      /owner cannot be removed/,
    );
    await expectDenied(
      as(db, sam().full, (tx) => tx.insert(boardMembers).values({ boardId, displayName: "Boss", role: "owner" })),
      /owner is set/,
    );
    await expectDenied(
      as(db, t.m.ana.full, (tx) => tx.update(boards).set({ name: "x" }).where(eq(boards.id, boardId)).returning()).then((r) => {
        if (r.length === 0) throw new Error("permission denied: filtered");
      }),
      /permission denied/,
    );
  });

  it("a removed member loses access immediately; items they added stay (LB-6)", async () => {
    const rexSave = await save({ sub: rexUser }, "Rex's onsen");
    await as(db, { sub: rexUser }, (tx) => tx.insert(boardItems).values({ boardId, savedIdeaId: rexSave }));
    expect(await titles({ sub: rexUser })).toContain("teamLab Planets");

    await as(db, sam().full, (tx) => tx.update(boardMembers).set({ status: "removed" }).where(eq(boardMembers.id, rexMemberId)));
    expect(await titles({ sub: rexUser })).toEqual(["Rex's onsen"]); // only his own library
    expect(await as(db, { sub: rexUser }, (tx) => tx.select().from(boards))).toHaveLength(0);
    expect(await as(db, { sub: rexUser }, (tx) => tx.select().from(boardMembers))).toHaveLength(0);
    await expectDenied(
      as(db, { sub: rexUser }, (tx) => tx.insert(boardItems).values({ boardId, savedIdeaId: rexSave })),
      RLS_DENIED,
    );
    expect(await titles(t.m.ana.full)).toContain("Rex's onsen");
  });

  it("a member can leave on their own (verified)", async () => {
    await as(db, t.m.ana.full, (tx) =>
      tx.update(boardMembers).set({ status: "removed" }).where(eq(boardMembers.id, anaBoardMemberId)),
    );
    expect(await titles(t.m.ana.full)).toEqual(["Ana's private bar"]);
    await svc(db, (tx) => tx.update(boardMembers).set({ status: "active" }).where(eq(boardMembers.id, anaBoardMemberId)));
  });

  it("deleting a board removes board-only saves but never anyone's library", async () => {
    const [b2] = await as(db, sam().full, (tx) => tx.insert(boards).values({ name: "Temp", ownerUserId: sam().userId! }).returning());
    const [kaiBm] = await as(db, sam().full, (tx) => tx.insert(boardMembers).values({ boardId: b2!.id, displayName: "Kai2" }).returning());
    const orphan = await save({ board_link: kaiBm!.id }, "Board-only", { createdByBoardMemberId: kaiBm!.id });
    await as(db, { board_link: kaiBm!.id }, (tx) => tx.insert(boardItems).values({ boardId: b2!.id, savedIdeaId: orphan }));
    await as(db, sam().full, (tx) => tx.insert(boardItems).values({ boardId: b2!.id, savedIdeaId: privateSave }));
    await as(db, sam().full, (tx) => tx.delete(boards).where(eq(boards.id, b2!.id)));
    const left = await svc(db, (tx) => q<{ id: string }>(tx, sql`select id from saved_ideas where id in (${orphan}, ${privateSave})`));
    expect(left.map((r) => r.id)).toEqual([privateSave]);
  });
});

describe("sending saves to a trip copies them (FR-L12, LB-4, LB-5)", () => {
  it("the trip gets a normal idea; the library stays private; deleting the save keeps the idea", async () => {
    const save1 = await save(sam().full, "Ichiran");
    const [idea] = await as(db, sam().full, (tx) =>
      tx.insert(ideas).values({ tripId: t.tripId, title: "Ichiran", sourceSavedIdeaId: save1 }).returning(),
    );
    await as(db, sam().full, (tx) =>
      tx.insert(savedIdeaTripSends).values({ savedIdeaId: save1, tripId: t.tripId, ideaId: idea!.id, sentByUserId: randomUUID() }),
    );
    expect(await as(db, t.m.ben.full, (tx) => tx.select().from(ideas).where(eq(ideas.id, idea!.id)))).toHaveLength(1);
    expect(await as(db, t.m.ben.full, (tx) => tx.select().from(savedIdeaTripSends))).toHaveLength(0);
    expect(await titles(t.m.ben.full)).toEqual([]);
    const [send] = await as(db, sam().full, (tx) => tx.select().from(savedIdeaTripSends));
    expect(send!.sentByUserId).toBe(sam().userId);

    await as(db, sam().full, (tx) => tx.delete(savedIdeas).where(eq(savedIdeas.id, save1)));
    const [after] = await svc(db, (tx) => tx.select().from(ideas).where(eq(ideas.id, idea!.id)));
    expect(after).toMatchObject({ title: "Ichiran", sourceSavedIdeaId: null });
  });

  it("an idea can't point at someone else's save, and sends need trip membership", async () => {
    await expectDenied(
      as(db, t.m.ben.full, (tx) => tx.insert(ideas).values({ tripId: t.tripId, title: "x", sourceSavedIdeaId: privateSave })),
      /saved idea not found/,
    );
    const other = await seedTrip(db, { x: { name: "Xena", role: "owner" } });
    const [foreignIdea] = await svc(db, (tx) => tx.insert(ideas).values({ tripId: other.tripId, title: "x" }).returning());
    await expectDenied(
      as(db, sam().full, (tx) =>
        tx.insert(savedIdeaTripSends).values({ savedIdeaId: privateSave, tripId: other.tripId, ideaId: foreignIdea!.id, sentByUserId: sam().userId! }),
      ),
      RLS_DENIED,
    );
  });
});

describe("AI import log (FR-L20–L24, D62)", () => {
  it("every new extraction counts in any context; cache hits, failures and text don't; clients can't write", async () => {
    const [idea] = await svc(db, (tx) => tx.insert(ideas).values({ tripId: t.tripId, title: "queued", extraction: "queued" }).returning());
    await svc(db, (tx) =>
      q(tx, sql`insert into ai_imports (user_id, trip_id, idea_id, kind, counted) values
        (${t.m.ben.userId}, ${t.tripId}, ${idea!.id}, 'extraction', false),
        (${t.m.ben.userId}, null, null, 'extraction', false),
        (${t.m.ben.userId}, ${t.tripId}, null, 'cache_hit', true),
        (${t.m.ben.userId}, null, null, 'failed', true),
        (${t.m.ben.userId}, null, null, 'text', true)`),
    );
    const rows = await query<{ kind: string; counted: boolean }>(
      db,
      t.m.ben.full,
      sql`select kind, counted from ai_imports order by created_at, kind`,
    );
    expect(rows.filter((r) => r.counted).map((r) => r.kind)).toEqual(["extraction", "extraction"]);
    expect(rows).toHaveLength(5);
    expect(await query(db, sam().full, sql`select * from ai_imports`)).toHaveLength(0);
    await expectDenied(
      query(db, t.m.ben.full, sql`insert into ai_imports (user_id, kind) values (${t.m.ben.userId}, 'text')`),
      /permission denied/,
    );
  });

  it("users can read but not change their plan", async () => {
    const [u] = await query<{ plan: string }>(db, t.m.ben.full, sql`select plan from users`);
    expect(u!.plan).toBe("free");
    await expectDenied(query(db, t.m.ben.full, sql`update users set plan = 'premium'`), /permission denied/);
  });
});

describe("migration bookkeeping", () => {
  it("records every migration file, in order", async () => {
    const files = await svc(db, (tx) => q<{ file: string }>(tx, sql`select file from _wandr_migrations order by file`));
    expect(files.map((f) => f.file)).toEqual([
      "0000_init.sql",
      "0001_budget_open_to.sql",
      "0001_rls.sql",
      "0002_idea_library.sql",
      "0003_library_rls.sql",
      "0004_share_cards.sql",
    ]);
  });
});
