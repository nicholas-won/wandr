/**
 * Database client.
 * - DATABASE_URL set → postgres-js (Supabase in prod/preview).
 * - Unset → PGlite persisted under `.data/pglite` for zero-setup local dev.
 */
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

let cached: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  cached ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) {
      const sql = postgres(url, { prepare: false, max: 5 });
      return drizzlePg(sql, { schema }) as unknown as Db;
    }
    const { createPglite } = await import("./pglite");
    const dir = process.env.PGLITE_DIR ?? `${process.cwd()}/.data/pglite`;
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    const { db } = await createPglite(dir);
    return db as unknown as Db;
  })().catch((err) => {
    cached = undefined; // retry on the next call instead of caching the failure
    throw err;
  });
  return cached;
}

/** Test hook: use an explicit database (e.g. an in-memory PGlite). */
export function setDbForTests(db: Db) {
  cached = Promise.resolve(db);
}
