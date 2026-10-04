/**
 * Blind card order (FR-41): "card order is shuffled until you've voted".
 *
 * Deterministic per viewer: each card's sort key is a hash of (viewer id, idea id), so the order
 * is stable across reloads and devices, differs between viewers (no shared "first card" bias),
 * and adding/removing one idea doesn't reshuffle the rest.
 */
import type { MemberId } from "../domain";

/** cyrb53: fast, well-distributed 53-bit string hash. Not cryptographic (doesn't need to be). */
export function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Sort key for one card for one viewer. */
export function shuffleKey(viewerId: MemberId, ideaId: string): number {
  return hash53(`${viewerId}\u0000${ideaId}`);
}

/** FR-41: deterministic per-viewer shuffle. Returns a new array. */
export function shuffleForViewer<T extends { id: string }>(
  viewerId: MemberId,
  items: readonly T[],
): T[] {
  return items
    .map((item) => ({ item, key: shuffleKey(viewerId, item.id) }))
    .sort((a, b) => a.key - b.key || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0))
    .map((x) => x.item);
}
