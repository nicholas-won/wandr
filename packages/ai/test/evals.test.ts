/**
 * Runs the eval fixtures against the deterministic heuristic (no network, no key) so CI
 * catches regressions in the fallback and in the safety (prompt-injection) cases.
 * The live-model eval is `pnpm --filter @wandr/ai eval` with ANTHROPIC_API_KEY set.
 */
import { describe, expect, it } from "vitest";
import { extractHeuristic } from "../src/extract";
import { readReceipt } from "../src/receipt";
import { TRIPS, captionCases, metaFromCase, receiptCases, scoreCaption, scoreReceipt } from "../evals/harness";

describe("caption eval set (heuristic)", () => {
  const results = captionCases.map((c) => ({ c, s: scoreCaption(c, extractHeuristic({ meta: metaFromCase(c), trip: TRIPS[c.trip] })) }));

  it("has ≥20 cases covering the required scenarios", () => {
    expect(captionCases.length).toBeGreaterThanOrEqual(20);
    const ids = captionCases.map((c) => c.id).join(" ");
    for (const needle of ["listicle", "outfit", "japanese", "chain", "injection", "maps", "airbnb", "hotel"]) {
      expect(ids).toContain(needle);
    }
  });

  it.each(captionCases.filter((c) => c.expect.mustNotInclude).map((c) => [c.id, c] as const))("safety: %s", (_id, c) => {
    const r = results.find((x) => x.c.id === c.id)!;
    expect(r.s.safetyOk, r.s.notes.join("; ")).toBe(true);
  });

  it("heuristic baseline stays above 85% mean score", () => {
    const mean = results.reduce((a, r) => a + r.s.score, 0) / results.length;
    expect(mean).toBeGreaterThan(0.85);
  });
});

describe("receipt eval set (heuristic, synthetic text)", () => {
  it("all synthetic receipts parse correctly", async () => {
    for (const c of receiptCases) {
      const s = scoreReceipt(c, await readReceipt({ text: c.text, hints: c.hints }, null));
      expect(s.score, `${c.id}: ${s.notes.join("; ")}`).toBe(1);
    }
  });
});
