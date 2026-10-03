import { describe, expect, it } from "vitest";
import { parseDestinations, toISODate } from "./dates";

describe("dates", () => {
  it("formats local dates for the API", () => {
    expect(toISODate(new Date(2027, 4, 1))).toBe("2027-05-01");
  });
  it("parses destinations", () => {
    expect(parseDestinations(" Lisbon,  porto ; Lisbon\nSintra,, ")).toEqual(["Lisbon", "porto", "Sintra"]);
    expect(parseDestinations(Array.from({ length: 12 }, (_, i) => `C${i}`).join(","))).toHaveLength(8);
  });
});
