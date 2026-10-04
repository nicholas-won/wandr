/**
 * Library grouping (§6.12 FR-L6: places, not a feed). Saves are grouped by city or region, then
 * country, with unsorted saves (still processing, or not a place) last.
 */
import type { SaveCard } from "@wandr/api-contract";

export interface LibrarySection {
  key: string;
  title: string;
  /** "Portugal" under "Lisbon"; null when the title already is the country. */
  subtitle: string | null;
  data: SaveCard[];
}

export const UNSORTED_TITLE = "Not sorted yet";

export function groupSaves(saves: readonly SaveCard[]): LibrarySection[] {
  const map = new Map<string, LibrarySection>();
  for (const s of saves) {
    const place = s.regionOrCity?.trim() || s.country?.trim() || null;
    const key = place ? `${place}|${s.country ?? ""}`.toLowerCase() : "~unsorted";
    let section = map.get(key);
    if (!section) {
      section = {
        key,
        title: place ?? UNSORTED_TITLE,
        subtitle: s.regionOrCity && s.country ? s.country : null,
        data: [],
      };
      map.set(key, section);
    }
    section.data.push(s);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "~unsorted") return 1;
    if (b.key === "~unsorted") return -1;
    return b.data.length - a.data.length || a.title.localeCompare(b.title);
  });
}
