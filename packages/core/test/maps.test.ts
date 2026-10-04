import { describe, expect, it } from "vitest";
import { boundsOf, googleMapsPlaceUrl, googleMapsRouteUrls, hasPin } from "../src/maps";

const p = (i: number) => ({ title: `P${i}`, lat: 38 + i / 100, lng: -9 - i / 100 });

describe("map links (FR-122, FR-126)", () => {
  it("place link prefers coordinates and place id", () => {
    const u = new URL(googleMapsPlaceUrl({ title: "Time Out Market", lat: 38.707, lng: -9.146, placeId: "ChIJ1" }));
    expect(u.origin + u.pathname).toBe("https://www.google.com/maps/search/");
    expect(u.searchParams.get("query")).toBe("38.707000,-9.146000");
    expect(u.searchParams.get("query_place_id")).toBe("ChIJ1");
    expect(new URL(googleMapsPlaceUrl({ title: "A & B", lat: null, lng: null })).searchParams.get("query")).toBe("A & B");
  });

  it("route links chunk at the URL limit and continue from the last stop", () => {
    expect(googleMapsRouteUrls([])).toEqual([]);
    expect(googleMapsRouteUrls([{ title: "x", lat: null, lng: null }])).toEqual([]);
    expect(googleMapsRouteUrls([p(1)])[0]).toContain("/maps/search/");
    const urls = googleMapsRouteUrls(Array.from({ length: 15 }, (_, i) => p(i)));
    expect(urls).toHaveLength(2);
    const a = new URL(urls[0]!);
    const b = new URL(urls[1]!);
    expect(a.searchParams.get("waypoints")!.split("|")).toHaveLength(9);
    expect(b.searchParams.get("origin")).toBe(a.searchParams.get("destination"));
    expect(b.searchParams.get("destination")).toBe("38.140000,-9.140000");
  });

  it("rejects bad pins and computes bounds", () => {
    expect(hasPin({ title: "", lat: 91, lng: 0 })).toBe(false);
    expect(hasPin({ title: "", lat: Number.NaN, lng: 0 })).toBe(false);
    expect(boundsOf([p(0), p(2), { title: "", lat: null, lng: null }])).toEqual({ north: 38.02, south: 38, east: -9, west: -9.02 });
    expect(boundsOf([])).toBeNull();
  });
});
