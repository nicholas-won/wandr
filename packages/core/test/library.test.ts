import { describe, expect, it } from "vitest";
import {
  countsAsPlace,
  DEFAULT_TRIP_READY,
  effectiveSort,
  groupByCategory,
  groupLibrary,
  parsePlaceKey,
  placeKey,
  preselectForTrip,
  savesForPlace,
  suggestTrip,
  tileLabel,
  tripReadiness,
  type LibraryCategory,
  type SaveLike,
} from "../src/library";

let seq = 0;
function save(over: Partial<SaveLike> & { category?: LibraryCategory } = {}): SaveLike {
  return {
    id: `s${++seq}`,
    extraction: "resolved",
    category: "food",
    country: "PT",
    regionOrCity: "Lisbon",
    permanentlyClosed: false,
    ...over,
  };
}

/** 8 open places in Lisbon: 1 food, 1 activity, 6 sights. */
function readyLisbon(): SaveLike[] {
  return [
    save({ category: "food" }),
    save({ category: "activity" }),
    ...Array.from({ length: 6 }, () => save({ category: "sight" })),
  ];
}

describe("effectiveSort (FR-L3, §5 overrides)", () => {
  it("uses the AI sort when there is no override", () => {
    expect(effectiveSort(save({ country: "pt", regionOrCity: " Lisbon " }))).toEqual({
      country: "PT",
      city: "Lisbon",
      category: "food",
    });
  });

  it("overrides win field by field", () => {
    const s = save({ countryOverride: "es", regionOrCityOverride: "Seville", categoryOverride: "drink" });
    expect(effectiveSort(s)).toEqual({ country: "ES", city: "Seville", category: "drink" });
    expect(effectiveSort(save({ regionOrCityOverride: "Porto" }))).toMatchObject({ country: "PT", city: "Porto" });
  });

  it("blank overrides fall back to the AI value", () => {
    expect(effectiveSort(save({ regionOrCityOverride: "  " })).city).toBe("Lisbon");
  });
});

describe("place keys", () => {
  it("are case- and accent-insensitive and round-trip", () => {
    expect(placeKey("pt", "Lisboa")).toBe("PT~lisboa");
    expect(placeKey("MX", "Ciudad de México")).toBe(placeKey("MX", "ciudad de mexico"));
    expect(parsePlaceKey("PT~lisboa")).toEqual({ country: "PT", cityFolded: "lisboa" });
    expect(parsePlaceKey("JP~")).toEqual({ country: "JP", cityFolded: null });
    expect(parsePlaceKey("~")).toEqual({ country: null, cityFolded: null });
  });

  it("rejects malformed keys", () => {
    expect(parsePlaceKey("lisbon")).toBeNull();
    expect(parsePlaceKey("PT~a~b")).toBeNull();
    expect(parsePlaceKey("Portugal~lisbon")).toBeNull();
  });
});

describe("tripReadiness (FR-L10, LB-9)", () => {
  it("is ready at 8 places with ≥1 food and ≥1 activity", () => {
    const r = tripReadiness(readyLisbon());
    expect(r).toMatchObject({ ready: true, places: 8 });
    expect(r.missing).toEqual({ places: 0, food: 0, activities: 0 });
  });

  it("is not ready at 7 places", () => {
    const r = tripReadiness(readyLisbon().slice(0, 7));
    expect(r.ready).toBe(false);
    expect(r.missing.places).toBe(1);
  });

  it("needs a food place and an activity", () => {
    const noFood = [save({ category: "activity" }), ...Array.from({ length: 9 }, () => save({ category: "sight" }))];
    expect(tripReadiness(noFood)).toMatchObject({ ready: false, missing: { places: 0, food: 1, activities: 0 } });
    const noActivity = [save({ category: "food" }), ...Array.from({ length: 9 }, () => save({ category: "shopping" }))];
    expect(tripReadiness(noActivity)).toMatchObject({ ready: false, missing: { activities: 1 } });
  });

  it("drinks count as food and sights count as activities (D69)", () => {
    expect(DEFAULT_TRIP_READY.foodCategories).toEqual(["food", "drink"]);
    expect(DEFAULT_TRIP_READY.activityCategories).toEqual(["activity", "sight"]);
    const drinksAndSights = [save({ category: "drink" }), save({ category: "sight" }), ...Array.from({ length: 6 }, () => save({ category: "shopping" }))];
    expect(tripReadiness(drinksAndSights).ready).toBe(true);
  });

  it("closed places never count (LB-9)", () => {
    const saves = readyLisbon();
    saves[0] = { ...saves[0]!, permanentlyClosed: true }; // the only food place
    const r = tripReadiness(saves);
    expect(r).toMatchObject({ ready: false, places: 7, food: 0 });
  });

  it("pending, failed, non-place and whole-city saves don't count", () => {
    const base = readyLisbon().slice(0, 7);
    for (const extra of [
      save({ extraction: "processing", category: "sight" }),
      save({ extraction: "queued", category: "sight" }),
      save({ extraction: "failed", category: "sight" }),
      save({ extraction: "not_a_place", category: "other" }),
      save({ category: "city" }),
    ]) {
      expect(tripReadiness([...base, extra]).ready).toBe(false);
    }
    expect(tripReadiness([...base, save({ extraction: "needs_review", category: "sight" })]).ready).toBe(true);
  });

  it("uses category overrides", () => {
    const saves = readyLisbon();
    const before = tripReadiness(saves).food;
    saves[0] = { ...saves[0]!, categoryOverride: "shopping" }; // the first save is a food place
    expect(tripReadiness(saves).food).toBe(before - 1);
  });

  it("accepts a custom rule", () => {
    expect(
      tripReadiness([save({ category: "food" })], { ...DEFAULT_TRIP_READY, minPlaces: 1, minActivity: 0 }).ready,
    ).toBe(true);
  });

  it("countsAsPlace mirrors the rules", () => {
    expect(countsAsPlace(save())).toBe(true);
    expect(countsAsPlace(save({ permanentlyClosed: true }))).toBe(false);
  });
});

describe("groupLibrary (FR-L6, LB-8)", () => {
  it("groups by country then city, case-insensitively, with counts", () => {
    const saves = [
      save({ regionOrCity: "Lisbon" }),
      save({ regionOrCity: "lisbon" }),
      save({ regionOrCity: "Porto" }),
      save({ country: "JP", regionOrCity: "Tokyo" }),
    ];
    const groups = groupLibrary(saves);
    expect(groups.map((g) => [g.country, g.count])).toEqual([
      ["PT", 3],
      ["JP", 1],
    ]);
    const pt = groups[0]!;
    expect(pt.tiles.map((t) => [t.city, t.count, t.level])).toEqual([
      ["Lisbon", 2, "city"],
      ["Porto", 1, "city"],
    ]);
    expect(tileLabel(pt.tiles[0]!.city!, pt.tiles[0]!.count)).toBe("Lisbon · 2");
  });

  it("files region-level and vague saves at country level, not forced to a city (LB-8)", () => {
    const groups = groupLibrary([save({ country: "JP", regionOrCity: null }), save({ country: "JP", regionOrCity: "Kyoto" })]);
    expect(groups[0]!.tiles.map((t) => [t.level, t.city])).toEqual([
      ["city", "Kyoto"],
      ["country", null],
    ]);
  });

  it("puts unknown-country saves last, with an unsorted tile", () => {
    const groups = groupLibrary([
      save({ country: null, regionOrCity: null, extraction: "not_a_place" }),
      save({ country: "PT" }),
    ]);
    expect(groups.map((g) => g.country)).toEqual(["PT", null]);
    expect(groups[1]!.tiles[0]!.level).toBe("unsorted");
  });

  it("follows overrides", () => {
    const groups = groupLibrary([save({ regionOrCityOverride: "Sintra" })]);
    expect(groups[0]!.tiles[0]!.city).toBe("Sintra");
  });

  it("marks trip-ready tiles", () => {
    const groups = groupLibrary([...readyLisbon(), save({ regionOrCity: "Porto" })]);
    const tiles = groups[0]!.tiles;
    expect(tiles.find((t) => t.city === "Lisbon")!.readiness.ready).toBe(true);
    expect(tiles.find((t) => t.city === "Porto")!.readiness.ready).toBe(false);
  });

  it("savesForPlace returns the tile's saves", () => {
    const a = save({ regionOrCity: "Lisboa" });
    const b = save({ regionOrCity: "Porto" });
    expect(savesForPlace([a, b], placeKey("PT", "LISBOA"))).toEqual([a]);
  });
});

describe("groupByCategory", () => {
  it("orders categories food first and drops empty ones", () => {
    const g = groupByCategory([save({ category: "sight" }), save({ category: "food" }), save({ category: "sight" })]);
    expect(g.map((x) => [x.category, x.saves.length])).toEqual([
      ["food", 1],
      ["sight", 2],
    ]);
  });
});

describe("preselectForTrip (FR-L11, D69)", () => {
  it("brings every save so the group decides in the trip", () => {
    const a = { ...save(), priority: "must" as const };
    const b = { ...save(), priority: "pass" as const };
    const c = { ...save({ extraction: "processing" }), priority: null };
    const d = { ...save({ extraction: "not_a_place" }), priority: null };
    expect(preselectForTrip([a, b, c, d])).toEqual([a.id, b.id, c.id, d.id]);
  });

  it("leaves permanently closed places behind (LB-9)", () => {
    const open = save();
    const closed = save({ permanentlyClosed: true });
    expect(preselectForTrip([open, closed])).toEqual([open.id]);
  });
});

describe("suggestTrip (FR-1a)", () => {
  it("names the trip after the city and uses it as the Stop", () => {
    expect(suggestTrip({ city: "Lisbon", countryName: "Portugal" })).toEqual({ name: "Lisbon trip", stopName: "Lisbon" });
  });
  it("falls back to the country with no Stop", () => {
    expect(suggestTrip({ city: null, countryName: "Japan" })).toEqual({ name: "Japan trip", stopName: null });
  });
  it("returns null with nothing known", () => {
    expect(suggestTrip({ city: null, countryName: null })).toBeNull();
  });
});
