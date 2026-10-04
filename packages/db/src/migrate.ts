/**
 * Production migration runner: `pnpm --filter @wandr/db migrate` with DATABASE_URL set.
 *
 * Applies every file in migrations/ in name order (drizzle-generated and hand-written SQL alike)
 * with the same `_wandr_migrations` bookkeeping as the PGlite harness. Each file runs in its own
 * transaction, and a session advisory lock stops two deploys from migrating at once.
 * Use a direct (session) connection, not the transaction pooler.
 */
import postgres from "postgres";
import { pathToFileURL } from "node:url";
import { applyMigrations, findMigrationsDir, type MigrationDriver } from "./migrate-files";

const LOCK_KEY = 0x77616e64; // "wand"

export function postgresDriver(sql: postgres.Sql): MigrationDriver {
  return {
    exec: async (text) => void (await sql.unsafe(text).simple()),
    appliedFiles: async () => (await sql<{ file: string }[]>`select file from _wandr_migrations`).map((r) => r.file),
    transaction: async (fn) => {
      await sql.begin(async (tx) => {
        await fn({
          exec: async (text) => void (await tx.unsafe(text).simple()),
          record: async (file) => void (await tx`insert into _wandr_migrations (file) values (${file})`),
        });
      });
    },
  };
}

export async function migrate(url: string, dir = findMigrationsDir()): Promise<string[]> {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(${LOCK_KEY})`;
    try {
      return await applyMigrations(postgresDriver(sql), dir);
    } finally {
      await sql`select pg_advisory_unlock(${LOCK_KEY})`;
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  migrate(url)
    .then((files) => {
      console.log(files.length ? `Applied: ${files.join(", ")}` : "Up to date");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
