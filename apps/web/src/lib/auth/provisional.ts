/**
 * Zero-setup creators (P1, FR-1): a trip can be started before anyone verifies a phone. The
 * creator gets a device-only "provisional" user. When they later verify a number that already
 * belongs to someone, everything the provisional user owns moves to that verified user.
 */
import { and, eq, notInArray, sql } from "drizzle-orm";
import { members, savedIdeas, trips, users, type Tx } from "@wandr/db";

/** Member name until the creator tells us theirs (asked when they verify to send invites). */
export const PROVISIONAL_NAME = "Me";

export async function createProvisionalUser(tx: Tx): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ displayName: "" })
    .returning({ id: users.id });
  return u!.id;
}

export async function adoptProvisionalUser(tx: Tx, fromUserId: string, toUserId: string) {
  const theirTrips = tx.select({ id: members.tripId }).from(members).where(eq(members.userId, toUserId));
  await tx
    .update(members)
    .set({ userId: toUserId })
    .where(and(eq(members.userId, fromUserId), notInArray(members.tripId, theirTrips)));
  await tx.update(trips).set({ createdBy: toUserId }).where(eq(trips.createdBy, fromUserId));
  // Library saves: keep one per place (FR-L5); saves without a place always move.
  const theirPlaces = tx
    .select({ p: savedIdeas.placeId })
    .from(savedIdeas)
    .where(and(eq(savedIdeas.userId, toUserId), sql`${savedIdeas.placeId} is not null`));
  await tx
    .update(savedIdeas)
    .set({ userId: toUserId })
    .where(
      and(
        eq(savedIdeas.userId, fromUserId),
        sql`(${savedIdeas.placeId} is null or ${savedIdeas.placeId} not in (${theirPlaces}))`,
      ),
    );
}
