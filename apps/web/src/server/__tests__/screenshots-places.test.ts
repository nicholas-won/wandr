/**
 * Screenshot ideas (FR-20, FR-30 step 2, FR-L1) and the place picker (FR-23 "wrong place? fix",
 * FR-L20 add by hand, FR-L22 never an import), against PGlite + RLS. No network: the resolver,
 * the Places client and storage are faked.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { aiImports, asService, ideas, ideaSources, members, savedIdeas, savedIdeaSources, stops, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import {
  createMemoryRateLimiter,
  mapRawPlace,
  type PlaceCandidate,
  type PlacesClient,
  type ResolvedIdea,
  type ResolveInput,
  type resolveIdea,
} from "@wandr/ai";
import { localStorageAdapter } from "@/lib/storage/objects";
import {
  addIdea,
  addIdeaFromPlace,
  addScreenshotIdea,
  fixIdea,
  IdeaInputError,
  pickPlaceForIdea,
  resolveIdeaJob,
  searchPlacesForTrip,
} from "../ideas";
import {
  getSave,
  pickPlaceForSave,
  resolveSavedIdeaJob,
  saveFromPlace,
  saveScreenshot,
  searchPlacesForLibrary,
  updateSaveSort,
} from "../library";
import { PlacePickError, searchPlaces, setPlaceSearchLimiterForTests } from "../place-search";
import { openScreenshot } from "../screenshots";
import { createTrip, getTripView } from "../trips";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const HEIC = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0]);

const RAMIRO = mapRawPlace({
  id: "ChIJramiro0001",
  displayName: { text: "Cervejaria Ramiro" },
  formattedAddress: "Av. Almirante Reis 1, Lisboa",
  location: { latitude: 38.7206, longitude: -9.1357 },
  businessStatus: "OPERATIONAL",
  rating: 4.5,
  userRatingCount: 30000,
  primaryType: "seafood_restaurant",
  types: ["seafood_restaurant", "restaurant", "food"],
  addressComponents: [
    { longText: "Lisboa", types: ["locality"] },
    { shortText: "PT", types: ["country"] },
  ],
})!;
const CLOSED_BAR = mapRawPlace({
  id: "ChIJclosedbar01",
  displayName: { text: "Old Bar" },
  location: { latitude: 38.71, longitude: -9.14 },
  businessStatus: "CLOSED_PERMANENTLY",
  primaryType: "bar",
  addressComponents: [{ longText: "Lisboa", types: ["locality"] }],
})!;

function fakePlaces(list: PlaceCandidate[] = [RAMIRO, CLOSED_BAR]): PlacesClient & { searches: unknown[] } {
  const searches: unknown[] = [];
  return {
    searches,
    async searchText(req) {
      searches.push(req);
      return list;
    },
    async getPlace(id) {
      return list.find((c) => c.placeId === id) ?? null;
    },
    async fetchPhoto() {
      throw new Error("no photos in tests");
    },
  };
}

/** Records what the resolver was handed, and answers with a resolved place. */
function recordingResolver(calls: ResolveInput[], over: Partial<ResolvedIdea> = {}): typeof resolveIdea {
  return (async (input: ResolveInput) => {
    calls.push(input);
    return {
      state: "resolved",
      kind: "place",
      source: {
        kind: "text",
        url: null,
        normalizedUrl: null,
        caption: null,
        title: null,
        thumbnailUrl: null,
        creatorHandle: null,
        fetchStatus: "skipped",
      },
      places: [],
      primary: {
        name: "Cervejaria Ramiro",
        category: "food",
        summary: "Seafood hall",
        cityHint: "Lisbon",
        country: "PT",
        regionOrCity: "Lisbon",
        addressHint: null,
        searchQuery: "Cervejaria Ramiro Lisbon",
        priceLevel: 2,
        evidence: "on_screen_text",
        confidence: 0.9,
        needsReview: false,
        reviewReasons: [],
        stopId: null,
        distanceToStopKm: null,
        placeId: "ChIJramiro0001",
        display: null,
        location: { lat: 38.72, lng: -9.13 },
        permanentlyClosed: false,
        temporarilyClosed: false,
        chain: null,
      },
      confidence: 0.9,
      needsReview: false,
      isNonPlaceReason: null,
      suggestedTripName: null,
      suspiciousInstructions: false,
      extractor: "claude",
      model: "claude-opus-5-5",
      warnings: [],
      fromCache: false,
      countsAsImport: true,
      ...over,
    } as ResolvedIdea;
  }) as unknown as typeof resolveIdea;
}

async function setup() {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const uid = randomUUID();
  await asService(d, (tx) => tx.insert(users).values({ id: uid, displayName: "Nick" }));
  const t = await createTrip(d, { userId: uid, ownerName: "Nick", name: "Lisbon", city: "Lisbon" });
  // Sam joined through a personal link only (view + vote, FR-5).
  const [sam] = await asService(d, (tx) =>
    tx.insert(members).values({ tripId: t.tripId, displayName: "Sam", status: "active" }).returning({ id: members.id }),
  );
  const storage = localStorageAdapter(mkdtempSync(join(tmpdir(), "wandr-shots-")));
  return { d, uid, owner: { sub: uid }, link: { link_member: sam!.id }, storage, ...t };
}

describe("screenshot ideas (FR-20, FR-30)", () => {
  it("stores the image privately, shows a processing card, then the model reads it", async () => {
    const s = await setup();
    const { ideaId } = await addScreenshotIdea(s.d, s.owner, { tripId: s.tripId, bytes: PNG, note: "this place!!" }, s.storage);
    let view = await getTripView(s.d, s.owner, s.tripId);
    expect(view!.ideas[0]!.processing).toBe(true);

    const calls: ResolveInput[] = [];
    await resolveIdeaJob(s.d, ideaId, { resolver: recordingResolver(calls), storage: s.storage });
    expect(calls[0]!.screenshot).toEqual({ base64: Buffer.from(PNG).toString("base64"), mediaType: "image/png" });
    // The typed note is untrusted data next to the image, never an instruction (C-21).
    expect(calls[0]!.raw).toBe("this place!!");

    view = await getTripView(s.d, s.owner, s.tripId);
    const card = view!.ideas[0]!;
    expect(card).toMatchObject({ title: "Cervejaria Ramiro", processing: false, needsReview: false, stopId: s.stopId });
    // No place photo in tests → the screenshot is the card's visual, through the private route.
    const [src] = await asService(s.d, (tx) => tx.select().from(ideaSources).where(eq(ideaSources.ideaId, ideaId)));
    expect(card.thumbnailUrl).toBe(`/api/screenshot/idea/${src!.id}`);
    expect(src!.caption).toBe("this place!!");

    // Logged like any other import (FR-L22): a screenshot is a new AI read.
    const imports = await asService(s.d, (tx) => tx.select().from(aiImports));
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({ kind: "extraction", counted: true });
  });

  it("without the model, the card asks 'Is this right?' (heuristic can't read images)", async () => {
    const s = await setup();
    const { ideaId } = await addScreenshotIdea(s.d, s.owner, { tripId: s.tripId, bytes: PNG }, s.storage);
    await resolveIdeaJob(s.d, ideaId, {
      storage: s.storage,
      resolver: recordingResolver([], { state: "needs_review", needsReview: true, primary: null, extractor: "heuristic" }),
    });
    const view = await getTripView(s.d, s.owner, s.tripId);
    expect(view!.ideas[0]).toMatchObject({ needsReview: true, title: "Screenshot idea" });
  });

  it("sniffs the bytes: not an image, HEIC, too large and empty are refused before storing", async () => {
    const s = await setup();
    const add = (bytes: Uint8Array) => addScreenshotIdea(s.d, s.owner, { tripId: s.tripId, bytes }, s.storage);
    await expect(add(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/JPEG or PNG/);
    await expect(add(HEIC)).rejects.toThrow(/HEIC/);
    await expect(add(new Uint8Array(0))).rejects.toThrow(/empty/);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG);
    await expect(add(big)).rejects.toThrow(/10 MB/);
    expect(await asService(s.d, (tx) => tx.select().from(ideas))).toHaveLength(0);
  });

  it("personal-link sessions and outsiders can't upload (FR-5), but members can view it", async () => {
    const s = await setup();
    await expect(addScreenshotIdea(s.d, s.link, { tripId: s.tripId, bytes: PNG }, s.storage)).rejects.toBeInstanceOf(IdeaInputError);
    await expect(addScreenshotIdea(s.d, { sub: randomUUID() }, { tripId: s.tripId, bytes: PNG }, s.storage)).rejects.toThrow();

    const { ideaId } = await addScreenshotIdea(s.d, s.owner, { tripId: s.tripId, bytes: PNG }, s.storage);
    const [src] = await asService(s.d, (tx) => tx.select().from(ideaSources).where(eq(ideaSources.ideaId, ideaId)));
    const forLink = await openScreenshot(s.d, "idea", src!.id, [s.link], s.storage);
    expect(forLink?.contentType).toBe("image/png");
    expect(await openScreenshot(s.d, "idea", src!.id, [{ sub: randomUUID() }], s.storage)).toBeNull();
    expect(await openScreenshot(s.d, "idea", src!.id, [{}], s.storage)).toBeNull();
    // A source id from the other kind never resolves.
    expect(await openScreenshot(s.d, "save", src!.id, [s.owner], s.storage)).toBeNull();
  });

  it("library: save a screenshot, resolve it, only the owner sees the image (FR-L1)", async () => {
    const s = await setup();
    const { savedIdeaId } = await saveScreenshot(s.d, s.uid, { bytes: PNG }, s.storage);
    const calls: ResolveInput[] = [];
    await resolveSavedIdeaJob(s.d, savedIdeaId, { resolver: recordingResolver(calls), storage: s.storage });
    expect(calls[0]!.screenshot?.mediaType).toBe("image/png");
    const save = await getSave(s.d, s.uid, savedIdeaId);
    expect(save).toMatchObject({ title: "Cervejaria Ramiro", needsReview: false });
    const [src] = await asService(s.d, (tx) =>
      tx.select().from(savedIdeaSources).where(eq(savedIdeaSources.savedIdeaId, savedIdeaId)),
    );
    expect(save!.thumbnailUrl).toBe(`/api/screenshot/save/${src!.id}`);
    expect(await openScreenshot(s.d, "save", src!.id, [s.owner], s.storage)).not.toBeNull();
    expect(await openScreenshot(s.d, "save", src!.id, [{ sub: randomUUID() }], s.storage)).toBeNull();
    const imports = await asService(s.d, (tx) => tx.select().from(aiImports));
    expect(imports[0]).toMatchObject({ kind: "extraction", counted: true });
  });
});

describe("place picker (FR-23, FR-L20, FR-L22)", () => {
  it("search is biased to the idea's Stop and returns 5 rows of display data", async () => {
    const s = await setup();
    await asService(s.d, (tx) => tx.update(stops).set({ lat: 38.72, lng: -9.14 }).where(eq(stops.id, s.stopId)));
    const { ideaId } = await addIdea(s.d, s.owner, { tripId: s.tripId, memberId: s.memberId, raw: "ramiro" });
    await asService(s.d, (tx) => tx.update(ideas).set({ stopId: s.stopId }).where(eq(ideas.id, ideaId)));
    const places = fakePlaces();
    const r = await searchPlacesForTrip(s.d, s.owner, { tripId: s.tripId, ideaId, query: "ramiro" }, { places });
    expect(places.searches[0]).toMatchObject({ textQuery: "ramiro", maxResults: 5, locationBias: { center: { lat: 38.72, lng: -9.14 } } });
    expect(r).toMatchObject({
      connected: true,
      results: [
        { placeId: "ChIJramiro0001", name: "Cervejaria Ramiro", address: "Av. Almirante Reis 1, Lisboa", rating: 4.5 },
        { placeId: "ChIJclosedbar01", permanentlyClosed: true },
      ],
    });
  });

  it("no Google key → 'not connected'; picking says so too", async () => {
    const s = await setup();
    expect(await searchPlacesForTrip(s.d, s.owner, { tripId: s.tripId, query: "ramiro" }, { places: null })).toEqual({
      connected: false,
    });
    const { ideaId } = await addIdea(s.d, s.owner, { tripId: s.tripId, memberId: s.memberId, raw: "ramiro" });
    await expect(
      pickPlaceForIdea(s.d, s.owner, { tripId: s.tripId, ideaId, placeId: "ChIJramiro0001" }, { places: null }),
    ).rejects.toBeInstanceOf(PlacePickError);
  });

  it("rate-limits searches per person per minute", async () => {
    setPlaceSearchLimiterForTests(createMemoryRateLimiter(2, 60_000));
    try {
      const places = fakePlaces();
      const go = (actor: string) => searchPlaces({ actor, query: "ramiro" }, { places });
      expect(await go("a")).toMatchObject({ connected: true, results: expect.any(Array) });
      await go("a");
      expect(await go("a")).toEqual({ connected: true, rateLimited: true });
      expect(await go("b")).toMatchObject({ results: expect.any(Array) });
      // Too-short queries never reach Google.
      expect(await searchPlaces({ actor: "c", query: " r " }, { places })).toEqual({ connected: true, results: [] });
      expect(places.searches).toHaveLength(3);
    } finally {
      setPlaceSearchLimiterForTests(undefined);
    }
  });

  it("picking fixes the card: place id, cache, pin, category, city, closed flag, Stop; no import logged", async () => {
    const s = await setup();
    await asService(s.d, (tx) => tx.update(stops).set({ lat: 38.72, lng: -9.14 }).where(eq(stops.id, s.stopId)));
    const { ideaId } = await addIdea(s.d, s.owner, { tripId: s.tripId, memberId: s.memberId, raw: "that seafood place" });
    await asService(s.d, (tx) => tx.update(ideas).set({ extraction: "needs_review", confidence: 0.3 }).where(eq(ideas.id, ideaId)));

    await pickPlaceForIdea(s.d, s.owner, { tripId: s.tripId, ideaId, placeId: "ChIJramiro0001" }, { places: fakePlaces() });
    const [row] = await asService(s.d, (tx) => tx.select().from(ideas).where(eq(ideas.id, ideaId)));
    expect(row).toMatchObject({
      title: "Cervejaria Ramiro",
      placeId: "ChIJramiro0001",
      category: "food",
      cityHint: "Lisboa",
      lat: 38.7206,
      lng: -9.1357,
      permanentlyClosed: false,
      extraction: "resolved",
      confidence: 1,
      stopId: s.stopId,
    });
    expect(row!.placeCache).toMatchObject({ name: "Cervejaria Ramiro", rating: 4.5 });
    expect(row!.placeCachedAt).toBeInstanceOf(Date);

    await pickPlaceForIdea(s.d, s.owner, { tripId: s.tripId, ideaId, placeId: "ChIJclosedbar01" }, { places: fakePlaces() });
    const [closed] = await asService(s.d, (tx) => tx.select().from(ideas).where(eq(ideas.id, ideaId)));
    expect(closed).toMatchObject({ category: "drink", permanentlyClosed: true }); // FR-33

    expect(await asService(s.d, (tx) => tx.select().from(aiImports))).toHaveLength(0); // FR-L22
  });

  it("personal-link sessions can't search, fix, rename or add by place (FR-5)", async () => {
    const s = await setup();
    const { ideaId } = await addIdea(s.d, s.owner, { tripId: s.tripId, memberId: s.memberId, raw: "tacos" });
    const places = fakePlaces();
    await expect(searchPlacesForTrip(s.d, s.link, { tripId: s.tripId, query: "ramiro" }, { places })).rejects.toThrow();
    await expect(
      pickPlaceForIdea(s.d, s.link, { tripId: s.tripId, ideaId, placeId: "ChIJramiro0001" }, { places }),
    ).rejects.toThrow();
    await expect(addIdeaFromPlace(s.d, s.link, { tripId: s.tripId, placeId: "ChIJramiro0001" }, { places })).rejects.toThrow();
    expect(await fixIdea(s.d, s.link, { ideaId, title: "Hacked" })).toHaveLength(0);
    expect(places.searches).toHaveLength(0);
    const [row] = await asService(s.d, (tx) => tx.select().from(ideas).where(eq(ideas.id, ideaId)));
    expect(row!.title).toBe("tacos");
    expect(row!.placeId).toBeNull();
  });

  it("add by place search: free, resolved at once, Maps source link, duplicates merge (FR-L20, FR-22)", async () => {
    const s = await setup();
    const a = await addIdeaFromPlace(s.d, s.owner, { tripId: s.tripId, placeId: "ChIJramiro0001" }, { places: fakePlaces() });
    expect(a.merged).toBe(false);
    const view = await getTripView(s.d, s.owner, s.tripId);
    expect(view!.ideas).toHaveLength(1);
    expect(view!.ideas[0]).toMatchObject({
      title: "Cervejaria Ramiro",
      processing: false,
      needsReview: false,
      stopId: s.stopId,
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ChIJramiro0001",
      sharedBy: ["You"],
    });
    const b = await addIdeaFromPlace(s.d, s.owner, { tripId: s.tripId, placeId: "ChIJramiro0001" }, { places: fakePlaces() });
    expect(b).toEqual({ ideaId: a.ideaId, merged: true });
    expect((await getTripView(s.d, s.owner, s.tripId))!.ideas).toHaveLength(1);
    expect(await asService(s.d, (tx) => tx.select().from(aiImports))).toHaveLength(0);
  });

  it("library: fix a save's place (clears old overrides) and save a place by hand", async () => {
    const s = await setup();
    const places = fakePlaces();
    const { savedIdeaId } = await saveFromPlace(s.d, s.uid, { placeId: "ChIJclosedbar01" }, { places });
    await updateSaveSort(s.d, s.uid, { savedIdeaId, city: "Porto", category: "nightlife" });
    await pickPlaceForSave(s.d, s.uid, { savedIdeaId, placeId: "ChIJramiro0001" }, { places });
    const [row] = await asService(s.d, (tx) => tx.select().from(savedIdeas).where(eq(savedIdeas.id, savedIdeaId)));
    expect(row).toMatchObject({
      title: "Cervejaria Ramiro",
      placeId: "ChIJramiro0001",
      category: "food",
      country: "PT",
      regionOrCity: "Lisboa",
      regionOrCityOverride: null,
      categoryOverride: null,
      extraction: "resolved",
      permanentlyClosed: false,
    });
    // Same place again → the existing save (FR-L5).
    expect(await saveFromPlace(s.d, s.uid, { placeId: "ChIJramiro0001" }, { places })).toEqual({ savedIdeaId, merged: true });
    // Someone else can't fix my save.
    const other = randomUUID();
    await asService(s.d, (tx) => tx.insert(users).values({ id: other, displayName: "Eve" }));
    await expect(pickPlaceForSave(s.d, other, { savedIdeaId, placeId: "ChIJclosedbar01" }, { places })).rejects.toThrow();
    // Library search with no pin: no bias.
    await searchPlacesForLibrary(s.d, s.uid, { query: "ramiro" }, { places });
    expect(places.searches[0]).not.toHaveProperty("locationBias.center");
    expect(await asService(s.d, (tx) => tx.select().from(aiImports))).toHaveLength(0);
  });
});
