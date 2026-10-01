import { describe, expect, it } from "vitest";
import { createPglite } from "../src/pglite";

describe("migrations", () => {
  it("apply cleanly to a fresh database", async () => {
    const { client } = await createPglite();
    const r = await client.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    expect(r.rows[0]!.n).toBeGreaterThan(20);
  });
});
