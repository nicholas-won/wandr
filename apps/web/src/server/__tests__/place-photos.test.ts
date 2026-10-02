/** Place photos for cards (FR-31): RLS visibility, cache refresh by place id, credit matching. */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { asService, ideas, members, savedIdeas, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { mapRawPlace, PlacesError, type PlacesClient } from "@wandr/ai";
import { photoSrc, shortHash } from "@/lib/idea-visual";
import { createTrip, getTripView } from "../trips";
import { setBachMode, setGuestOfHonor, setIdeaHiddenFrom } from "../surprise";
import { loadPhotoSubject, placePhotoResponse } from "../place-photos";

const PLACE = "ChIJRamiro_000000001";
const OLD = `places/${PLACE}/photos/old_photo_reference_1`;
const NEW = `places/${PLACE}/photos/new_photo_reference_2`;

function fakePlaces(photoName: string | null = NEW) {
  const client = {
    searchText: vi.fn(async () => []),
    getPlace: vi.fn(async (id: string) =>
      mapRawPlace({
        id,
        displayName: { text: "Cervejaria Ramiro" },
        photos: photoName ? [{ name: photoName, authorAttributions: [{ displayName: "Ana Silva" }] }] : [],
      }),
    ),
    fetchPhoto: vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8]), { headers: { "content-type": "image/jpeg" } })),
  };
  return client satisfies PlacesClient;
}

async function setup() {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const u = { ana: randomUUID(), bea: randomUUID(), cy: randomUUID() };
  await asService(d, (tx) =>
    tx.insert(users).values([
      { id: u.ana, displayName: "Ana" },
      { id: u.bea, displayName: "Bea" },
      { id: u.cy, displayName: "Cy" },
    ]),
  );
  const t = await createTrip(d, { userId: u.ana, ownerName: "Ana", name: "Lisbon", city: "Lisbon" });
  const ids = await asService(d, async (tx) => {
    const [bea] = await tx
      .insert(members)
      .values([
        { tripId: t.tripId, userId: u.bea, displayName: "Bea", status: "active" },
        { tripId: t.tripId, userId: u.cy, displayName: "Cy", status: "active" },
      ])
      .returning({ id: members.id });
    const [idea] = await tx
      .insert(ideas)
      .values({
        tripId: t.tripId,
        stopId: t.stopId,
        title: "Cervejaria Ramiro",
        category: "food",
        extraction: "resolved",
        placeId: PLACE,
        cityHint: "Lisbon",
        placeCache: {
          name: "Cervejaria Ramiro",
          neighborhood: "Arroios",
          photo: { name: OLD, widthPx: 100, heightPx: 100, attributions: [{ displayName: "Old Author", uri: null }] },
        },
        placeCachedAt: new Date(),
      })
      .returning({ id: ideas.id });
    const [save] = await tx
      .insert(savedIdeas)
      .values({ userId: u.ana, title: "Ramiro", extraction: "resolved", placeId: PLACE, placeCache: { name: "Ramiro" }, placeCachedAt: new Date() })
      .returning({ id: savedIdeas.id });
    return { bea: bea!.id, ideaId: idea!.id, saveId: save!.id };
  });
  return { d, u, ...t, ...ids };
}

describe("place photos", () => {
  it("cards carry the photo URL, the author credit and the filed-under line", async () => {
    const s = await setup();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    try {
      const view = await getTripView(s.d, { sub: s.u.cy }, s.tripId);
      const card = view!.ideas[0]!;
      expect(card.photo).toEqual({ src: photoSrc("idea", s.ideaId, OLD), attributions: [{ displayName: "Old Author", uri: null }] });
      expect(card.photoPrime).toBeNull();
      expect(card.locationLabel).toBe("Arroios, Lisbon · Food");
      expect(JSON.stringify(card)).not.toContain("test-key");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("streams a fresh cached photo without calling Place Details", async () => {
    const s = await setup();
    const places = fakePlaces();
    const subject = (await loadPhotoSubject(s.d, "idea", s.ideaId, [{ sub: s.u.cy }]))!;
    const res = await placePhotoResponse({ db: s.d, places, kind: "idea", id: s.ideaId, subject, v: shortHash(OLD), widthPx: 400 });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(places.getPlace).not.toHaveBeenCalled();
    expect(places.fetchPhoto).toHaveBeenCalledWith(OLD, { maxWidthPx: 400 });
  });

  it("refreshes a stale cache by place id; serves the photo whose credit is on screen", async () => {
    const s = await setup();
    await asService(s.d, (tx) =>
      tx.update(ideas).set({ placeCachedAt: new Date(Date.now() - 31 * 864e5) }).where(eq(ideas.id, s.ideaId)),
    );
    const places = fakePlaces();
    const subject = (await loadPhotoSubject(s.d, "idea", s.ideaId, [{ sub: s.u.cy }]))!;
    // The card on screen still shows the old credit → serve the old photo.
    const res = await placePhotoResponse({ db: s.d, places, kind: "idea", id: s.ideaId, subject, v: shortHash(OLD) });
    expect(res.status).toBe(200);
    expect(places.getPlace).toHaveBeenCalledWith(PLACE);
    expect(places.fetchPhoto).toHaveBeenCalledWith(OLD, expect.anything());
    const [row] = await asService(s.d, (tx) => tx.select().from(ideas).where(eq(ideas.id, s.ideaId)));
    expect((row!.placeCache as { photo: { name: string } }).photo.name).toBe(NEW);
    expect(Date.now() - row!.placeCachedAt!.getTime()).toBeLessThan(60_000);
    // Only the place id is long-term; the cache is display data (no bytes).
    expect(JSON.stringify(row!.placeCache)).not.toMatch(/data:|base64/);

    // An unknown version (credit not on screen) is refused.
    const fresh = (await loadPhotoSubject(s.d, "idea", s.ideaId, [{ sub: s.u.cy }]))!;
    const bad = await placePhotoResponse({ db: s.d, places, kind: "idea", id: s.ideaId, subject: fresh, v: "deadbeef" });
    expect(bad.status).toBe(404);
  });

  it("prime refreshes a pre-photo cache without fetching a photo; no photo → 404", async () => {
    const s = await setup();
    const places = fakePlaces(null);
    const subject = (await loadPhotoSubject(s.d, "save", s.saveId, [{ sub: s.u.ana }]))!;
    const res = await placePhotoResponse({ db: s.d, places, kind: "save", id: s.saveId, subject, prime: true });
    expect(res.status).toBe(204);
    expect(places.getPlace).toHaveBeenCalledOnce();
    expect(places.fetchPhoto).not.toHaveBeenCalled();
    const again = (await loadPhotoSubject(s.d, "save", s.saveId, [{ sub: s.u.ana }]))!;
    const res2 = await placePhotoResponse({ db: s.d, places, kind: "save", id: s.saveId, subject: again });
    expect(res2.status).toBe(404);
    expect(places.getPlace).toHaveBeenCalledOnce(); // fresh now: no second Details call
  });

  it("an expired photo name triggers one refresh and a 404 (card falls back)", async () => {
    const s = await setup();
    const places = fakePlaces();
    places.fetchPhoto.mockRejectedValueOnce(new PlacesError(400, "expired"));
    const subject = (await loadPhotoSubject(s.d, "idea", s.ideaId, [{ sub: s.u.cy }]))!;
    const res = await placePhotoResponse({ db: s.d, places, kind: "idea", id: s.ideaId, subject, v: shortHash(OLD) });
    expect(res.status).toBe(404);
    expect(places.getPlace).toHaveBeenCalledOnce();
  });

  it("no key or no place → 404; RLS decides who can load the item", async () => {
    const s = await setup();
    const subject = (await loadPhotoSubject(s.d, "idea", s.ideaId, [{ sub: s.u.cy }]))!;
    expect((await placePhotoResponse({ db: s.d, places: null, kind: "idea", id: s.ideaId, subject })).status).toBe(404);
    // Someone else's library save.
    expect(await loadPhotoSubject(s.d, "save", s.saveId, [{ sub: s.u.cy }])).toBeNull();
    // Surprise idea hidden from Bea (FR-91).
    await setBachMode(s.d, { sub: s.u.ana }, { tripId: s.tripId, on: true });
    await setGuestOfHonor(s.d, { sub: s.u.ana }, { tripId: s.tripId, memberId: s.bea, on: true });
    await setIdeaHiddenFrom(s.d, { sub: s.u.ana }, { ideaId: s.ideaId, memberIds: [s.bea] });
    expect(await loadPhotoSubject(s.d, "idea", s.ideaId, [{ sub: s.u.bea }])).toBeNull();
    expect(await loadPhotoSubject(s.d, "idea", s.ideaId, [{}])).toBeNull();
  });
});
