/**
 * Text throttling (FR-84, FR-85, FR-15; J-15, N-5). Pure decision logic; send.ts gathers counts.
 *
 * - Opted-out numbers (STOP/WRONG) and non-US/CA numbers never get texts: email instead.
 * - At most 1 non-time-sensitive text per person per rolling 24h, across ALL trips (J-15).
 * - At most ~12 non-time-sensitive texts per member per trip.
 * - A daily estimated-spend cap applies to every text (anti-pumping, NFR-6).
 * When a text is refused, fall back to email if we have one, otherwise don't send.
 */
export const THROTTLE = {
  perPersonPerDay: 1,
  perMemberPerTrip: 12,
} as const;

export type ThrottleInput = {
  timeSensitive: boolean;
  /** STOP, informal opt-out or WRONG on this number (FR-85, J-4). */
  optedOut: boolean;
  /** US/CA number (FR-14). */
  smsSupported: boolean;
  hasEmail: boolean;
  /** Non-time-sensitive texts to this phone in the last 24h, any trip. */
  sentToPersonLast24h: number;
  /** Non-time-sensitive texts to this member in this trip, ever. */
  sentToMemberThisTrip: number;
  spendTodayMicros: number;
  estimatedCostMicros: number;
  dailyCapMicros: number;
};

export type ThrottleReason =
  | "opted_out"
  | "sms_unsupported"
  | "daily_person_cap"
  | "trip_cap"
  | "spend_cap";

export type ThrottleDecision =
  | { channel: "sms" }
  | { channel: "email"; reason: ThrottleReason }
  | { channel: "none"; reason: ThrottleReason };

export function decideText(i: ThrottleInput, limits = THROTTLE): ThrottleDecision {
  const refuse = (reason: ThrottleReason): ThrottleDecision =>
    i.hasEmail ? { channel: "email", reason } : { channel: "none", reason };

  if (i.optedOut) return refuse("opted_out");
  if (!i.smsSupported) return refuse("sms_unsupported");
  if (!i.timeSensitive) {
    if (i.sentToPersonLast24h >= limits.perPersonPerDay) return refuse("daily_person_cap");
    if (i.sentToMemberThisTrip >= limits.perMemberPerTrip) return refuse("trip_cap");
  }
  if (i.spendTodayMicros + i.estimatedCostMicros > i.dailyCapMicros) return refuse("spend_cap");
  return { channel: "sms" };
}
