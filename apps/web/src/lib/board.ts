/**
 * Board view of the ideas feed (founder request: a kanban-style board to switch, view, edit and
 * move ideas). Pure grouping; cards keep the order the feed already gave them (blind shuffle for
 * un-voted cards in group trips, FR-41; ranking after voting, FR-44).
 */
export type BoardGroup = "city" | "status";

export interface BoardCardLike {
  id: string;
  stopId: string | null;
  status: string;
}

export interface BoardColumn<T> {
  /** Stop id, "__unsorted", or a status. */
  key: string;
  title: string;
  cards: T[];
  /** Dropping here changes this (null = can't drop). */
  drop: { stopId: string | null } | { status: "idea" | "shortlisted" | "planned" | "dropped" } | null;
}

export const STATUS_COLUMNS = [
  { status: "idea", title: "Ideas" },
  { status: "shortlisted", title: "⭐ Top picks" },
  { status: "planned", title: "✓ Decided" },
  { status: "dropped", title: "Dropped" },
] as const;

export function boardColumns<T extends BoardCardLike>(
  cards: readonly T[],
  group: BoardGroup,
  stops: readonly { id: string; name: string }[],
  opts: { canMoveStatus: boolean },
): BoardColumn<T>[] {
  if (group === "status") {
    return STATUS_COLUMNS.map((c) => ({
      key: c.status,
      title: c.title,
      cards: cards.filter((x) => (x.status === "done" ? "planned" : x.status) === c.status),
      drop: opts.canMoveStatus ? { status: c.status } : null,
    }));
  }
  const named = stops.filter((s) => s.name.trim());
  // A single unnamed default Stop: one column for everything.
  if (named.length === 0) return [{ key: stops[0]?.id ?? "__all", title: "All ideas", cards: [...cards], drop: null }];
  const cols: BoardColumn<T>[] = named.map((s) => ({
    key: s.id,
    title: s.name,
    cards: cards.filter((x) => x.stopId === s.id),
    drop: { stopId: s.id },
  }));
  const known = new Set(named.map((s) => s.id));
  const unsorted = cards.filter((x) => !x.stopId || !known.has(x.stopId));
  cols.push({ key: "__unsorted", title: "Unsorted", cards: unsorted, drop: { stopId: null } });
  return cols;
}
