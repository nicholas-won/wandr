"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { asService, getDb, users } from "@wandr/db";
import { createProvisionalUser, PROVISIONAL_NAME } from "@/lib/auth/provisional";
import { getSession, setFullSession } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { track } from "@/server/analytics";
import { addIdea, resolveIdeaJob } from "@/server/ideas";
import { createTrip, DEFAULT_TRIP_NAME } from "@/server/trips";

/**
 * FR-1 / P1: start a trip from a pasted link or just a name. No sign-up: the creator gets a
 * device session and verifies a phone only when they send invites.
 */
async function ensureUser() {
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
  return { db, userId, ownerName };
}

export async function startTripAction(formData: FormData) {
  const raw = String(formData.get("raw") ?? "").trim().slice(0, 4000);
  const { db, userId, ownerName } = await ensureUser();

  const looksLikeIdea = /https?:\/\//i.test(raw);
  const { tripId, memberId } = await createTrip(db, {
    userId,
    ownerName,
    name: looksLikeIdea || !raw ? DEFAULT_TRIP_NAME : raw,
  });
  after(() => track(db, { name: "trip_created", tripId, memberId, props: { via: looksLikeIdea ? "paste" : "name" } }));
  if (looksLikeIdea) {
    const { ideaId } = await addIdea(db, { sub: userId }, { tripId, memberId, raw });
    after(() => resolveIdeaJob(db, ideaId));
  }
  redirect(routes.trip(tripId));
}

const isoDate = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** FR-1(b) classic setup: name, destination(s), dates. Every field is optional (P1). */
export async function startClassicTripAction(formData: FormData) {
  const destinations = String(formData.get("destinations") ?? "")
    .split(/[,\n→>]+/)
    .map((d) => d.trim())
    .filter(Boolean);
  const name =
    String(formData.get("name") ?? "").trim() ||
    (destinations.length ? `${destinations.join(" + ")} trip` : DEFAULT_TRIP_NAME);
  const { db, userId, ownerName } = await ensureUser();
  const { tripId, memberId } = await createTrip(db, {
    userId,
    ownerName,
    name,
    destinations,
    startDate: isoDate(formData.get("start")),
    endDate: isoDate(formData.get("end")),
  });
  after(() =>
    track(db, { name: "trip_created", tripId, memberId, props: { via: "classic", destinations: destinations.length } }),
  );
  redirect(routes.trip(tripId));
}
