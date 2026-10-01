/**
 * Run queries as a specific caller so Postgres Row Level Security applies.
 *
 * Claims are exposed to SQL through `request.jwt.claims` (the same setting Supabase uses),
 * read by the `app.*` helper functions in migrations/0001_rls.sql and 0003_library_rls.sql:
 * - `sub`          verified user id (full access after an SMS/email code)
 * - `link_member`  member id from a personal link (FR-5: view + vote only)
 * - `board_link`   board member id from a shared-board link (FR-L14: view + add only)
 */
import { sql } from "drizzle-orm";
import type { Db } from "./client";

export type Claims =
  | { sub: string; link_member?: undefined; board_link?: undefined }
  | { sub?: undefined; link_member: string; board_link?: undefined }
  /** Board member id from a shared-board personal link (FR-L14: view + add only). */
  | { sub?: undefined; link_member?: undefined; board_link: string }
  | { sub?: undefined; link_member?: undefined; board_link?: undefined }; // anonymous

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Execute `fn` in a transaction as role `authenticated` (or `anon`) with the given claims. */
export async function withSession<T>(db: Db, claims: Claims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const role = claims.sub || claims.link_member || claims.board_link ? "authenticated" : "anon";
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql.raw(`set local role ${role}`));
    return fn(tx);
  });
}

/**
 * Privileged access (webhooks, background jobs, auth). Bypasses RLS: callers must do their
 * own authorization, and must never return raw rows to clients.
 */
export async function asService<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
}
