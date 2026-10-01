"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { asService, getDb, users } from "@wandr/db";
import { createProvisionalUser, PROVISIONAL_NAME } from "@/lib/auth/provisional";
import { getSession, setFullSession } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { addIdea, resolveIdeaJob } from "@/server/ideas";
import { createTrip, DEFAULT_TRIP_NAME } from "@/server/trips";

/**
 * FR-1 / P1: start a trip from a pasted link or just a name. No sign-up: the creator gets a
 * device session and verifies a phone only when they send invites.
 */
export async function startTripAction(formData: FormData) {
  const raw = String(formData.get("raw") ?? "").trim().slice(0, 4000);
  const db = await getDb();
  const session = await getSession();
  let userId = session.user?.userId;
  let ownerName = PROVISIONAL_NAME;
  if (!userId) {
    userId = await asService(db, (tx) => createProvisionalUser(tx));
    await setFullSession({ userId, needsRecheck: false, provisional: true });
  } else {
    const id = userId;
    const [u] = await asService(db, (tx) =>
      tx.select({ n: users.displayName }).from(users).where(eq(users.id, id)),
    );
    ownerName = u?.n || PROVISIONAL_NAME;
  }

  const looksLikeIdea = /https?:\/\//i.test(raw);
  const { tripId, memberId } = await createTrip(db, {
    userId,
    ownerName,
    name: looksLikeIdea || !raw ? DEFAULT_TRIP_NAME : raw,
  });
  if (looksLikeIdea) {
    const { ideaId } = await addIdea(db, { sub: userId }, { tripId, memberId, raw });
    after(() => resolveIdeaJob(db, ideaId));
  }
  redirect(routes.trip(tripId));
}
