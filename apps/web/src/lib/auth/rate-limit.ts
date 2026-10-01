/**
 * Sign-in code abuse limits (FR-15, J-16, J-17). Pure decision logic; counts come from
 * `otp_requests` (see signin.ts).
 */
export type OtpCounts = {
  /** Requests to this phone/email in the last 10 minutes / 24 hours. */
  destination10m: number;
  destinationDay: number;
  /** Requests from this IP in the last 10 minutes / 24 hours. */
  ip10m: number;
  ipDay: number;
  /** Requests tied to this trip (group-link joins) in the last 24 hours. */
  tripDay: number;
};

export const OTP_LIMITS = {
  destination10m: 3,
  destinationDay: 10,
  ip10m: 10,
  ipDay: 30,
  tripDay: 40,
  /** CAPTCHA once a destination or IP is asking again (J-16). */
  captchaAfterDestination10m: 1,
  captchaAfterIp10m: 3,
  /** Wrong codes allowed per challenge (J-17). */
  maxAttempts: 5,
} as const;

export type OtpDecision =
  | { kind: "allow"; captcha: boolean }
  | { kind: "limited"; scope: "destination" | "ip" | "trip" };

export function decideOtpRequest(c: OtpCounts, limits = OTP_LIMITS): OtpDecision {
  if (c.destination10m >= limits.destination10m || c.destinationDay >= limits.destinationDay) {
    return { kind: "limited", scope: "destination" };
  }
  if (c.ip10m >= limits.ip10m || c.ipDay >= limits.ipDay) return { kind: "limited", scope: "ip" };
  if (c.tripDay >= limits.tripDay) return { kind: "limited", scope: "trip" };
  const captcha =
    c.destination10m >= limits.captchaAfterDestination10m || c.ip10m >= limits.captchaAfterIp10m;
  return { kind: "allow", captcha };
}

export function attemptsExhausted(failedAttempts: number, limits = OTP_LIMITS): boolean {
  return failedAttempts >= limits.maxAttempts;
}

/** Recycled-number check (FR-16, J-4): a previously known person inactive for 60+ days. */
export const RECHECK_INACTIVE_DAYS = 60;

export function needsRecycledNumberCheck(
  lastSignInAt: Date | null,
  isNewUser: boolean,
  now: Date = new Date(),
): boolean {
  if (isNewUser || !lastSignInAt) return false;
  return now.getTime() - lastSignInAt.getTime() > RECHECK_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
}
