import { describe, expect, it, vi } from "vitest";
import {
  DETAILS_FIELD_MASK,
  PLACES_SEARCH_URL,
  PlacesError,
  SEARCH_FIELD_MASK,
  isPhotoName,
  isPlaceId,
  choosePlace,
  createPlacesClient,
  haversineKm,
  mapRawPlace,
  nameSimilarity,
  categoryFromPlaceTypes,
  mapsUrlForPlaceId,
  toSearchResult,
  type PlaceCandidate,
} from "../src/places";

describe("manual place picks (FR-23, FR-L20)", () => {
  it("maps Google types to categories, primary type first", () => {
    expect(categoryFromPlaceTypes("seafood_restaurant", ["restaurant", "food"])).toBe("food");
    expect(categoryFromPlaceTypes("cocktail_bar")).toBe("drink");
    expect(categoryFromPlaceTypes("night_club", ["bar"])).toBe("nightlife");
    expect(categoryFromPlaceTypes("hotel", ["lodging"])).toBe("stay");
    expect(categoryFromPlaceTypes("museum")).toBe("sight");
    expect(categoryFromPlaceTypes(null, ["point_of_interest", "spa"])).toBe("activity");
    expect(categoryFromPlaceTypes("clothing_store")).toBe("shopping");
    expect(categoryFromPlaceTypes("locality", ["political"])).toBe("city");
    expect(categoryFromPlaceTypes(null, ["point_of_interest", "establishment"])).toBe("other");
  });

  it("rebuilds a Maps link from the place id only (FR-31)", () => {
    expect(mapsUrlForPlaceId("ChIJramiro123")).toBe("https://www.google.com/maps/place/?q=place_id:ChIJramiro123");
    expect(() => mapsUrlForPlaceId("../evil")).toThrow(PlacesError);
  });

  it("search results carry only what the picker shows", () => {
    const r = toSearchResult(
      mapRawPlace({ id: "ChIJabcdefghij", displayName: { text: "Ramiro" }, businessStatus: "CLOSED_PERMANENTLY" })!,
    );
    expect(r).toEqual({
      placeId: "ChIJabcdefghij",
      name: "Ramiro",
      address: null,
      rating: null,
      userRatingCount: null,
      permanentlyClosed: true,
    });
  });
});

function cand(id: string, name: string, lat: number, lng: number, status = "OPERATIONAL"): PlaceCandidate {
  return mapRawPlace({ id, displayName: { text: name }, location: { latitude: lat, longitude: lng }, businessStatus: status })!;
}

const nyc = [{ id: "stop-nyc", name: "New York", lat: 40.758, lng: -73.9855 }]; // Times Square

describe("createPlacesClient", () => {
  it("returns null without a key (graceful no-key mode)", () => {
    expect(createPlacesClient({}, {})).toBeNull();
  });

  it("posts a Text Search (New) request with field mask and location bias", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: "ChIJ1",
              displayName: { text: "Cervejaria Ramiro" },
              formattedAddress: "Av. Almirante Reis 1, Lisboa",
              location: { latitude: 38.72, longitude: -9.135 },
              businessStatus: "OPERATIONAL",
              priceLevel: "PRICE_LEVEL_MODERATE",
              rating: 4.5,
              userRatingCount: 30000,
              addressComponents: [
                { longText: "Lisboa", shortText: "Lisboa", types: ["locality", "political"] },
                { longText: "Portugal", shortText: "PT", types: ["country", "political"] },
              ],
            },
            { displayName: { text: "no id → dropped" } },
          ],
        }),
        { status: 200 },
      ),
    );
    const client = createPlacesClient({ fetch: fetchMock as unknown as typeof fetch }, { GOOGLE_MAPS_API_KEY: "k" })!;
    const out = await client.searchText({ textQuery: "Ramiro Lisbon", locationBias: { center: { lat: 38.7, lng: -9.1 }, radiusM: 999_999 } });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(PLACES_SEARCH_URL);
    const headers = init!.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("k");
    expect(headers["x-goog-fieldmask"]).toContain("places.id");
    expect(headers["x-goog-fieldmask"]).toContain("places.businessStatus");
    const body = JSON.parse(init!.body as string);
    expect(body.locationBias.circle.radius).toBe(50_000); // clamped
    expect(out).toHaveLength(1);
    expect(out[0]!.placeId).toBe("ChIJ1");
    expect(out[0]!.display).toMatchObject({ name: "Cervejaria Ramiro", priceLevel: 2, countryCode: "PT", locality: "Lisboa" });
  });

  it("throws PlacesError on HTTP errors", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 429 }));
    const client = createPlacesClient({ apiKey: "k", fetch: fetchMock as unknown as typeof fetch })!;
    await expect(client.searchText({ textQuery: "x" })).rejects.toBeInstanceOf(PlacesError);
  });
});

const PHOTO = "places/ChIJ1234567890/photos/AelY_CvPhotoRef0123456789";

describe("place photos (display cache only)", () => {
  it("keeps only the first photo's name and author attributions", () => {
    const c = mapRawPlace({
      id: "ChIJ1234567890",
      displayName: { text: "Ramiro" },
      photos: [
        {
          name: PHOTO,
          widthPx: 4032,
          heightPx: 3024,
          authorAttributions: [
            { displayName: " Ana Silva ", uri: "https://maps.google.com/maps/contrib/123", photoUri: "https://lh3.googleusercontent.com/a" },
            { displayName: "Evil", uri: "javascript:alert(1)" },
            { uri: "https://maps.google.com/maps/contrib/9" },
          ],
        },
        { name: "places/ChIJ1234567890/photos/second_photo_ref_xyz" },
      ],
    })!;
    expect(c.display.photo).toEqual({
      name: PHOTO,
      widthPx: 4032,
      heightPx: 3024,
      attributions: [
        { displayName: "Ana Silva", uri: "https://maps.google.com/maps/contrib/123" },
        { displayName: "Evil", uri: null },
      ],
    });
    // Never photo bytes or Google's photo URLs.
    expect(JSON.stringify(c.display)).not.toContain("googleusercontent");
  });

  it("drops malformed photo names and handles places without photos", () => {
    expect(mapRawPlace({ id: "ChIJ1234567890", photos: [{ name: "../../evil" }] })!.display.photo).toBeNull();
    expect(mapRawPlace({ id: "ChIJ1234567890" })!.display.photo).toBeNull();
  });

  it("requests photos in the Text Search and Details field masks", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: "ChIJ1234567890", displayName: { text: "Ramiro" }, photos: [{ name: PHOTO }] }), { status: 200 }),
    );
    const client = createPlacesClient({ apiKey: "k", fetch: fetchMock as unknown as typeof fetch })!;
    const got = await client.getPlace("ChIJ1234567890");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJ1234567890");
    const headers = init!.headers as Record<string, string>;
    expect(headers["x-goog-fieldmask"]!.split(",")).toContain("photos");
    expect(headers["x-goog-fieldmask"]).not.toContain("places.");
    expect(headers["x-goog-api-key"]).toBe("k");
    expect(got!.display.photo!.name).toBe(PHOTO);
    expect(SEARCH_FIELD_MASK.split(",")).toContain("places.photos");
    expect(DETAILS_FIELD_MASK.split(",")).toContain("photos");
  });

  it("getPlace: 404 → null; bad ids never reach Google", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));
    const client = createPlacesClient({ apiKey: "k", fetch: fetchMock as unknown as typeof fetch })!;
    expect(await client.getPlace("ChIJ1234567890")).toBeNull();
    await expect(client.getPlace("../x?y")).rejects.toBeInstanceOf(PlacesError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fetchPhoto: key in a header (not the URL), clamped width, errors throw", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    const client = createPlacesClient({ apiKey: "secret", fetch: fetchMock as unknown as typeof fetch })!;
    const res = await client.fetchPhoto(PHOTO, { maxWidthPx: 99_999 });
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`https://places.googleapis.com/v1/${PHOTO}/media?maxWidthPx=4800`);
    expect(String(url)).not.toContain("secret");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
    await expect(client.fetchPhoto("places/x/photos/../../admin")).rejects.toBeInstanceOf(PlacesError);

    const failing = createPlacesClient({ apiKey: "k", fetch: (async () => new Response("", { status: 400 })) as unknown as typeof fetch })!;
    await expect(failing.fetchPhoto(PHOTO)).rejects.toMatchObject({ status: 400 });
  });

  it("validates photo names and place ids", () => {
    expect(isPhotoName(PHOTO)).toBe(true);
    expect(isPhotoName(`${PHOTO}/media`)).toBe(false);
    expect(isPhotoName("https://evil.example/x")).toBe(false);
    expect(isPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(true);
    expect(isPlaceId("ChIJ/../../")).toBe(false);
  });
});

describe("choosePlace", () => {
  it("picks the chain branch nearest the Stop (FR-32, C-6)", () => {
    const candidates = [
      cand("far", "Joe's Pizza", 40.7306, -74.0027), // Greenwich Village (Google's top)
      cand("near", "Joe's Pizza", 40.7547, -73.9871), // Broadway near Times Square
      cand("bk", "Joe's Pizza", 40.6943, -73.9865),
    ];
    const c = choosePlace(candidates, { nameHint: "Joe's Pizza", stops: nyc })!;
    expect(c.candidate.placeId).toBe("near");
    expect(c.chain?.branchCount).toBe(3);
    expect(c.chain?.alternatives.map((a) => a.placeId)).toEqual(["far", "bk"]);
    expect(c.nearestStop?.stopId).toBe("stop-nyc");
  });

  it("uses Google's order for non-chains", () => {
    const c = choosePlace([cand("a", "Manteigaria", 38.71, -9.14), cand("b", "Pastelaria Manteigaria", 38.7, -9.1)], {
      nameHint: "Manteigaria",
      stops: [],
    })!;
    expect(c.candidate.placeId).toBe("a");
    expect(c.chain).toBeNull();
    expect(c.nameSimilarity).toBe(1);
  });

  it("flags permanently / temporarily closed (FR-33, C-7)", () => {
    expect(choosePlace([cand("x", "Old Bar", 1, 1, "CLOSED_PERMANENTLY")], { nameHint: "Old Bar", stops: [] })!.permanentlyClosed).toBe(true);
    expect(choosePlace([cand("x", "Old Bar", 1, 1, "CLOSED_TEMPORARILY")], { nameHint: "Old Bar", stops: [] })!.temporarilyClosed).toBe(true);
  });

  it("returns null for no candidates", () => {
    expect(choosePlace([], { nameHint: "x", stops: [] })).toBeNull();
  });
});

describe("geo + names", () => {
  it("haversine Lisbon→Porto ≈ 274 km", () => {
    expect(haversineKm({ lat: 38.7223, lng: -9.1393 }, { lat: 41.1579, lng: -8.6291 })).toBeGreaterThan(270);
    expect(haversineKm({ lat: 38.7223, lng: -9.1393 }, { lat: 41.1579, lng: -8.6291 })).toBeLessThan(280);
  });
  it("nameSimilarity is accent/case-insensitive and handles containment", () => {
    expect(nameSimilarity("Pensão Amor", "PENSAO AMOR")).toBe(1);
    expect(nameSimilarity("Joe's Pizza", "Joe's Pizza Broadway")).toBeGreaterThan(0.5);
    expect(nameSimilarity("Eiffel Tower", "Manteigaria")).toBe(0);
  });
  it("maps price levels", () => {
    expect(mapRawPlace({ id: "a", priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE" })!.display.priceLevel).toBe(4);
    expect(mapRawPlace({ id: "a" })!.display.businessStatus).toBe("UNKNOWN");
  });
});
