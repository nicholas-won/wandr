import { describe, expect, it } from "vitest";
import { boardColumns } from "./board";

const c = (id: string, stopId: string | null, status = "idea") => ({ id, stopId, status });
const stops = [
  { id: "lis", name: "Lisbon" },
  { id: "opo", name: "Porto" },
];

describe("board columns", () => {
  it("groups by city with an Unsorted column, keeping feed order", () => {
    const cols = boardColumns([c("a", "opo"), c("b", null), c("c", "lis"), c("d", "opo")], "city", stops, { canMoveStatus: false });
    expect(cols.map((x) => [x.title, x.cards.map((y) => y.id)])).toEqual([
      ["Lisbon", ["c"]],
      ["Porto", ["a", "d"]],
      ["Unsorted", ["b"]],
    ]);
    expect(cols[2]!.drop).toEqual({ stopId: null });
  });

  it("groups by status; only organizers can drop (FR-49)", () => {
    const cards = [c("a", null, "shortlisted"), c("b", null, "planned"), c("e", null, "done"), c("f", null, "idea")];
    const member = boardColumns(cards, "status", stops, { canMoveStatus: false });
    expect(member.map((x) => x.cards.map((y) => y.id))).toEqual([["f"], ["a"], ["b", "e"], []]);
    expect(member.every((x) => x.drop === null)).toBe(true);
    const org = boardColumns(cards, "status", stops, { canMoveStatus: true });
    expect(org[2]!.drop).toEqual({ status: "planned" });
  });

  it("a one-city trip with an unnamed Stop is a single column", () => {
    expect(boardColumns([c("a", "x")], "city", [{ id: "x", name: "" }], { canMoveStatus: true })).toHaveLength(1);
  });
});
