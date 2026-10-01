import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate packages/db/migrations at runtime. Bundler-safe: no `new URL(dir, import.meta.url)`
 * literal (Turbopack treats that as an asset reference), so Next.js can bundle this file.
 * Order: WANDR_MIGRATIONS_DIR → next to this source file → walk up from cwd.
 */
export function findMigrationsDir(): string {
  const fromEnv = process.env.WANDR_MIGRATIONS_DIR;
  if (fromEnv) return fromEnv;
  const candidates: string[] = [];
  try {
    const here = fileURLToPath(import.meta.url);
    candidates.push(join(dirname(here), "..", "migrations"));
  } catch {
    // bundled: import.meta.url may not be a file URL
  }
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    candidates.push(join(dir, "packages", "db", "migrations"), join(dir, "migrations"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const found = candidates.find((c) => existsSync(join(c, "0000_init.sql")));
  if (!found) throw new Error("Could not find packages/db/migrations; set WANDR_MIGRATIONS_DIR");
  return found;
}

/** All migration statements, in file order. Works for drizzle-kit output and hand-written SQL. */
export function migrationStatements(dir = findMigrationsDir()): { file: string; sql: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(dir, file), "utf8") }));
}

/** Split a file on drizzle's breakpoint marker; hand-written files are run whole. */
export function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Minimal driver so the same bookkeeping runs on PGlite (tests/dev) and postgres-js (prod). */
export interface MigrationDriver {
  /** Run SQL that may contain several statements (simple query protocol). */
  exec(sql: string): Promise<void>;
  appliedFiles(): Promise<string[]>;
  /** Run `fn` in one transaction; `exec`/`record` inside it must use that transaction. */
  transaction(fn: (tx: { exec(sql: string): Promise<void>; record(file: string): Promise<void> }) => Promise<void>): Promise<void>;
}

/**
 * Apply every not-yet-applied file in `dir`, in order, each in its own transaction, recording it
 * in `_wandr_migrations`. Returns the files applied.
 */
export async function applyMigrations(driver: MigrationDriver, dir = findMigrationsDir()): Promise<string[]> {
  await driver.exec(`create table if not exists _wandr_migrations (file text primary key, applied_at timestamptz not null default now())`);
  const done = new Set(await driver.appliedFiles());
  const applied: string[] = [];
  for (const { file, sql } of migrationStatements(dir)) {
    if (done.has(file)) continue;
    await driver.transaction(async (tx) => {
      for (const stmt of splitStatements(sql)) await tx.exec(stmt);
      await tx.record(file);
    });
    applied.push(file);
  }
  return applied;
}
