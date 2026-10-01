/**
 * Run queries as a specific caller so Postgres Row Level Security applies.
 *
 * Claims are exposed to SQL through `request.jwt.claims` (the same setting Supabase uses),
 * read by the `app.*` helper functions in migrations/0001_rls.sql:
 * - `sub`          verified user id (full access after an SMS/email code)
 * - `link_member`  member id from a personal link (FR-5: view + vote only)
 */
import { sql } from "drizzle-orm";
import type { Db } from "./client";

export type Claims =
  | { sub: string; link_member?: undefined }
  | { sub?: undefined; link_member: string }
  | { sub?: undefined; link_member?: undefined }; // anonymous

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Execute `fn` in a transaction as role `authenticated` (or `anon`) with the given claims. */
export async function withSession<T>(db: Db, claims: Claims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const role = claims.sub || claims.link_member ? "authenticated" : "anon";
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
