/**
 * Eval runner: `pnpm --filter @wandr/ai eval [captions|receipts]`
 *
 * With ANTHROPIC_API_KEY set → scores the live model (AI_MODEL, default claude-opus-5-5).
 * Without it → scores the deterministic heuristic fallback.
 * Exits non-zero if any safety (prompt-injection) case fails.
 *
 * Receipt fixtures are SYNTHETIC text. Real receipt photos must be added (evals/receipts/*.jpg)
 * before the receipt prompt ships (CLAUDE.md: every prompt has a real eval set).
 */
import { createClaudeModel } from "../src/claude";
import { extractPlaces } from "../src/extract";
import { readReceipt } from "../src/receipt";
import { TRIPS, captionCases, metaFromCase, receiptCases, scoreCaption, scoreReceipt } from "./harness";

const which = process.argv[2] ?? "all";
const model = createClaudeModel();
const label = model ? `live model ${model.model}` : "heuristic (no ANTHROPIC_API_KEY)";

function pct(n: number) {
  return `${(n * 100).toFixed(0)}%`.padStart(4);
}

async function runCaptions(): Promise<boolean> {
  console.log(`\n== Caption extraction eval: ${label} ==`);
  let total = 0;
  let safe = true;
  let kindOk = 0;
  for (const c of captionCases) {
    const started = Date.now();
    const out = await extractPlaces({ meta: metaFromCase(c), trip: TRIPS[c.trip] }, model);
    const s = scoreCaption(c, out.result);
    total += s.score;
    if (s.kindOk) kindOk++;
    if (!s.safetyOk) safe = false;
    const ms = Date.now() - started;
    console.log(
      `${pct(s.score)}  ${c.id.padEnd(36)} ${out.result.kind.padEnd(11)} ${String(out.result.places.length).padStart(2)}p ${String(ms).padStart(6)}ms  ${s.notes.join("; ")}`,
    );
  }
  console.log(
    `-- mean score ${pct(total / captionCases.length)}, kind accuracy ${kindOk}/${captionCases.length}, safety ${safe ? "PASS" : "FAIL"}`,
  );
  return safe;
}

async function runReceipts(): Promise<void> {
  console.log(`\n== Receipt reading eval (synthetic text fixtures): ${label} ==`);
  let total = 0;
  for (const c of receiptCases) {
    const out = await readReceipt({ text: c.text, hints: c.hints }, model);
    const s = scoreReceipt(c, out);
    total += s.score;
    console.log(`${pct(s.score)}  ${c.id.padEnd(36)} ${s.notes.join("; ")}`);
  }
  console.log(`-- mean score ${pct(total / receiptCases.length)}`);
  console.log("NOTE: real receipt photos are required before shipping the receipt prompt.");
}

let ok = true;
if (which === "all" || which === "captions") ok = await runCaptions();
if (which === "all" || which === "receipts") await runReceipts();
process.exit(ok ? 0 : 1);
