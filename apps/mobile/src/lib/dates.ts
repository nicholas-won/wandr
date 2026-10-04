/** Local calendar date → "YYYY-MM-DD" (the contract's date format; no time zone shift). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "May 1" / "May 1, 2027" (year only when it isn't this year). */
export function shortDate(d: Date, today = new Date()): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Destinations typed as "Lisbon, Porto" → ["Lisbon", "Porto"] (max 8, each ≤ 60 chars, deduped). */
export function parseDestinations(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n;]+/)) {
    const v = part.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length === 8) break;
  }
  return out;
}
