import { describe, expect, it } from "vitest";
import { bookingDecisionGate, metricsBySize, segmentMetrics, type TripMetricsInput } from "../src/metrics";

const trip = (o: Partial<TripMetricsInput>): TripMetricsInput => ({
  tripId: "t",
  size: "group",
  invited: 0,
  joined: 0,
  activeMembers: 1,
  voters: 0,
  ideas: 0,
  aiResolved: 0,
  aiFixed: 0,
  pollsClosed: 0,
  pollsDecidedByDeadline: 0,
  receipts: 0,
  decidedStays: [],
  costMicros: 0,
  revenueMicros: 0,
  ...o,
});

describe("metrics", () => {
  it("computes rates with explicit numerators and denominators", () => {
    const m = segmentMetrics([
      trip({ invited: 5, joined: 3, activeMembers: 4, voters: 3, ideas: 12, aiResolved: 10, aiFixed: 2, receipts: 1, costMicros: 3_000_000 }),
      trip({ invited: 5, joined: 4, activeMembers: 5, voters: 2, ideas: 8, aiResolved: 10, aiFixed: 1, costMicros: 2_000_000 }),
    ]);
    expect(m.inviteJoinRate).toEqual({ numerator: 7, denominator: 10, value: 0.7 });
    expect(m.ideasPerTrip).toBe(10);
    expect(m.aiResolvedWithoutFix.numerator).toBe(17);
    expect(m.memberVoteRate.value).toBeCloseTo(5 / 9);
    expect(m.tripsWithReceipt.value).toBe(0.5);
    expect(m.avgCostMicros).toBe(2_500_000);
    expect(m.avgContributionMicros).toBe(-2_500_000);
  });

  it("handles empty segments without dividing by zero", () => {
    const m = segmentMetrics([]);
    expect(m.inviteJoinRate.value).toBeNull();
    expect(m.ideasPerTrip).toBeNull();
    expect(m.avgCostMicros).toBeNull();
  });

  it("segments by trip size (FR-T12)", () => {
    const by = metricsBySize([trip({ size: "duo" }), trip({ size: "duo" }), trip({ size: "solo" })]);
    expect(by.duo.trips).toBe(2);
    expect(by.solo.trips).toBe(1);
    expect(by.group.trips).toBe(0);
    expect(by.all.trips).toBe(3);
  });

  it("applies the §11 booking decision gate only with enough data", () => {
    const stays = (k: number, booking: number) =>
      Array.from({ length: k }, (_, i) => ({ provider: i < booking ? "booking" : "airbnb" }));
    expect(bookingDecisionGate(segmentMetrics([trip({ decidedStays: stays(5, 5) })]).bookableStayShare)).toBe("insufficient_data");
    expect(bookingDecisionGate(segmentMetrics([trip({ decidedStays: stays(20, 4) })]).bookableStayShare)).toBe("deprioritize_links");
    expect(bookingDecisionGate(segmentMetrics([trip({ decidedStays: stays(20, 8) })]).bookableStayShare)).toBe("links_viable");
  });
});
