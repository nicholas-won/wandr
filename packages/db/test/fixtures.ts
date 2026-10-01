/**
 * Shared seeding and session helpers for the RLS tests (migrations/0001_rls.sql).
 * Seeding runs as the service (table owner, bypasses RLS); assertions run through `withSession`.
 */
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { expect } from "vitest";
import type { Db } from "../src/client";
import { createPglite } from "../src/pglite";
import { rowsOf } from "../src/reveals";
import { asService, withSession, type Claims, type Tx } from "../src/session";

export { sql };

export async function freshDb(): Promise<Db> {
  const { db } = await createPglite();
  return db as unknown as Db;
}

export type Role = "owner" | "organizer" | "member";
export type Status = "invited" | "pending" | "active" | "not_attending" | "removed";

export interface MemberSpec {
  name: string;
  role?: Role;
  status?: Status;
  /** Has a verified user row (default true). False = invited-only or managed. */
  verified?: boolean;
  guestOfHonor?: boolean;
}

export interface Actor {
  memberId: string;
  userId: string | null;
  name: string;
  phone: string;
  /** Verified session (full scope). */
  full: Claims;
  /** Personal-link session (view + vote only, FR-5). */
  link: Claims;
}

export interface Trip<K extends string> {
  tripId: string;
  stopId: string;
  m: Record<K, Actor>;
}

let phoneSeq = 2025550100;

/** Create a trip with a default Stop and the given members (keys become actor names). */
export async function seedTrip<K extends string>(
  db: Db,
  members: Record<K, MemberSpec>,
  opts: { name?: string; outsiderName?: string; budgetCheckIn?: boolean } = {},
): Promise<Trip<K>> {
  const tripId = randomUUID();
  const stopId = randomUUID();
  const m = {} as Record<K, Actor>;
  await asService(db, async (tx) => {
    await tx.execute(sql`insert into trips (id, name, outsider_name, budget_check_in)
      values (${tripId}, ${opts.name ?? "Lisbon 2026"}, ${opts.outsiderName ?? null}, ${opts.budgetCheckIn ?? false})`);
    await tx.execute(sql`insert into stops (id, trip_id, name, is_default) values (${stopId}, ${tripId}, '', true)`);
    for (const key of Object.keys(members) as K[]) {
      const spec = members[key];
      const verified = spec.verified ?? true;
      const userId = verified ? randomUUID() : null;
      const memberId = randomUUID();
      const phone = `+1${phoneSeq++}`;
      if (userId) {
        await tx.execute(sql`insert into users (id, phone, display_name) values (${userId}, ${phone}, ${spec.name})`);
      }
      await tx.execute(sql`insert into members (id, trip_id, user_id, display_name, role, status, is_guest_of_honor)
        values (${memberId}, ${tripId}, ${userId}, ${spec.name}, ${spec.role ?? "member"},
                ${spec.status ?? "active"}, ${spec.guestOfHonor ?? false})`);
      await tx.execute(sql`insert into member_contacts (member_id, phone) values (${memberId}, ${phone})`);
      m[key] = {
        memberId,
        userId,
        name: spec.name,
        phone,
        full: userId ? { sub: userId } : { link_member: memberId },
        link: { link_member: memberId },
      };
    }
  });
  return { tripId, stopId, m };
}

/** Run `fn` as `claims` under RLS. */
export function as<T>(db: Db, claims: Claims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withSession(db, claims, fn);
}

export function svc<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return asService(db, fn);
}

export function q<T = Record<string, unknown>>(tx: Tx, query: SQL): Promise<T[]> {
  return rowsOf<T>(tx, query);
}

/** Run a query as `claims` and return its rows. */
export function query<T = Record<string, unknown>>(db: Db, claims: Claims, query: SQL): Promise<T[]> {
  return as(db, claims, (tx) => q<T>(tx, query));
}

/** Expect the promise to be rejected by the database; matches against the Postgres message. */
export async function expectDenied(p: Promise<unknown>, pattern: RegExp = /./): Promise<string> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, "expected the database to reject this").toBeDefined();
  const e = err as { message?: string; cause?: { message?: string } };
  const text = `${e.cause?.message ?? ""} | ${e.message ?? ""}`;
  expect(text).toMatch(pattern);
  return text;
}

export const RLS_DENIED = /row-level security|permission denied|42501/;

/** Insert an idea as the service. */
export async function seedIdea(
  db: Db,
  tripId: string,
  opts: { title?: string; stopId?: string | null; hiddenFrom?: string[]; createdBy?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await svc(db, (tx) =>
    tx.execute(sql`insert into ideas (id, trip_id, stop_id, title, hidden_from, created_by_member_id)
      values (${id}, ${tripId}, ${opts.stopId ?? null}, ${opts.title ?? "Pastéis de Belém"},
              ${`{${(opts.hiddenFrom ?? []).join(",")}}`}::uuid[], ${opts.createdBy ?? null})`),
  );
  return id;
}

/** Cast or change a vote as the given session (upsert). */
export function vote(db: Db, claims: Claims, ideaId: string, memberId: string, value: "must" | "down" | "pass") {
  return as(db, claims, (tx) =>
    tx.execute(sql`insert into votes (idea_id, member_id, trip_id, value, cast_in_size)
      values (${ideaId}, ${memberId}, ${randomUUID()}, ${value}, 'solo')
      on conflict (idea_id, member_id) do update set value = excluded.value`),
  );
}

export async function setStatus(db: Db, memberId: string, status: Status) {
  await svc(db, (tx) => tx.execute(sql`update members set status = ${status} where id = ${memberId}`));
}

export async function addActiveMember(db: Db, tripId: string, name: string): Promise<Actor> {
  const userId = randomUUID();
  const memberId = randomUUID();
  const phone = `+1${phoneSeq++}`;
  await svc(db, async (tx) => {
    await tx.execute(sql`insert into users (id, phone, display_name) values (${userId}, ${phone}, ${name})`);
    await tx.execute(sql`insert into members (id, trip_id, user_id, display_name, status)
      values (${memberId}, ${tripId}, ${userId}, ${name}, 'active')`);
  });
  return { memberId, userId, name, phone, full: { sub: userId }, link: { link_member: memberId } };
}
