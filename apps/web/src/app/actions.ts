"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { asService, getDb, users } from "@wandr/db";
import { PROVISIONAL_NAME } from "@/lib/auth/provisional";
import { getSession } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { libraryRoutes } from "@/lib/library-routes";
import { track } from "@/server/analytics";
import { EVENTS } from "@/inngest/client";
import { enqueue } from "@/server/jobs";
import { queueStopGeocode } from "@/server/geocode";
import { saveToLibrary } from "@/server/library";
import { createTrip, DEFAULT_TRIP_NAME } from "@/server/trips";

/**

/**
 * D74: trips and saves belong to a verified phone number from the start. Anyone not signed in is
 * sent to sign up first and comes back to /start.
 */
async function ensureUser() {
  const db = await getDb();
  const session = await getSession();
  const user = session.user;
  if (!user || user.provisional) redirect(routes.signin(routes.start));
  const [u] = await asService(db, (tx) =>
    tx.select({ n: users.displayName }).from(users).where(eq(users.id, user.userId)),
  );
  return { db, userId: user.userId, ownerName: u?.n || PROVISIONAL_NAME };
}

/**
 * FR-1(a) / FR-L1: a pasted link with no trip saves to the person's library FIRST; the save
 * page then offers "Start a trip around this?" with a suggested name and Stop. Typing just a
 * name still creates the trip directly (P1).
 */
export async function startTripAction(formData: FormData) {
  const raw = String(formData.get("raw") ?? "").trim().slice(0, 4000);
  const { db, userId, ownerName } = await ensureUser();

  if (/https?:\/\//i.test(raw)) {
    const { savedIdeaId } = await saveToLibrary(db, userId, { raw });
    await enqueue({ name: EVENTS.savedIdeaAdded, data: { savedIdeaId } });
    redirect(`${libraryRoutes.save(savedIdeaId)}?new=1`);
  }
  const { tripId, memberId } = await createTrip(db, { userId, ownerName, name: raw || DEFAULT_TRIP_NAME });
  after(() => track(db, { name: "trip_created", tripId, memberId, props: { via: "name" } }));
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
  if (destinations.length) await queueStopGeocode(tripId, { force: true }); // FR-S6 / FR-O16
  after(() =>
    track(db, { name: "trip_created", tripId, memberId, props: { via: "classic", destinations: destinations.length } }),
  );
  redirect(routes.trip(tripId));
}
