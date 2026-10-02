/**
 * Product + commercial-intent events (§11, §12). Stored in `events` (stamped with trip size for
 * FR-T12 segmentation) and forwarded to PostHog when configured. Never used for ranking.
 * Never include phone numbers, emails, money amounts per person, or vote values.
 */
import { eq } from "drizzle-orm";
import { asService, events, trips, type Db } from "@wandr/db";

export type EventName =
  | "trip_created"
  | "idea_added"
  | "idea_fixed"
  | "vote_cast"
  | "invite_sent"
  | "plan_applied"
  | "booking_link_click";

export async function track(
  db: Db,
  e: { name: EventName; tripId?: string | null; memberId?: string | null; props?: Record<string, unknown> },
): Promise<void> {
  try {
    await asService(db, async (tx) => {
      const size = e.tripId
        ? ((await tx.select({ size: trips.size }).from(trips).where(eq(trips.id, e.tripId)))[0]?.size ?? null)
        : null;
      await tx.insert(events).values({
        name: e.name,
        tripId: e.tripId ?? null,
        memberId: e.memberId ?? null,
        props: e.props ?? null,
        tripSize: size,
      });
      await forwardToPostHog(e, size);
    });
  } catch (err) {
    console.error("[track]", e.name, err);
  }
}

async function forwardToPostHog(e: { name: string; tripId?: string | null; memberId?: string | null; props?: Record<string, unknown> }, size: string | null) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: e.name,
      distinct_id: e.memberId ?? e.tripId ?? "anonymous",
      properties: { ...e.props, trip_id: e.tripId, trip_size: size },
    }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => undefined);
}
