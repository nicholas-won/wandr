/**
 * Voting privacy: blind voting (FR-41), Pass anonymity and non-voters (FR-42), change counts
 * (FR-43), duo openness (§6.10), size changes (FR-T3/T4/T5), Stop attendance (FR-S7, FR-44),
 * organizer turnout and polls (FR-47/48).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import { ideaReveals, pollResults, turnout, type IdeaReveal } from "../src/reveals";
import {
  addActiveMember,
  as,
  expectDenied,
  freshDb,
  q,
  query,
  RLS_DENIED,
  seedIdea,
  seedTrip,
  setStatus,
  sql,
  svc,
  vote,
  type Actor,
} from "./fixtures";
import type { Claims } from "../src/session";

let db: Db;
beforeAll(async () => {
  db = await freshDb();
});

async function reveal(claims: Claims, tripId: string, ideaId: string): Promise<IdeaReveal> {
  const rows = await as(db, claims, (tx) => ideaReveals(tx, tripId));
  const r = rows.find((x) => x.ideaId === ideaId);
  if (!r) throw new Error("idea not in reveal");
  return r;
}
const names = (r: IdeaReveal) => (r.voters ?? []).map((v) => `${v.display_name}:${v.value}`).sort();

describe("group trip: blind voting and Pass anonymity (FR-41/42)", () => {
  let tripId: string;
  let m: Record<"o" | "a" | "b" | "c" | "d", Actor>;
  let ideaId: string;

  beforeAll(async () => {
    ({ tripId, m } = await seedTrip(db, {
      o: { name: "Olivia", role: "owner" },
      a: { name: "Ana" },
      b: { name: "Ben" },
      c: { name: "Cat" },
      d: { name: "Dev" },
    }));
    ideaId = await seedIdea(db, tripId, { title: "Time Out Market" });
    await vote(db, m.a.link, ideaId, m.a.memberId, "must");
    await vote(db, m.b.full, ideaId, m.b.memberId, "pass");
    await vote(db, m.c.full, ideaId, m.c.memberId, "down");
  });

  it("is blind until you vote: no counts, no names", async () => {
    const r = await reveal(m.d.full, tripId, ideaId);
    expect(r).toEqual({
      ideaId,
      viewerVoted: false,
      mustCount: null,
      downCount: null,
      passCount: null,
      voterCount: null,
      voters: null,
    });
  });

  it("after voting: Must-do/Down names, Pass only as a count", async () => {
    const r = await reveal(m.a.full, tripId, ideaId);
    expect(r).toMatchObject({ viewerVoted: true, mustCount: 1, downCount: 1, passCount: 1, voterCount: 3 });
    expect(names(r)).toEqual(["Ana:must", "Cat:down"]);
  });

  it("the Pass voter sees their own Pass, nobody else does", async () => {
    expect(names(await reveal(m.b.full, tripId, ideaId))).toEqual(["Ana:must", "Ben:pass", "Cat:down"]);
    expect(names(await reveal(m.c.link, tripId, ideaId))).toEqual(["Ana:must", "Cat:down"]);
  });

  it("organizers (owner) get no names for Pass either, even after voting", async () => {
    await vote(db, m.o.full, ideaId, m.o.memberId, "down");
    const r = await reveal(m.o.full, tripId, ideaId);
    expect(names(r)).toEqual(["Ana:must", "Cat:down", "Olivia:down"]);
    expect(r.passCount).toBe(1);
  });

  it("non-voters never appear anywhere (Dev has not voted)", async () => {
    const r = await reveal(m.a.full, tripId, ideaId);
    expect(JSON.stringify(r)).not.toContain(m.d.memberId);
    expect(JSON.stringify(r)).not.toContain("Dev");
  });

  it("raw vote rows are readable only by their owner", async () => {
    for (const who of [m.a, m.b, m.c, m.o]) {
      const rows = await query<{ member_id: string }>(db, who.full, sql`select member_id from votes`);
      expect(rows.map((r) => r.member_id)).toEqual([who.memberId]);
    }
    expect(await query(db, m.d.full, sql`select * from votes`)).toHaveLength(0);
    expect(await query(db, m.a.full, sql`select count(*)::int as n from votes where value = 'pass'`)).toEqual([{ n: 0 }]);
  });

  it("you can only vote as yourself", async () => {
    await expectDenied(vote(db, m.d.full, ideaId, m.b.memberId, "must"), RLS_DENIED);
    await expectDenied(vote(db, m.d.link, ideaId, m.a.memberId, "pass"), RLS_DENIED);
    const changed = await query(db, m.d.full, sql`update votes set value = 'must' where member_id = ${m.b.memberId} returning 1`);
    expect(changed).toHaveLength(0);
  });

  it("server-owned vote fields cannot be spoofed (FR-43, FR-T4/T5)", async () => {
    const spoof = randomUUID();
    await as(db, m.d.link, (tx) =>
      q(tx, sql`insert into votes (idea_id, member_id, trip_id, value, cast_in_size, open_to, change_count, created_at)
        values (${ideaId}, ${m.d.memberId}, ${spoof}, 'pass', 'duo', ${`{${m.a.memberId}}`}::uuid[], 99, '2000-01-01')`),
    );
    const [row] = await query<Record<string, unknown>>(db, m.d.link, sql`select * from votes where member_id = ${m.d.memberId}`);
    expect(row).toMatchObject({ trip_id: tripId, cast_in_size: "group", open_to: [], change_count: 0 });
    expect(new Date(row!.created_at as string).getFullYear()).toBeGreaterThan(2000);

    await as(db, m.d.link, (tx) =>
      q(tx, sql`update votes set value = 'must', change_count = 0, cast_in_size = 'duo', open_to = ${`{${m.a.memberId}}`}::uuid[]
        where member_id = ${m.d.memberId}`),
    );
    await as(db, m.d.link, (tx) => q(tx, sql`update votes set value = 'down' where member_id = ${m.d.memberId}`));
    await as(db, m.d.link, (tx) => q(tx, sql`update votes set not_my_pick = true where member_id = ${m.d.memberId}`));
    const [after] = await query<Record<string, unknown>>(db, m.d.link, sql`select * from votes where member_id = ${m.d.memberId}`);
    expect(after).toMatchObject({ value: "down", change_count: 2, cast_in_size: "group", open_to: [] });

    await expectDenied(
      as(db, m.d.link, (tx) => q(tx, sql`update votes set member_id = ${m.a.memberId} where member_id = ${m.d.memberId}`)),
      /read-only|row-level security/,
    );
    await svc(db, (tx) => q(tx, sql`delete from votes where member_id = ${m.d.memberId}`));
  });

  it("organizer turnout is numbers only (FR-42/43)", async () => {
    const rows = await as(db, m.o.full, (tx) => turnout(tx, tripId));
    const row = rows.find((r) => r.itemId === ideaId);
    expect(row).toEqual({ kind: "idea", itemId: ideaId, eligibleCount: 5, voterCount: 4, changedCount: 0 });
    expect(await as(db, m.a.full, (tx) => turnout(tx, tripId))).toEqual([]);
    expect(await as(db, m.o.link, (tx) => turnout(tx, tripId))).toEqual([]);
  });

  it("removed and non-attending members' votes stop counting (V-10)", async () => {
    await setStatus(db, m.c.memberId, "removed");
    let r = await reveal(m.a.full, tripId, ideaId);
    expect(names(r)).toEqual(["Ana:must", "Olivia:down"]);
    expect(r.voterCount).toBe(3);
    await setStatus(db, m.c.memberId, "active");
    await setStatus(db, m.b.memberId, "not_attending");
    r = await reveal(m.a.full, tripId, ideaId);
    expect(r).toMatchObject({ passCount: 0, voterCount: 3 });
    // A not-attending member can still read the trip, but cannot vote.
    expect((await as(db, m.b.full, (tx) => ideaReveals(tx, tripId))).length).toBeGreaterThan(0);
    await expectDenied(vote(db, m.b.full, ideaId, m.b.memberId, "must"), RLS_DENIED);
    await setStatus(db, m.b.memberId, "active");
  });

  it("only people attending the idea's Stop count (FR-S7, FR-44)", async () => {
    const porto = randomUUID();
    await svc(db, (tx) => q(tx, sql`insert into stops (id, trip_id, name) values (${porto}, ${tripId}, 'Porto')`));
    const portoIdea = await seedIdea(db, tripId, { stopId: porto, title: "Livraria Lello" });
    await query(db, m.b.full, sql`insert into stop_attendance (stop_id, member_id, attending) values (${porto}, ${m.b.memberId}, false)`);
    await vote(db, m.a.full, portoIdea, m.a.memberId, "must");
    await vote(db, m.b.full, portoIdea, m.b.memberId, "pass");
    const r = await reveal(m.a.full, tripId, portoIdea);
    expect(r).toMatchObject({ mustCount: 1, passCount: 0, voterCount: 1 });
    // Ben voted, so his own view is unblinded, but his vote isn't counted.
    expect(await reveal(m.b.full, tripId, portoIdea)).toMatchObject({ viewerVoted: true, voterCount: 1 });
    const t = (await as(db, m.o.full, (tx) => turnout(tx, tripId))).find((x) => x.itemId === portoIdea);
    expect(t).toMatchObject({ eligibleCount: 4, voterCount: 1 });
  });

  it("people outside the trip get nothing", async () => {
    const outsider = await seedTrip(db, { x: { name: "Xena", role: "owner" } });
    expect(await as(db, outsider.m.x.full, (tx) => ideaReveals(tx, tripId))).toEqual([]);
    await expectDenied(vote(db, outsider.m.x.full, ideaId, outsider.m.x.memberId, "must"), /idea not found|row-level/);
  });
});

describe("duo trip: open from the start (§6.10)", () => {
  it("both see each other's votes, including Pass, before voting", async () => {
    const { tripId, m } = await seedTrip(db, { a: { name: "Ana", role: "owner" }, b: { name: "Ben" } });
    const ideaId = await seedIdea(db, tripId);
    await vote(db, m.a.link, ideaId, m.a.memberId, "pass");
    const r = await reveal(m.b.link, tripId, ideaId);
    expect(r).toMatchObject({ viewerVoted: false, mustCount: 0, downCount: 0, passCount: 1, voterCount: 1 });
    expect(names(r)).toEqual(["Ana:pass"]);
    const [row] = await query<{ cast_in_size: string; open_to: string[] }>(
      db,
      m.a.link,
      sql`select cast_in_size, open_to from votes`,
    );
    expect(row!.cast_in_size).toBe("duo");
    expect([...row!.open_to].sort()).toEqual([m.a.memberId, m.b.memberId].sort());
  });
});

describe("solo trip and solo → duo (FR-T3)", () => {
  it("solo shows only your own vote; on solo → duo, solo priorities become visible votes", async () => {
    const { tripId, m } = await seedTrip(db, { a: { name: "Ana", role: "owner" } });
    const ideaId = await seedIdea(db, tripId);
    await vote(db, m.a.full, ideaId, m.a.memberId, "pass");
    const r = await reveal(m.a.full, tripId, ideaId);
    expect(r).toMatchObject({ viewerVoted: true, mustCount: null, passCount: null, voterCount: null });
    expect(names(r)).toEqual(["Ana:pass"]);

    const sam = await addActiveMember(db, tripId, "Sam");
    const seen = await reveal(sam.full, tripId, ideaId);
    expect(names(seen)).toEqual(["Ana:pass"]);
    expect(seen.passCount).toBe(1);
  });
});

describe("duo → group (FR-T4)", () => {
  it("the original two keep seeing each other's Pass; the newcomer sees counts only", async () => {
    const { tripId, m } = await seedTrip(db, { a: { name: "Ana", role: "owner" }, b: { name: "Ben" } });
    const ideaId = await seedIdea(db, tripId);
    await vote(db, m.a.full, ideaId, m.a.memberId, "pass");
    await vote(db, m.b.full, ideaId, m.b.memberId, "must");

    const cat = await addActiveMember(db, tripId, "Cat");
    // Now a group: blind for Cat until she votes.
    expect(await reveal(cat.full, tripId, ideaId)).toMatchObject({ voters: null, passCount: null });
    expect(names(await reveal(m.b.full, tripId, ideaId))).toEqual(["Ana:pass", "Ben:must"]);

    await vote(db, cat.full, ideaId, cat.memberId, "down");
    const rc = await reveal(cat.full, tripId, ideaId);
    expect(names(rc)).toEqual(["Ben:must", "Cat:down"]);
    expect(rc).toMatchObject({ passCount: 1, voterCount: 3 });

    // New votes after the switch are blind/anonymous, even to the original pair.
    await vote(db, m.b.full, ideaId, m.b.memberId, "pass");
    expect(names(await reveal(m.a.full, tripId, ideaId))).toEqual(["Ana:pass", "Cat:down"]);
    expect((await reveal(m.a.full, tripId, ideaId)).passCount).toBe(2);
  });
});

describe("group → duo (FR-T5)", () => {
  let tripId: string;
  let m: Record<"a" | "b" | "c", Actor>;
  let ideaId: string;

  beforeAll(async () => {
    ({ tripId, m } = await seedTrip(db, {
      a: { name: "Ana", role: "owner" },
      b: { name: "Ben" },
      c: { name: "Cat" },
    }));
    ideaId = await seedIdea(db, tripId);
    await vote(db, m.a.full, ideaId, m.a.memberId, "must");
    await vote(db, m.b.full, ideaId, m.b.memberId, "pass"); // cast while a group: anonymous forever
    await vote(db, m.c.full, ideaId, m.c.memberId, "down");
    await setStatus(db, m.c.memberId, "removed");
  });

  it("group-era Pass is excluded from names AND counts in duo view", async () => {
    const r = await reveal(m.a.full, tripId, ideaId);
    expect(names(r)).toEqual(["Ana:must"]);
    expect(r).toMatchObject({ mustCount: 1, downCount: 0, passCount: 0, voterCount: 1 });
    expect(JSON.stringify(r)).not.toContain(m.b.memberId);
    const [trip] = await svc(db, (tx) => q<{ size: string }>(tx, sql`select size from trips where id = ${tripId}`));
    expect(trip!.size).toBe("duo");
  });

  it("re-submitting the same Pass does not reveal it", async () => {
    await vote(db, m.b.full, ideaId, m.b.memberId, "pass");
    expect(names(await reveal(m.a.full, tripId, ideaId))).toEqual(["Ana:must"]);
    expect((await reveal(m.a.full, tripId, ideaId)).passCount).toBe(0);
  });

  it("Ben still sees his own vote", async () => {
    expect(names(await reveal(m.b.full, tripId, ideaId))).toEqual(["Ana:must", "Ben:pass"]);
  });

  it("a new vote follows duo rules", async () => {
    await vote(db, m.b.full, ideaId, m.b.memberId, "down");
    expect(names(await reveal(m.a.full, tripId, ideaId))).toEqual(["Ana:must", "Ben:down"]);
    await vote(db, m.b.full, ideaId, m.b.memberId, "pass");
    const r = await reveal(m.a.full, tripId, ideaId);
    expect(names(r)).toEqual(["Ana:must", "Ben:pass"]);
    expect(r.passCount).toBe(1);
  });
});

describe("polls (FR-47/48, FR-T7)", () => {
  async function seedPoll(tripId: string, opts: { closed?: boolean } = {}) {
    const pollId = randomUUID();
    const o1 = randomUUID();
    const o2 = randomUUID();
    await svc(db, async (tx) => {
      await q(tx, sql`insert into polls (id, trip_id, kind, question, closed_at)
        values (${pollId}, ${tripId}, 'custom', 'Theme?', ${opts.closed ? new Date().toISOString() : null})`);
      await q(tx, sql`insert into poll_options (id, poll_id, label, position) values
        (${o1}, ${pollId}, 'Disco', 0), (${o2}, ${pollId}, 'Cowboy', 1)`);
    });
    return { pollId, o1, o2 };
  }
  const pollVote = (claims: Claims, pollId: string, memberId: string, optionId: string) =>
    as(db, claims, (tx) =>
      q(tx, sql`insert into poll_votes (poll_id, member_id, option_id, trip_id, cast_in_size)
        values (${pollId}, ${memberId}, ${optionId}, ${randomUUID()}, 'solo')
        on conflict (poll_id, member_id) do update set option_id = excluded.option_id`),
    );

  it("group: blind until you vote, then counts without names", async () => {
    const { tripId, m } = await seedTrip(db, {
      o: { name: "Olivia", role: "owner" },
      a: { name: "Ana" },
      b: { name: "Ben" },
    });
    const { pollId, o1, o2 } = await seedPoll(tripId);
    await pollVote(m.a.link, pollId, m.a.memberId, o1);
    const blind = await as(db, m.b.full, (tx) => pollResults(tx, pollId));
    expect(blind.map((r) => r.voteCount)).toEqual([null, null]);
    expect(blind.every((r) => r.voters === null)).toBe(true);

    await pollVote(m.b.full, pollId, m.b.memberId, o2);
    await pollVote(m.b.full, pollId, m.b.memberId, o1);
    const seen = await as(db, m.b.full, (tx) => pollResults(tx, pollId));
    expect(seen.map((r) => [r.label, r.voteCount, r.voters])).toEqual([
      ["Disco", 2, null],
      ["Cowboy", 0, null],
    ]);
    expect(await query(db, m.a.full, sql`select member_id from poll_votes`)).toEqual([{ member_id: m.a.memberId }]);
    const t = (await as(db, m.o.full, (tx) => turnout(tx, tripId))).find((x) => x.itemId === pollId);
    expect(t).toEqual({ kind: "poll", itemId: pollId, eligibleCount: 3, voterCount: 2, changedCount: 1 });
    await expectDenied(pollVote(m.a.full, pollId, m.b.memberId, o2), RLS_DENIED);
  });

  it("closed polls reveal counts to everyone and reject new votes", async () => {
    const { tripId, m } = await seedTrip(db, {
      o: { name: "Olivia", role: "owner" },
      a: { name: "Ana" },
      b: { name: "Ben" },
    });
    const { pollId, o1 } = await seedPoll(tripId, { closed: true });
    await expectDenied(pollVote(m.a.full, pollId, m.a.memberId, o1), /poll is closed/);
    const r = await as(db, m.a.full, (tx) => pollResults(tx, pollId));
    expect(r.map((x) => x.voteCount)).toEqual([0, 0]);
  });

  it("rejects an option from another poll", async () => {
    const { tripId, m } = await seedTrip(db, { a: { name: "Ana", role: "owner" }, b: { name: "Ben" }, c: { name: "Cy" } });
    const p1 = await seedPoll(tripId);
    const p2 = await seedPoll(tripId);
    await expectDenied(pollVote(m.a.full, p1.pollId, m.a.memberId, p2.o1), /option does not belong/);
  });

  it("duo: names are shown, even before voting", async () => {
    const { tripId, m } = await seedTrip(db, { a: { name: "Ana", role: "owner" }, b: { name: "Ben" } });
    const { pollId, o2 } = await seedPoll(tripId);
    await pollVote(m.a.full, pollId, m.a.memberId, o2);
    const r = await as(db, m.b.full, (tx) => pollResults(tx, pollId));
    // Duo polls are blind until you vote like groups, but show names once you have.
    expect(r.map((x) => x.voteCount)).toEqual([null, null]);
    const [o1] = r;
    await pollVote(m.b.full, pollId, m.b.memberId, o1!.optionId);
    const after = await as(db, m.b.full, (tx) => pollResults(tx, pollId));
    expect(after.map((x) => [x.label, x.voteCount, (x.voters ?? []).map((v) => v.display_name)])).toEqual([
      ["Disco", 1, ["Ben"]],
      ["Cowboy", 1, ["Ana"]],
    ]);
  });
});
