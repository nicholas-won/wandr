/**
 * In-process Postgres (PGlite) for tests and zero-setup local dev.
 * Applies every migration, including RLS policies, so privacy tests run against real Postgres.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations, type MigrationDriver } from "./migrate-files";
import * as schema from "./schema";

export function pgliteDriver(client: PGlite): MigrationDriver {
  return {
    exec: async (sql) => void (await client.exec(sql)),
    appliedFiles: async () =>
      (await client.query<{ file: string }>(`select file from _wandr_migrations`)).rows.map((r) => r.file),
    transaction: (fn) =>
      client.transaction(async (tx) => {
        await fn({
          exec: async (sql) => void (await tx.exec(sql)),
          record: async (file) => void (await tx.query(`insert into _wandr_migrations (file) values ($1)`, [file])),
        });
      }),
  };
}

export async function createPglite(dataDir?: string) {
  const client = new PGlite(dataDir);
  await applyMigrations(pgliteDriver(client));
  return { client, db: drizzle(client, { schema }) };
}
