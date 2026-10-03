import { describe, expect, it } from "vitest";
import {
  clocksDiffer,
  clockValue,
  isValidTimeZone,
  parseClock,
  parseGooglePlacesGeocoding,
  parseOpenMeteoGeocoding,
  parseOpenMeteoTimeZone,
  pickGeocodeCandidate,
  refileUnsorted,
  stopNeedsGeocode,
  timeZoneLabel,
  timeZoneOffsetMinutes,
  travelDayNotes,
  tripClock,
  type GeoCandidate,
} from "../src/geo";
import type { StopLike } from "../src/stops";

const LISBON = { lat: 38.7223, lng: -9.1393 };
const PORTO = { lat: 41.1579, lng: -8.6291 };
const SINTRA = { lat: 38.8029, lng: -9.3817 };
const MADRID = { lat: 40.4168, lng: -3.7038 };

describe("parseOpenMeteoGeocoding", () => {
  it("reads name, coordinates, country and time zone", () => {
    const json = {
      results: [
        { name: "Lisbon", latitude: 38.71667, longitude: -9.13333, country_code: "PT", timezone: "Europe/Lisbon" },
        { name: "Lisbon", latitude: 33.3, longitude: -80.0, country_code: "us", timezone: "America/New_York" },
      ],
    };
    expect(parseOpenMeteoGeocoding(json)).toEqual([
      { name: "Lisbon", lat: 38.71667, lng: -9.13333, countryCode: "PT", timeZone: "Europe/Lisbon" },
      { name: "Lisbon", lat: 33.3, lng: -80.0, countryCode: "US", timeZone: "America/New_York" },
    ]);
  });
  it("drops junk and handles no results", () => {
    expect(parseOpenMeteoGeocoding({ generationtime_ms: 1 })).toEqual([]);
    expect(parseOpenMeteoGeocoding(null)).toEqual([]);
    expect(
      parseOpenMeteoGeocoding({
        results: [
          { name: "X", latitude: 200, longitude: 0 },
          { name: "Y", latitude: "1", longitude: 2 },
          { name: "Z", latitude: 1, longitude: 2, timezone: "Not/AZone", country_code: "PRT" },
        ],
      }),
    ).toEqual([{ name: "Z", lat: 1, lng: 2, countryCode: null, timeZone: null }]);
  });
});

describe("parseGooglePlacesGeocoding", () => {
  it("reads location and the country component", () => {
    const json = {
      places: [
        {
          displayName: { text: "Porto" },
          location: { latitude: 41.1579, longitude: -8.6291 },
          addressComponents: [
            { longText: "Porto", shortText: "Porto", types: ["locality", "political"] },
            { longText: "Portugal", shortText: "PT", types: ["country", "political"] },
          ],
        },
        { displayName: { text: "No location" } },
      ],
    };
    expect(parseGooglePlacesGeocoding(json)).toEqual([
      { name: "Porto", lat: 41.1579, lng: -8.6291, countryCode: "PT", timeZone: null },
    ]);
    expect(parseGooglePlacesGeocoding({})).toEqual([]);
  });
});

describe("parseOpenMeteoTimeZone", () => {
  it("accepts a real zone and rejects GMT fallbacks and junk", () => {
    expect(parseOpenMeteoTimeZone({ timezone: "Europe/Lisbon" })).toBe("Europe/Lisbon");
    expect(parseOpenMeteoTimeZone({ timezone: "GMT" })).toBeNull();
    expect(parseOpenMeteoTimeZone({ timezone: "<script>" })).toBeNull();
    expect(parseOpenMeteoTimeZone(undefined)).toBeNull();
  });
  it("isValidTimeZone", () => {
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});

describe("pickGeocodeCandidate", () => {
  const cand = (name: string, at: { lat: number; lng: number }): GeoCandidate => ({ name, ...at, countryCode: null, timeZone: null });
  const portlandOR = cand("Portland OR", { lat: 45.5152, lng: -122.6784 });
  const portlandME = cand("Portland ME", { lat: 43.6591, lng: -70.2568 });

  it("takes the top result without a hint", () => {
    expect(pickGeocodeCandidate([portlandOR, portlandME])).toBe(portlandOR);
    expect(pickGeocodeCandidate([])).toBeNull();
  });
  it("prefers the candidate near the Stop's ideas", () => {
    expect(pickGeocodeCandidate([portlandOR, portlandME], { lat: 43.66, lng: -70.25 })).toBe(portlandME);
  });
  it("falls back to the top result when nothing is near the hint (a rename to another city)", () => {
    expect(pickGeocodeCandidate([cand("Porto", PORTO)], LISBON)!.name).toBe("Porto");
  });
});

describe("stopNeedsGeocode", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const base = { name: "Lisbon", geocodedName: null, geocodeSource: null, geocodedAt: null };
  it("named Stops that were never tried", () => {
    expect(stopNeedsGeocode(base, now)).toBe(true);
  });
  it("never the hidden unnamed Stop", () => {
    expect(stopNeedsGeocode({ ...base, name: "  " }, now)).toBe(false);
  });
  it("once per name: done (even with no match) until renamed", () => {
    const done = { ...base, geocodedName: "Lisbon", geocodeSource: "open_meteo", geocodedAt: new Date("2020-01-01") };
    expect(stopNeedsGeocode(done, now)).toBe(false);
    expect(stopNeedsGeocode({ ...done, name: "Porto" }, now)).toBe(true);
    expect(stopNeedsGeocode({ ...base, geocodedName: "Lisbon" }, now)).toBe(false);
  });
  it("refreshes Google coordinates after 30 days (Places caching terms)", () => {
    const g = { ...base, geocodedName: "Lisbon", geocodeSource: "google" };
    expect(stopNeedsGeocode({ ...g, geocodedAt: new Date("2026-09-20T12:00:00Z") }, now)).toBe(false);
    expect(stopNeedsGeocode({ ...g, geocodedAt: new Date("2026-08-01T12:00:00Z") }, now)).toBe(true);
  });
});

describe("refileUnsorted (FR-S6)", () => {
  const s = (id: string, position: number, at: { lat: number; lng: number } | null, isDefault = false): StopLike => ({
    id,
    name: id,
    isDefault,
    position,
    lat: at?.lat ?? null,
    lng: at?.lng ?? null,
  });
  const idea = (id: string, at: { lat: number; lng: number } | null, stopId: string | null = null, category = "food") => ({
    id,
    stopId,
    category,
    lat: at?.lat ?? null,
    lng: at?.lng ?? null,
  });

  it("moves located Unsorted ideas into the Stop they fall in; others stay", () => {
    const stops = [s("lis", 0, LISBON), s("por", 1, PORTO)];
    const ideas = [
      idea("sintra", SINTRA),
      idea("porto-bar", PORTO),
      idea("madrid", MADRID),
      idea("no-place", null),
      idea("filed", SINTRA, "por"),
      idea("city", LISBON, null, "city"),
    ];
    expect(refileUnsorted(ideas, stops)).toEqual([
      { ideaId: "sintra", stopId: "lis" },
      { ideaId: "porto-bar", stopId: "por" },
    ]);
  });
  it("does nothing while no Stop has coordinates", () => {
    expect(refileUnsorted([idea("sintra", SINTRA)], [s("lis", 0, null), s("por", 1, null)])).toEqual([]);
    expect(refileUnsorted([idea("sintra", SINTRA)], [s("only", 0, null, true)])).toEqual([]);
  });
});

describe("clock times", () => {
  it("parseClock / clockValue round-trip", () => {
    expect(parseClock("18:30")).toBe(1110);
    expect(parseClock("6:05")).toBe(365);
    expect(parseClock("0930")).toBe(570);
    expect(parseClock("")).toBeNull();
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("7pm")).toBeNull();
    expect(clockValue(1110)).toBe("18:30");
    expect(clockValue(0)).toBe("00:00");
    expect(clockValue(null)).toBe("");
    expect(clockValue(1440)).toBe("");
  });
});

describe("time zones (FR-O16)", () => {
  const summer = new Date("2026-07-01T12:00:00Z");
  const winter = new Date("2026-01-15T12:00:00Z");
  it("offsets follow daylight saving", () => {
    expect(timeZoneOffsetMinutes("Europe/Lisbon", summer)).toBe(60);
    expect(timeZoneOffsetMinutes("Europe/Lisbon", winter)).toBe(0);
    expect(timeZoneOffsetMinutes("America/New_York", summer)).toBe(-240);
    expect(timeZoneOffsetMinutes("Asia/Kolkata", winter)).toBe(330);
  });
  it("clocksDiffer compares wall clocks, not names", () => {
    expect(clocksDiffer("America/New_York", "America/Toronto", summer)).toBe(false);
    expect(clocksDiffer("America/New_York", "Europe/Lisbon", summer)).toBe(true);
    expect(clocksDiffer("Europe/London", "Europe/Lisbon", winter)).toBe(false);
  });
  it("timeZoneLabel gives a short name", () => {
    expect(timeZoneLabel("America/New_York", summer)).toBe("EDT");
    expect(timeZoneLabel("Asia/Tokyo", summer)).toMatch(/GMT\+9|JST/);
  });
  it("tripClock: the poll's Stop, else the first Stop with a zone", () => {
    const stops = [
      { id: "b", name: "Porto", position: 1, timezone: "Europe/Lisbon" },
      { id: "a", name: "Madrid", position: 0, timezone: null },
      { id: "c", name: "Tokyo", position: 2, timezone: "Asia/Tokyo" },
    ];
    expect(tripClock(stops, "c")).toEqual({ name: "Tokyo", timeZone: "Asia/Tokyo" });
    expect(tripClock(stops, "a")).toEqual({ name: "Porto", timeZone: "Europe/Lisbon" });
    expect(tripClock(stops)).toEqual({ name: "Porto", timeZone: "Europe/Lisbon" });
    expect(tripClock([{ id: "x", name: "", position: 0, timezone: null }])).toBeNull();
  });
});

describe("travelDayNotes (FR-O15)", () => {
  it("notes shortened arrival and departure days", () => {
    const notes = travelDayNotes({ timezone: "Europe/Lisbon", days: 3, arrival: { minute: 18 * 60 + 30 }, departure: { minute: 11 * 60 } });
    expect(notes.get(0)).toBe("✈️ Arrive 6:30pm · plans from 7:30pm · dinner only");
    expect(notes.has(1)).toBe(false);
    expect(notes.get(2)).toBe("🧳 Leave 11am · plans end by 10am");
  });
  it("an early arrival isn't dinner-only; one-day stops get both", () => {
    const notes = travelDayNotes({ timezone: "UTC", days: 1, arrival: { minute: 9 * 60 }, departure: { minute: 20 * 60 } });
    expect(notes.get(0)).toBe("✈️ Arrive 9am · plans from 10am · 🧳 Leave 8pm · plans end by 7pm");
  });
  it("nothing without times", () => {
    expect(travelDayNotes({ timezone: "UTC", days: 2 }).size).toBe(0);
  });
});
