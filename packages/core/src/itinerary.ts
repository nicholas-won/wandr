/**
 * Human-readable trip and Stop dates (founder feedback: "make dates easily readable").
 * Dates are calendar dates (YYYY-MM-DD) with no time zone, so format them in UTC.
 */

export interface StopDates {
  name: string;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
}

const DAY_MS = 86_400_000;
const parse = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  parse(d).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

export function nightsBetween(start: string, end: string): number {
  return Math.round((parse(end).getTime() - parse(start).getTime()) / DAY_MS);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * "Fri, Oct 9 → Mon, Oct 12" + "3 nights"; with only a length, "About 3 nights" and no range.
 */
export function stopDateLine(s: StopDates): { range: string | null; length: string | null } {
  if (s.startDate && s.endDate) {
    const n = nightsBetween(s.startDate, s.endDate);
    const day = { weekday: "short", month: "short", day: "numeric" } as const;
    return { range: `${fmt(s.startDate, day)} → ${fmt(s.endDate, day)}`, length: plural(Math.max(n, 0), "night") };
  }
  if (s.startDate) return { range: `From ${fmt(s.startDate, { weekday: "short", month: "short", day: "numeric" })}`, length: null };
  if (s.nights != null && s.nights > 0) return { range: null, length: `About ${plural(s.nights, "night")}` };
  return { range: null, length: null };
}

/**
 * One line for the whole trip: "Lisbon → Porto · Oct 9 – 15 · 6 nights". Parts that aren't known
 * yet are left out; the default unnamed Stop is skipped.
 */
export function tripSummary(stops: readonly StopDates[]): string | null {
  const named = stops.filter((s) => s.name.trim());
  const parts: string[] = [];
  if (named.length) parts.push(named.map((s) => s.name).join(" → "));
  const starts = stops.map((s) => s.startDate).filter((d): d is string => !!d).sort();
  const ends = stops.map((s) => s.endDate).filter((d): d is string => !!d).sort();
  if (starts.length && ends.length) {
    const a = starts[0]!;
    const b = ends[ends.length - 1]!;
    const sameMonth = a.slice(0, 7) === b.slice(0, 7);
    const sameYear = a.slice(0, 4) === b.slice(0, 4);
    const left = fmt(a, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
    const right = sameMonth ? fmt(b, { day: "numeric" }) : fmt(b, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
    parts.push(`${left} – ${right}`);
    parts.push(plural(Math.max(nightsBetween(a, b), 0), "night"));
  } else {
    const total = stops.reduce((n, s) => n + (s.startDate && s.endDate ? nightsBetween(s.startDate, s.endDate) : (s.nights ?? 0)), 0);
    if (total > 0) parts.push(`about ${plural(total, "night")}`);
  }
  return parts.length ? parts.join(" · ") : null;
}
