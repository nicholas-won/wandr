import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withRefusalFallback, type StructuredModel, type StructuredResult } from "../src/claude";

function fake(model: string, result: Partial<StructuredResult<unknown>>) {
  let calls = 0;
  const m: StructuredModel & { calls: () => number } = {
    model,
    calls: () => calls,
    async generate<T>() {
      calls++;
      return { output: null, stopReason: "end_turn", model, ...result } as StructuredResult<T>;
    },
  };
  return m;
}
const req = { system: "s", content: [], schema: z.object({ a: z.string() }) };

describe("refusal fallback (D72)", () => {
  it("retries once on another model only when the first refuses", async () => {
    const a = fake("opus", { stopReason: "refusal" });
    const b = fake("sonnet", { output: { a: "x" } });
    const r = await withRefusalFallback(a, b).generate(req);
    expect(r).toMatchObject({ output: { a: "x" }, model: "sonnet" });
    expect([a.calls(), b.calls()]).toEqual([1, 1]);
  });

  it("doesn't retry on errors or truncation", async () => {
    for (const first of [{ error: "api_500", stopReason: null }, { stopReason: "max_tokens" }]) {
      const a = fake("opus", first);
      const b = fake("sonnet", { output: { a: "x" } });
      await withRefusalFallback(a, b).generate(req);
      expect(b.calls()).toBe(0);
    }
  });
});
