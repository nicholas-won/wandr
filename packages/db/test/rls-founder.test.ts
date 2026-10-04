/**
 * 0007: deleted trips are hidden from every client (JR3); organizers act for managed members whose
 * manager left (JR11); organizers set anyone's attendance (Q13, already allowed by RLS).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import { expectDenied, freshDb, query, RLS_DENIED, seedIdea, seedTrip, sql, svc, vote } from "./fixtures";

let db: Db;
beforeAll(async () => {
  db = await freshDb();
});

describe("JR3: a soft-deleted trip disappears for everyone", () => {
  it("hides the trip, its members and ideas; keeps the rows", async () => {
    const t = await seedTrip(db, { owner: { name: "Nick", role: "owner" }, a: { name: "Sam" } });
    const ideaId = await seedIdea(db, t.tripId);
    expect(await query(db, t.m.a.full, sql`select id from trips where id = ${t.tripId}`)).toHaveLength(1);
    await svc(db, (tx) => tx.execute(sql`update trips set deleted_at = now() where id = ${t.tripId}`));
    for (const claims of [t.m.owner.full, t.m.a.full, t.m.a.link]) {
      expect(await query(db, claims, sql`select id from trips where id = ${t.tripId}`)).toEqual([]);
      expect(await query(db, claims, sql`select id from members where trip_id = ${t.tripId}`)).toEqual([]);
      expect(await query(db, claims, sql`select id from ideas where id = ${ideaId}`)).toEqual([]);
    }
    await expectDenied(vote(db, t.m.a.full, ideaId, t.m.a.memberId, "must"), /idea not found|row-level security|42501/);
    // Kept in the database (money history, NFR-5).
    const kept = await svc(db, (tx) => tx.execute(sql`select id from ideas where id = ${ideaId}`));
    expect(kept).toBeTruthy();
  });

  it("clients can't set deleted_at themselves (service only)", async () => {
    const t = await seedTrip(db, { owner: { name: "Nick", role: "owner" } });
    await expectDenied(
      query(db, t.m.owner.full, sql`update trips set deleted_at = now() where id = ${t.tripId}`),
      /permission denied/,
    );
  });
});

describe("JR11: organizers act for managed members whose manager is gone", () => {
  it("votes and attendance", async () => {
    const t = await seedTrip(db, {
      owner: { name: "Nick", role: "owner" },
      org: { name: "Raj", role: "organizer" },
      mgr: { name: "Mia" },
      other: { name: "Ben" },
    });
    const kid = randomUUID();
    await svc(db, (tx) =>
      tx.execute(sql`insert into members (id, trip_id, display_name, status, managed_by_member_id)
        values (${kid}, ${t.tripId}, 'Kid', 'active', ${t.m.mgr.memberId})`),
    );
    const ideaId = await seedIdea(db, t.tripId);
    // Manager active: the organizer can't vote for the kid.
    await expectDenied(vote(db, t.m.org.full, ideaId, kid, "down"), RLS_DENIED);
    await svc(db, (tx) => tx.execute(sql`update members set status = 'removed', removed_at = now() where id = ${t.m.mgr.memberId}`));
    await vote(db, t.m.org.full, ideaId, kid, "down");
    await vote(db, t.m.owner.full, ideaId, kid, "must");
    // Not for plain members, and not from a personal link.
    await expectDenied(vote(db, t.m.other.full, ideaId, kid, "pass"), RLS_DENIED);
    await expectDenied(vote(db, t.m.org.link, ideaId, kid, "pass"), RLS_DENIED);
    // Q13: organizers set anyone's attendance.
    await query(
      db,
      t.m.org.full,
      sql`insert into stop_attendance (stop_id, member_id, attending) values (${t.stopId}, ${t.m.other.memberId}, false)`,
    );
    await expectDenied(
      query(
        db,
        t.m.other.full,
        sql`insert into stop_attendance (stop_id, member_id, attending) values (${t.stopId}, ${t.m.owner.memberId}, false)`,
      ),
      RLS_DENIED,
    );
  });
});
