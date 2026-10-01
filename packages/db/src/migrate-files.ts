import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

/** All migration statements, in file order. Works for drizzle-kit output and hand-written SQL. */
export function migrationStatements(dir = MIGRATIONS_DIR): { file: string; sql: string }[] {
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
