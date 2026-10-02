/** Cookie names and options. Neutral names: the product name lives only in @wandr/core/config. */
export const COOKIE = {
  /** Full session after a verified code. */
  session: "w_sid",
  /** Personal-link grants (FR-5). */
  links: "w_lnk",
  /** Random per-device id; its hash binds personal links to the first device (FR-5). */
  device: "w_dev",
  /** Shared-board link grants (FR-L14). */
  boards: "w_brd",
  /** Pending code challenge. */
  otp: "w_otp",
} as const;

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
