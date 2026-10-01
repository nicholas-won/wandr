import { describe, expect, it, vi } from "vitest";
import {
  PLACES_SEARCH_URL,
  PlacesError,
  choosePlace,
  createPlacesClient,
  haversineKm,
  mapRawPlace,
  nameSimilarity,
  type PlaceCandidate,
} from "../src/places";

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
