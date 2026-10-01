/**
 * Bundler-safe stand-in for packages/db/src/migrate-files.ts, swapped in via
 * `turbopack.resolveAlias` in next.config.ts.
 *
 * The original locates migrations with `new URL("../migrations", import.meta.url)`, which
 * Turbopack can't bundle (it treats it as an asset reference to a directory). Here we find the
 * folder at runtime instead: WANDR_MIGRATIONS_DIR, else walk up from the working directory to
 * `packages/db/migrations`. Only used by the PGlite (no DATABASE_URL) dev path.
 *
 * TODO(packages/db): make migrate-files.ts bundler-safe and delete this shim + the alias.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function findMigrationsDir(): string {
  const fromEnv = process.env.WANDR_MIGRATIONS_DIR;
  if (fromEnv) return fromEnv;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "packages", "db", "migrations");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find packages/db/migrations; set WANDR_MIGRATIONS_DIR");
}

export function migrationStatements(dir = findMigrationsDir()): { file: string; sql: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(dir, file), "utf8") }));
}

export function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}
