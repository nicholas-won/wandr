/**
 * Regression: 0005_poll_pause_runoff was briefly named 0004_poll_pause_runoff on a branch, so
 * local databases may have applied it under the old name. Re-running it must be harmless.
 */
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../src/migrate-files";
import { createPglite, pgliteDriver } from "../src/pglite";

describe("renumbered migration", () => {
  it("re-applies 0005 cleanly on a database that already has its columns", async () => {
    const { client } = await createPglite();
    await client.query(`update _wandr_migrations set file = '0004_poll_pause_runoff.sql' where file = '0005_poll_pause_runoff.sql'`);
    const applied = await applyMigrations(pgliteDriver(client));
    expect(applied).toEqual(["0005_poll_pause_runoff.sql"]);
    const cols = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'polls' and column_name in ('paused_at','closed_by_member_id','runoff_of_poll_id') order by 1`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(["closed_by_member_id", "paused_at", "runoff_of_poll_id"]);
  });
});
