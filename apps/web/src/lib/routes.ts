/** App paths used by the platform layer. The trip page itself is built by the hero slice. */
export const routes = {
  home: "/",
  signin: (next?: string) => (next ? `/signin?next=${encodeURIComponent(next)}` : "/signin"),
  trip: (tripId: string) => `/t/${tripId}`,
  personalLink: (token: string) => `/l/${token}`,
};
