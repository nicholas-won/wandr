import { assertMinor, type CurrencyCode } from "./currency";
import { DEFAULT_DUPLICATE_WINDOW_MS, normalizeMerchant } from "./duplicates";

/**
 * Q24 (founder decision 2026-10-02): line-item comparison for duplicate receipts, on top of
 * the merchant / total / currency / one-day check in duplicates.ts (E-11).
 *
 * Two itemized receipts are "highly similar" when, compared as multisets:
 *   - label Jaccard  = |labels(A) ∩ labels(B)| / |labels(A) ∪ labels(B)|  >= 4/5, AND
 *   - amount Jaccard = |amounts(A) ∩ amounts(B)| / |amounts(A) ∪ amounts(B)| >= 4/5,
 * where labels are normalized like merchants (accents, case, punctuation, legal suffixes) with
 * leading/trailing quantity tokens ("2x", "x2", "3") dropped, and amounts are exact minor units.
 * Both receipts need at least {@link MIN_ITEMS_FOR_SIMILARITY} lines (two single "Coffee 4.00"
 * receipts are normal, not duplicates), be in the same currency and within one day of each
 * other. Integer arithmetic only: the threshold is checked as 5·|∩| >= 4·|∪|, so the result is
 * deterministic on every server.
 *
 * This only flags pairs for the organizer to resolve (keep both / delete one). It never deletes.
 */
export const LINE_ITEM_SIMILARITY_THRESHOLD = { num: 4, den: 5 } as const;
export const MIN_ITEMS_FOR_SIMILARITY = 2;

export interface LineItemLike {
  label: string;
  amountMinor: number;
}

export interface LineItemSimilarity {
  labelIntersection: number;
  labelUnion: number;
  amountIntersection: number;
  amountUnion: number;
  /** floor(1000 · Jaccard), for display and sorting. */
  labelPermille: number;
  amountPermille: number;
  similar: boolean;
}

const QTY_TOKEN = /^(?:\d+x|x\d+|\d+)$/;

/** Item label normalization for Q24: merchant normalization, then quantity tokens dropped. */
export function normalizeItemLabel(label: string): string {
  const words = normalizeMerchant(label)
    .split(" ")
    .filter((w) => w.length > 0);
  let start = 0;
  let end = words.length;
  while (start < end - 1 && QTY_TOKEN.test(words[start]!)) start++;
  while (end - 1 > start && QTY_TOKEN.test(words[end - 1]!)) end--;
  return words.slice(start, end).join(" ");
}

function multisetJaccard(a: readonly string[], b: readonly string[]): { inter: number; union: number } {
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  for (const x of a) ca.set(x, (ca.get(x) ?? 0) + 1);
  for (const x of b) cb.set(x, (cb.get(x) ?? 0) + 1);
  let inter = 0;
  let union = 0;
  for (const k of new Set([...ca.keys(), ...cb.keys()])) {
    const x = ca.get(k) ?? 0;
    const y = cb.get(k) ?? 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  return { inter, union };
}

/** Q24 similarity of two receipts' line items (see the block comment above). */
export function lineItemSimilarity(a: readonly LineItemLike[], b: readonly LineItemLike[]): LineItemSimilarity {
  for (const it of [...a, ...b]) assertMinor(it.amountMinor, "item amountMinor");
  const l = multisetJaccard(
    a.map((i) => normalizeItemLabel(i.label)),
    b.map((i) => normalizeItemLabel(i.label)),
  );
  const m = multisetJaccard(
    a.map((i) => String(i.amountMinor)),
    b.map((i) => String(i.amountMinor)),
  );
  const { num, den } = LINE_ITEM_SIMILARITY_THRESHOLD;
  const enough = a.length >= MIN_ITEMS_FOR_SIMILARITY && b.length >= MIN_ITEMS_FOR_SIMILARITY;
  const permille = (x: { inter: number; union: number }) => (x.union === 0 ? 0 : Math.floor((x.inter * 1000) / x.union));
  return {
    labelIntersection: l.inter,
    labelUnion: l.union,
    amountIntersection: m.inter,
    amountUnion: m.union,
    labelPermille: permille(l),
    amountPermille: permille(m),
    similar: enough && l.union > 0 && den * l.inter >= num * l.union && den * m.inter >= num * m.union,
  };
}

export interface ItemizedReceiptLike {
  id: string;
  currency: CurrencyCode;
  occurredAtMs: number;
  items: readonly LineItemLike[];
}

export interface SimilarReceiptPair {
  /** Sorted so a < b (stable pair key). */
  a: string;
  b: string;
  similarity: LineItemSimilarity;
}

/**
 * Q24: every pair of receipts in the same currency, within `windowMs` of each other (default
 * one day, like E-11), whose line items are highly similar. Pairs are sorted by id.
 */
export function findSimilarReceiptPairs(
  receipts: readonly ItemizedReceiptLike[],
  options: { windowMs?: number } = {},
): SimilarReceiptPair[] {
  const windowMs = options.windowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
  const sorted = [...receipts].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const out: SimilarReceiptPair[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const x = sorted[i]!;
      const y = sorted[j]!;
      if (x.currency !== y.currency || Math.abs(x.occurredAtMs - y.occurredAtMs) > windowMs) continue;
      const similarity = lineItemSimilarity(x.items, y.items);
      if (similarity.similar) out.push({ a: x.id, b: y.id, similarity });
    }
  }
  return out;
}
