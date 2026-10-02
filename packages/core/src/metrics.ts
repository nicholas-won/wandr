/**
 * POC success metrics (§12) and per-trip unit economics (§11 "internal dashboard of cost vs.
 * revenue per trip"). Pure aggregation over plain rows; always segmented by trip size (FR-T12).
 * Nothing here feeds rankings or votes (§11 trust rules).
 */
import type { TripSize } from "./domain";

export interface TripMetricsInput {
  tripId: string;
  size: TripSize;
  invited: number;
  /** Invitees who became active. */
  joined: number;
  activeMembers: number;
  /** Active members who voted at least once. */
  voters: number;
  ideas: number;
  /** AI-resolved ideas, and those a member had to fix (FR-23). */
  aiResolved: number;
  aiFixed: number;
  pollsClosed: number;
  pollsDecidedByDeadline: number;
  receipts: number;
  /** Decided Stays and the site each came from (detectLodging provider, or "direct"/"unknown"). */
  decidedStays: { provider: string }[];
  /** Variable cost in micros of a US dollar (SMS + AI + places). */
  costMicros: number;
  /** Revenue in micros (always 0 in the POC: no monetization, D51). */
  revenueMicros: number;
}

export interface Rate {
  numerator: number;
  denominator: number;
  /** Null when the denominator is 0. Display only. */
  value: number | null;
}

const rate = (numerator: number, denominator: number): Rate => ({
  numerator,
  denominator,
  value: denominator > 0 ? numerator / denominator : null,
});

/** Booking sites that pay a commission (§11): Airbnb doesn't; Vrbo pays 2%; Booking.com ~3.75%. */
export const COMMISSION_PROVIDERS = new Set(["booking", "vrbo", "expedia", "hotels"]);

export interface SegmentMetrics {
  trips: number;
  inviteJoinRate: Rate; // target > 60%
  ideasPerTrip: number | null; // target > 10
  aiResolvedWithoutFix: Rate; // target > 70%
  memberVoteRate: Rate; // target > 60%
  pollsDecidedByDeadline: Rate; // target > 70%
  tripsWithReceipt: Rate; // target > 50%
  bookableStayShare: Rate; // decision gate at 30%
  avgCostMicros: number | null;
  avgRevenueMicros: number | null;
  avgContributionMicros: number | null;
}

export function segmentMetrics(rows: readonly TripMetricsInput[]): SegmentMetrics {
  const sum = (f: (r: TripMetricsInput) => number) => rows.reduce((a, r) => a + f(r), 0);
  const n = rows.length;
  const stays = rows.flatMap((r) => r.decidedStays);
  const avg = (total: number) => (n ? Math.round(total / n) : null);
  const cost = sum((r) => r.costMicros);
  const revenue = sum((r) => r.revenueMicros);
  return {
    trips: n,
    inviteJoinRate: rate(sum((r) => r.joined), sum((r) => r.invited)),
    ideasPerTrip: n ? sum((r) => r.ideas) / n : null,
    aiResolvedWithoutFix: rate(sum((r) => r.aiResolved - r.aiFixed), sum((r) => r.aiResolved)),
    memberVoteRate: rate(sum((r) => r.voters), sum((r) => r.activeMembers)),
    pollsDecidedByDeadline: rate(sum((r) => r.pollsDecidedByDeadline), sum((r) => r.pollsClosed)),
    tripsWithReceipt: rate(rows.filter((r) => r.receipts > 0).length, n),
    bookableStayShare: rate(stays.filter((s) => COMMISSION_PROVIDERS.has(s.provider)).length, stays.length),
    avgCostMicros: avg(cost),
    avgRevenueMicros: avg(revenue),
    avgContributionMicros: avg(revenue - cost),
  };
}

/** FR-T12: every metric segmented by trip size, plus an "all" row. */
export function metricsBySize(rows: readonly TripMetricsInput[]): Record<TripSize | "all", SegmentMetrics> {
  return {
    solo: segmentMetrics(rows.filter((r) => r.size === "solo")),
    duo: segmentMetrics(rows.filter((r) => r.size === "duo")),
    group: segmentMetrics(rows.filter((r) => r.size === "group")),
    all: segmentMetrics(rows),
  };
}

/** §11 decision rule: under 30% bookable through commission sites → plan around $3–12/trip from links. */
export function bookingDecisionGate(share: Rate): "insufficient_data" | "links_viable" | "deprioritize_links" {
  if (share.denominator < 20 || share.value === null) return "insufficient_data";
  return share.value >= 0.3 ? "links_viable" : "deprioritize_links";
}
