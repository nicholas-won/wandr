/**
 * Stop geocoding on PGlite with a fake geocoder (no network): coordinates, country and time zone
 * land on the Stop, Unsorted ideas are re-filed (FR-S6), renames re-geocode, failures are silent,
 * and arrival/departure times reach the optimizer (FR-O8, FR-O15, FR-O16).
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { asService, ideas, stops, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import type { GeoCandidate } from "@wandr/core";
import { createTrip, getTripView } from "../trips";
import { createGeocoder, geocodeStops, openMeteoGeocoder, type Geocoder } from "../geocode";
import { getPlanContext, previewPlan, setStopTravelTimes, stopLocation } from "../plan";
import { updateStop } from "../planning";

const PLACES: Record<string, GeoCandidate[]> = {
  lisbon: [{ name: "Lisbon", lat: 38.7223, lng: -9.1393, countryCode: "PT", timeZone: "Europe/Lisbon" }],
  porto: [{ name: "Porto", lat: 41.1579, lng: -8.6291, countryCode: "PT", timeZone: null }],
  tokyo: [{ name: "Tokyo", lat: 35.6762, lng: 139.6503, countryCode: "JP", timeZone: "Asia/Tokyo" }],
};

function fakeGeocoder(opts: { fail?: boolean } = {}): Geocoder & { calls: string[] } {
  const calls: string[] = [];
  return {
    source: "open_meteo",
    calls,
    async search(name) {
      calls.push(name);
      if (opts.fail) throw new Error("offline");
      return PLACES[name.toLowerCase()] ?? [];
    },
    async timeZoneAt(p) {
      if (opts.fail) throw new Error("offline");
      return p.lat > 40 && p.lng < 0 ? "Europe/Lisbon" : null;
    },
  };
}

async function setup(destinations: string[]) {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const uid = randomUUID();
  await asService(d, (tx) => tx.insert(users).values({ id: uid, displayName: "Nick" }));
  const t = await createTrip(d, { userId: uid, ownerName: "Nick", name: "Trip", destinations });
  return { d, uid, ...t };
}

const stopRows = (d: Db, tripId: string) =>
  asService(d, (tx) => tx.select().from(stops).where(eq(stops.tripId, tripId)).orderBy(asc(stops.position)));

describe("geocodeStops", () => {
  it("stores coordinates, country and time zone; looks up the zone when the provider has none", async () => {
    const s = await setup(["Lisbon", "Porto"]);
    const view = await getTripView(s.d, { sub: s.uid }, s.tripId);
    expect(view!.stopsNeedGeocode).toBe(true); // lazy backfill trigger

    const g = fakeGeocoder();
    const r = await geocodeStops(s.d, s.tripId, { geocoder: g });
    expect(r.geocoded).toHaveLength(2);
    const [lis, por] = await stopRows(s.d, s.tripId);
    expect(lis).toMatchObject({ lat: 38.7223, lng: -9.1393, countryCode: "PT", timezone: "Europe/Lisbon", geocodedName: "Lisbon" });
    expect(por).toMatchObject({ lat: 41.1579, countryCode: "PT", timezone: "Europe/Lisbon" });

    // Once: nothing to do on the next load.
    expect((await getTripView(s.d, { sub: s.uid }, s.tripId))!.stopsNeedGeocode).toBe(false);
    await geocodeStops(s.d, s.tripId, { geocoder: g });
    expect(g.calls).toEqual(["Lisbon", "Porto"]);
  });

  it("re-files located Unsorted ideas into the Stop they fall in; filed ideas stay put (FR-S6)", async () => {
    const s = await setup(["Lisbon", "Porto"]);
    const [lis] = await stopRows(s.d, s.tripId);
    await asService(s.d, (tx) =>
      tx.insert(ideas).values([
        { tripId: s.tripId, title: "Pastéis de Belém", category: "food", lat: 38.6975, lng: -9.2032, extraction: "resolved" },
        { tripId: s.tripId, title: "Livraria Lello", category: "sight", lat: 41.1469, lng: -8.6116, extraction: "resolved" },
        { tripId: s.tripId, title: "Madrid tapas", category: "food", lat: 40.4168, lng: -3.7038, extraction: "resolved" },
        { tripId: s.tripId, title: "Somewhere fun", category: "other", extraction: "resolved" },
        // Filed by hand under Lisbon although it's in Porto: stays.
        { tripId: s.tripId, stopId: lis!.id, title: "Porto bar", category: "drink", lat: 41.15, lng: -8.61, extraction: "resolved" },
      ]),
    );
    const r = await geocodeStops(s.d, s.tripId, { geocoder: fakeGeocoder() });
    expect(r.refiled).toHaveLength(2);
    const rows = await asService(s.d, (tx) => tx.select().from(ideas).where(eq(ideas.tripId, s.tripId)));
    const [lisStop, porStop] = await stopRows(s.d, s.tripId);
    const stopOf = (t: string) => rows.find((i) => i.title === t)!.stopId;
    expect(stopOf("Pastéis de Belém")).toBe(lisStop!.id);
    expect(stopOf("Livraria Lello")).toBe(porStop!.id);
    expect(stopOf("Madrid tapas")).toBeNull();
    expect(stopOf("Somewhere fun")).toBeNull();
    expect(stopOf("Porto bar")).toBe(lisStop!.id);
  });

  it("a rename geocodes again", async () => {
    const s = await setup(["Lisbon", "Porto"]);
    await geocodeStops(s.d, s.tripId, { geocoder: fakeGeocoder() });
    const [, por] = await stopRows(s.d, s.tripId);
    const res = await updateStop(s.d, { sub: s.uid }, { stopId: por!.id, name: "Tokyo" });
    expect(res.ok).toBe(true);
    expect((await getTripView(s.d, { sub: s.uid }, s.tripId))!.stopsNeedGeocode).toBe(true);
    await geocodeStops(s.d, s.tripId, { geocoder: fakeGeocoder() });
    const [, tokyo] = await stopRows(s.d, s.tripId);
    expect(tokyo).toMatchObject({ name: "Tokyo", lat: 35.6762, countryCode: "JP", timezone: "Asia/Tokyo" });
  });

  it("network failures are silent and retried later; no match is remembered", async () => {
    const s = await setup(["Lisbon", "Our cabin"]);
    const r = await geocodeStops(s.d, s.tripId, { geocoder: fakeGeocoder({ fail: true }) });
    expect(r).toEqual({ geocoded: [], refiled: [] });
    let [lis, cabin] = await stopRows(s.d, s.tripId);
    expect(lis!.geocodedName).toBeNull();

    await geocodeStops(s.d, s.tripId, { geocoder: fakeGeocoder() });
    [lis, cabin] = await stopRows(s.d, s.tripId);
    expect(lis!.lat).toBe(38.7223);
    expect(cabin).toMatchObject({ lat: null, timezone: null, geocodedName: "Our cabin" });
  });

  it("the hidden unnamed Stop is never geocoded; no geocoder means no-op", async () => {
    const s = await setup([]);
    const g = fakeGeocoder();
    await geocodeStops(s.d, s.tripId, { geocoder: g });
    expect(g.calls).toEqual([]);
    expect(await geocodeStops(s.d, s.tripId, { geocoder: null })).toEqual({ geocoded: [], refiled: [] });
  });
});

describe("createGeocoder", () => {
  it("off, Google with a key, else Open-Meteo; disabled under Vitest unless asked", () => {
    expect(createGeocoder({ GEOCODER: "off" })).toBeNull();
    expect(createGeocoder({ VITEST: "true" })).toBeNull();
    expect(createGeocoder({ GOOGLE_PLACES_API_KEY: "k" })!.source).toBe("google");
    expect(createGeocoder({})!.source).toBe("open_meteo");
    expect(createGeocoder({ GEOCODER: "open-meteo", GOOGLE_MAPS_API_KEY: "k" })!.source).toBe("open_meteo");
  });

  it("Open-Meteo requests: name is URL-encoded, fixed host, zone from the response", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({ results: [{ name: "São Paulo", latitude: -23.5, longitude: -46.6, country_code: "BR", timezone: "America/Sao_Paulo" }] }),
      );
    }) as unknown as typeof fetch;
    const [c] = await openMeteoGeocoder(fake).search("São Paulo & more", null);
    expect(c).toMatchObject({ countryCode: "BR", timeZone: "America/Sao_Paulo" });
    expect(urls[0]).toMatch(/^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?name=S%C3%A3o%20Paulo%20%26%20more&count=5/);
  });
});

describe("plan uses Stop coordinates, zone and travel times", () => {
  it("weather location, time zone and arrival/departure reach the optimizer (FR-O8, FR-O15, FR-O16)", async () => {
    const s = await setup(["Lisbon"]);
    await geocodeStops(s.d, s.tripId, { geocoder: fakeGeocoder() });
    await asService(s.d, (tx) =>
      tx.insert(ideas).values([
        { tripId: s.tripId, stopId: s.stopId, title: "Belém Tower", category: "sight", lat: 38.6916, lng: -9.216, status: "planned", extraction: "resolved" },
        { tripId: s.tripId, stopId: s.stopId, title: "Time Out Market", category: "food", lat: 38.7069, lng: -9.1457, status: "planned", extraction: "resolved" },
      ]),
    );
    await setStopTravelTimes(s.d, { sub: s.uid }, { tripId: s.tripId, stopId: s.stopId, arrivalMinute: 18 * 60 + 30, departureMinute: 11 * 60 });
    const ctx = (await getPlanContext(s.d, { sub: s.uid }, s.tripId))!;
    expect(stopLocation(ctx)).toEqual({ lat: 38.7223, lng: -9.1393 });
    expect(ctx.input.stop).toMatchObject({ timezone: "Europe/Lisbon", arrival: { minute: 1110 }, departure: { minute: 660 } });
    const plan = previewPlan(ctx);
    expect(plan.days[0]).toMatchObject({ kind: "arrival", dinnerOnly: true });
    expect(plan.days.at(-1)!.kind).toBe("departure");
  });

  it("only people who can apply the plan set travel times; bad times are refused", async () => {
    const s = await setup(["Lisbon"]);
    await expect(
      setStopTravelTimes(s.d, { link_member: s.memberId }, { tripId: s.tripId, stopId: s.stopId, arrivalMinute: 600, departureMinute: null }),
    ).rejects.toThrow("not_allowed");
    await expect(
      setStopTravelTimes(s.d, { sub: s.uid }, { tripId: s.tripId, stopId: s.stopId, arrivalMinute: 1440, departureMinute: null }),
    ).rejects.toThrow("invalid_time");
  });
});
