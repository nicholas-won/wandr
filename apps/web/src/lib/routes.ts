/**
 * App paths. The marketing site lives at `/`; the app's home is `/trips` (D64: a clear handoff
 * from the website into the app).
 */
export const routes = {
  /** Public marketing site. */
  site: "/",
  /** The app's home: your trips. */
  home: "/trips",
  /** Set up a new trip (classic setup or paste a link). */
  start: "/start",
  signin: (next?: string) => (next ? `/signin?next=${encodeURIComponent(next)}` : "/signin"),
  /** FR-16 / J-4: "Is this you?" after a long-inactive number signs in. */
  recheck: (next?: string) => (next ? `/recheck?next=${encodeURIComponent(next)}` : "/recheck"),
  /** Account settings: name, number, email, sign out, delete (FR-3, J-6). */
  account: "/account",
  accountDelete: "/account/delete",
  /** M-1/M-2: a removed member's money-only view of one trip. */
  settle: (tripId: string) => `/settle/${tripId}`,
  trip: (tripId: string) => `/t/${tripId}`,
  personalLink: (token: string) => `/l/${token}`,
};
