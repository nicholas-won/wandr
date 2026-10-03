/** Per-trip "last visit" cookie for What's new (D65). Device-local by design. */
export const seenCookieName = (tripId: string) => `wn_${tripId.replace(/[^a-z0-9-]/gi, "")}`;
