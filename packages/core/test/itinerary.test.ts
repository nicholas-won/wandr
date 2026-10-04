import { describe, expect, it } from "vitest";
import { stopDateLine, tripSummary } from "../src/itinerary";

const s = (name: string, startDate: string | null, endDate: string | null, nights: number | null = null) => ({ name, startDate, endDate, nights });

describe("itinerary dates", () => {
  it("formats a Stop's dates and length", () => {
    expect(stopDateLine(s("Lisbon", "2026-10-09", "2026-10-12"))).toEqual({ range: "Fri, Oct 9 → Mon, Oct 12", length: "3 nights" });
    expect(stopDateLine(s("Porto", null, null, 2))).toEqual({ range: null, length: "About 2 nights" });
    expect(stopDateLine(s("Porto", null, null))).toEqual({ range: null, length: null });
    expect(stopDateLine(s("X", "2026-10-09", "2026-10-10")).length).toBe("1 night");
  });

  it("summarizes the route and the whole date span", () => {
    expect(tripSummary([s("Lisbon", "2026-10-09", "2026-10-12"), s("Porto", "2026-10-12", "2026-10-15")])).toBe(
      "Lisbon → Porto · Oct 9 – 15 · 6 nights",
    );
    expect(tripSummary([s("Lisbon", "2026-10-29", "2026-11-02")])).toBe("Lisbon · Oct 29 – Nov 2 · 4 nights");
    expect(tripSummary([s("Tokyo", "2026-12-30", "2027-01-03")])).toBe("Tokyo · Dec 30, 2026 – Jan 3, 2027 · 4 nights");
    expect(tripSummary([s("Lisbon", null, null, 3), s("Porto", null, null, 2)])).toBe("Lisbon → Porto · about 5 nights");
    expect(tripSummary([s("", null, null)])).toBeNull();
  });
});
