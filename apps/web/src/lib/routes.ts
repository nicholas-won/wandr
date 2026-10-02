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
  trip: (tripId: string) => `/t/${tripId}`,
  personalLink: (token: string) => `/l/${token}`,
};
