/**
 * In-process Postgres (PGlite) for tests and zero-setup local dev.
 * Applies every migration, including RLS policies, so privacy tests run against real Postgres.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrationStatements, splitStatements } from "./migrate-files";
import * as schema from "./schema";

export async function createPglite(dataDir?: string) {
  const client = new PGlite(dataDir);
  await client.exec(`create table if not exists _wandr_migrations (file text primary key)`);
  const done = new Set(
    (await client.query<{ file: string }>(`select file from _wandr_migrations`)).rows.map((r) => r.file),
  );
  for (const { file, sql } of migrationStatements()) {
    if (done.has(file)) continue;
    for (const stmt of splitStatements(sql)) await client.exec(stmt);
    await client.query(`insert into _wandr_migrations (file) values ($1)`, [file]);
  }
  return { client, db: drizzle(client, { schema }) };
}
