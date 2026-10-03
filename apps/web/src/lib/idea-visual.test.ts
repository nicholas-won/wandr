import { describe, expect, it } from "vitest";
import { captionLine, cardBlurb, cardPhoto, isCacheStale, locationLabel, shortHash } from "./idea-visual";

const PHOTO = { name: "places/ChIJ1234567890/photos/abcdefghijk", attributions: [{ displayName: "Ana", uri: null }] };

describe("locationLabel", () => {
  it("joins neighborhood, city and category without repeats", () => {
    expect(locationLabel({ neighborhood: "Alfama", city: "Lisbon", category: "food" })).toBe("Alfama, Lisbon · Food");
    expect(locationLabel({ city: "Lisbon", stop: "Lisbon", category: "sight" })).toBe("Lisbon · Sight");
    expect(locationLabel({ neighborhood: "lisbon", city: "Lisbon", category: "other" })).toBe("lisbon · Idea");
    expect(locationLabel({ stop: "Porto", category: "drink" })).toBe("Porto · Drinks");
    expect(locationLabel({ city: null, country: "Portugal", category: "stay" })).toBe("Portugal · Stay");
    expect(locationLabel({ category: "food" })).toBe("Food");
    expect(locationLabel({ category: "other" })).toBeNull();
  });
});

describe("captionLine (untrusted text)", () => {
  it("takes the first meaningful line, minus links and hashtag tails", () => {
    expect(captionLine("https://vm.tiktok.com/x\n#fyp #travel\nBest pastéis in Belém!! 🥐 #lisbon #food\nmore")).toBe(
      "Best pastéis in Belém!! 🥐",
    );
  });
  it("strips control and bidi characters and caps length", () => {
    expect(captionLine("Hi‮there\u0007")).toBe("Hithere");
    const long = captionLine("a".repeat(300))!;
    expect(long.length).toBe(140);
    expect(long.endsWith("…")).toBe(true);
    expect(captionLine("@someone @else")).toBeNull();
    expect(captionLine("   ")).toBeNull();
    expect(captionLine(null)).toBeNull();
  });
  it("blurb prefers the AI summary", () => {
    expect(cardBlurb("Seafood hall, go hungry", "caption")).toBe("Seafood hall, go hungry");
    expect(cardBlurb("  ", "caption line")).toBe("caption line");
  });
});

describe("cardPhoto", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const base = { kind: "idea" as const, id: "i1", placeId: "ChIJ1234567890", enabled: true, now };
  it("offers a versioned photo when the cache has one with its credit", () => {
    const r = cardPhoto({ ...base, placeCache: { photo: PHOTO }, placeCachedAt: now });
    expect(r.photo).toEqual({ src: `/api/place-photo/idea/i1?v=${shortHash(PHOTO.name)}`, attributions: PHOTO.attributions });
    expect(r.photoPrime).toBeNull();
  });
  it("primes pre-photo or stale caches; nothing without a key or place", () => {
    expect(cardPhoto({ ...base, placeCache: { name: "x" }, placeCachedAt: now }).photoPrime).toBe("/api/place-photo/idea/i1?prime=1");
    const stale = new Date(+now - 31 * 864e5);
    expect(cardPhoto({ ...base, placeCache: { photo: null }, placeCachedAt: stale }).photoPrime).not.toBeNull();
    expect(cardPhoto({ ...base, placeCache: { photo: null }, placeCachedAt: now })).toEqual({ photo: null, photoPrime: null });
    expect(cardPhoto({ ...base, enabled: false, placeCache: { photo: PHOTO }, placeCachedAt: now }).photo).toBeNull();
    expect(cardPhoto({ ...base, placeId: null, placeCache: { photo: PHOTO }, placeCachedAt: now }).photo).toBeNull();
  });
  it("30-day staleness", () => {
    expect(isCacheStale(new Date(+now - 29 * 864e5), now)).toBe(false);
    expect(isCacheStale(new Date(+now - 31 * 864e5), now)).toBe(true);
    expect(isCacheStale(null, now)).toBe(true);
  });
});
