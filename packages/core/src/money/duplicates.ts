import { assertCurrency, assertMinor, type CurrencyCode } from "./currency";

/**
 * Duplicate receipt detection (FR-64, E-11).
 *
 * A candidate is a probable duplicate of an existing expense when the
 * normalized merchant, total and currency match and the two dates are within
 * `windowMs` of each other (default: 1 day either side, per E-11). An identical
 * image hash is always a match regardless of other fields. This only flags; it
 * never deletes or merges anything ("Same expense?" is the user's call).
 */
export interface DuplicateCandidate {
  id?: string;
  merchant: string;
  totalMinor: number;
  currency: CurrencyCode;
  /** When the expense happened (receipt date/time), epoch milliseconds. */
  occurredAtMs: number;
  /** Optional perceptual/content hash of the receipt image. */
  imageHash?: string;
}

export interface DuplicateMatch<T extends DuplicateCandidate = DuplicateCandidate> {
  expense: T;
  reason: "image_hash" | "merchant_total_time";
  /** Absolute time difference in ms. */
  deltaMs: number;
}

export const DEFAULT_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const LEGAL_SUFFIXES = new Set(["inc", "llc", "ltd", "co", "corp", "gmbh", "sa", "sas", "srl", "kk", "plc"]);

/**
 * Merchant name normalization: Unicode NFKD, accents stripped, lowercase,
 * "&" -> "and", punctuation removed, whitespace collapsed, common legal
 * suffixes and a leading "the" dropped. "Taberna Ñam, LLC." -> "taberna nam".
 * Non-Latin scripts are preserved (only combining marks are removed).
 */
export function normalizeMerchant(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  let start = 0;
  let end = words.length;
  if (words[0] === "the" && end > 1) start = 1;
  while (end - start > 1 && LEGAL_SUFFIXES.has(words[end - 1]!)) end--;
  return words.slice(start, end).join(" ");
}

/**
 * Returns existing expenses that look like the same receipt as `candidate`,
 * closest in time first (ties by input order). An existing expense with the
 * same `id` as the candidate is skipped.
 */
export function findProbableDuplicates<T extends DuplicateCandidate>(
  candidate: DuplicateCandidate,
  existing: readonly T[],
  options: { windowMs?: number } = {},
): DuplicateMatch<T>[] {
  assertCurrency(candidate.currency);
  assertMinor(candidate.totalMinor, "totalMinor");
  const windowMs = options.windowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
  const merchant = normalizeMerchant(candidate.merchant);
  const out: (DuplicateMatch<T> & { idx: number })[] = [];
  existing.forEach((e, idx) => {
    if (candidate.id !== undefined && e.id === candidate.id) return;
    const deltaMs = Math.abs(e.occurredAtMs - candidate.occurredAtMs);
    if (candidate.imageHash && e.imageHash && candidate.imageHash === e.imageHash) {
      out.push({ expense: e, reason: "image_hash", deltaMs, idx });
      return;
    }
    if (
      e.currency === candidate.currency &&
      e.totalMinor === candidate.totalMinor &&
      deltaMs <= windowMs &&
      merchant.length > 0 &&
      normalizeMerchant(e.merchant) === merchant
    ) {
      out.push({ expense: e, reason: "merchant_total_time", deltaMs, idx });
    }
  });
  out.sort((a, b) => a.deltaMs - b.deltaMs || a.idx - b.idx);
  return out.map(({ idx: _idx, ...m }) => m);
}
