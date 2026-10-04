import { describe, expect, it } from "vitest";
import {
  boundsContains,
  categoryToken,
  clusterPins,
  GROUP_BELOW_ZOOM,
  isLocated,
  legendFor,
  locatedPins,
  markerLabel,
  NO_CLUSTER_FROM_ZOOM,
  pinBounds,
  pinSetKey,
  project,
  routeCoordinates,
  viewBounds,
  type LocatedPin,
  type MapPin,
} from "./map-helpers";

const pin = (id: string, lat: number, lng: number, extra: Partial<Omit<MapPin, "id" | "lat" | "lng">> = {}): LocatedPin => ({
  id,
  lat,
  lng,
  title: `Place ${id}`,
  category: "food",
  ...extra,
});

// Lisbon and Porto, ~275 km apart.
const lisbon = [pin("a", 38.7139, -9.1394, { group: "Lisbon" }), pin("b", 38.7169, -9.1399, { group: "Lisbon" }), pin("c", 38.6916, -9.2160, { group: "Lisbon" })];
const porto = [pin("d", 41.1579, -8.6291, { group: "Porto" }), pin("e", 41.1496, -8.6109, { group: "Porto" })];

describe("isLocated / locatedPins", () => {
  it("drops missing, non-finite and out-of-range coordinates", () => {
    const pins: MapPin[] = [
      pin("ok", 1, 2),
      { ...pin("x", 0, 0), lat: null },
      { ...pin("y", 0, 0), lng: Number.NaN },
      pin("z", 95, 0),
      pin("w", 0, 181),
      pin("zero", 0, 0),
    ];
    expect(locatedPins(pins).map((p) => p.id)).toEqual(["ok", "zero"]);
    expect(isLocated({ ...pin("n", 0, 0), lat: null })).toBe(false);
  });
});

describe("pinBounds", () => {
  it("returns null for no pins", () => {
    expect(pinBounds([])).toBeNull();
  });

  it("covers every pin", () => {
    const all = [...lisbon, ...porto];
    const b = pinBounds(all)!;
    for (const p of all) expect(boundsContains(b, p)).toBe(true);
    expect(b.south).toBeCloseTo(38.6916);
    expect(b.north).toBeCloseTo(41.1579);
    expect(b.west).toBeCloseTo(-9.216);
    expect(b.east).toBeCloseTo(-8.6109);
  });

  it("pads a single point to a minimum span instead of street level", () => {
    const b = pinBounds([pin("a", 10, 20)], 0.02)!;
    expect(b.east - b.west).toBeCloseTo(0.02);
    expect(b.north - b.south).toBeCloseTo(0.02);
    expect(boundsContains(b, { lat: 10, lng: 20 })).toBe(true);
  });

  it("clamps padding near the poles", () => {
    const b = pinBounds([pin("a", 85, 0)], 1)!;
    expect(b.north).toBeLessThanOrEqual(85);
  });
});

describe("project", () => {
  it("maps the origin to the world centre and doubles per zoom", () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const z1 = project({ lat: 10, lng: 10 }, 1);
    const z2 = project({ lat: 10, lng: 10 }, 2);
    expect(z2.x).toBeCloseTo(z1.x * 2);
    expect(z2.y).toBeCloseTo(z1.y * 2);
  });
});

describe("clusterPins", () => {
  const all = [...lisbon, ...porto];

  it("groups by city when zoomed out with several cities (FR-L7)", () => {
    const out = clusterPins(all, GROUP_BELOW_ZOOM - 3);
    expect(out).toHaveLength(2);
    const byName = Object.fromEntries(out.map((m) => [m.kind === "cluster" ? m.name : m.pin.id, m]));
    expect(byName.Lisbon).toMatchObject({ kind: "cluster", count: 3 });
    expect(byName.Porto).toMatchObject({ kind: "cluster", count: 2 });
  });

  it("uses Stop names for groups when given", () => {
    const pins = [pin("a", 38.7, -9.1, { stopId: "s1" }), pin("b", 38.71, -9.1, { stopId: "s1" }), pin("c", 41.1, -8.6, { stopId: "s2" })];
    const out = clusterPins(pins, 4, { groupNames: new Map([["s1", "Lisbon"], ["s2", "Porto"]]) });
    const cluster = out.find((m) => m.kind === "cluster");
    expect(cluster).toMatchObject({ name: "Lisbon", count: 2 });
    expect(out.find((m) => m.kind === "pin")).toMatchObject({ pin: { id: "c" } });
  });

  it("merges only overlapping pins at city zoom", () => {
    const out = clusterPins(lisbon, 12);
    // a and b are ~330 m apart (same 44px cell at z12); c is ~7 km away.
    const counts = out.map((m) => (m.kind === "cluster" ? m.count : 1)).sort();
    expect(counts.reduce((s, n) => s + n, 0)).toBe(3);
    expect(out.some((m) => m.kind === "pin" && m.pin.id === "c")).toBe(true);
  });

  it("never clusters at high zoom", () => {
    const same = [pin("a", 1, 1), pin("b", 1, 1)];
    expect(clusterPins(same, NO_CLUSTER_FROM_ZOOM).every((m) => m.kind === "pin")).toBe(true);
  });

  it("keeps the selected pin out of clusters", () => {
    const out = clusterPins(all, 3, { selectedId: "b" });
    expect(out.some((m) => m.kind === "pin" && m.pin.id === "b")).toBe(true);
    const lis = out.find((m) => m.kind === "cluster" && m.name === "Lisbon");
    expect(lis).toMatchObject({ count: 2 });
    expect(lis && lis.kind === "cluster" ? lis.pinIds : []).not.toContain("b");
  });

  it("draws every pin when clustering is off (a day's route)", () => {
    expect(clusterPins(all, 2, { cluster: false })).toHaveLength(all.length);
  });

  it("keeps every pin exactly once", () => {
    for (const z of [1, 5, 9, 12, 15]) {
      const out = clusterPins(all, z, { selectedId: "d" });
      const ids = out.flatMap((m) => (m.kind === "pin" ? [m.pin.id] : m.pinIds)).sort();
      expect(ids).toEqual(["a", "b", "c", "d", "e"]);
      expect(new Set(out.map((m) => m.key)).size).toBe(out.length);
    }
  });
});

describe("routeCoordinates", () => {
  it("follows route order and skips unknown or unlocated ids", () => {
    expect(routeCoordinates(["d", "missing", "a"], [...lisbon, ...porto])).toEqual([
      { lat: 41.1579, lng: -8.6291 },
      { lat: 38.7139, lng: -9.1394 },
    ]);
    expect(routeCoordinates(undefined, lisbon)).toEqual([]);
  });
});

describe("categoryToken / legendFor", () => {
  it("maps categories to theme tokens, unknown to the neutral token", () => {
    expect(categoryToken("food")).toBe("--primary");
    expect(categoryToken("drink")).toBe("--primary");
    expect(categoryToken("sight")).toBe("--vote-down");
    expect(categoryToken("stay")).toBe("--secondary-foreground");
    expect(categoryToken("whatever")).toBe("--vote-pass");
    expect(categoryToken(null)).toBe("--vote-pass");
  });

  it("merges legend entries that share a colour", () => {
    expect(legendFor([{ category: "food" }, { category: "drink" }, { category: "food" }, { category: "sight" }])).toEqual([
      { token: "--primary", label: "Food & Drinks" },
      { token: "--vote-down", label: "Sights" },
    ]);
  });
});

describe("markerLabel / pinSetKey", () => {
  it("labels pins and clusters for screen readers", () => {
    expect(markerLabel({ kind: "pin", key: "p:a", pin: pin("a", 1, 1, { label: "2" }), lat: 1, lng: 1 })).toBe("2. Place a");
    expect(markerLabel({ kind: "cluster", key: "c", lat: 0, lng: 0, count: 4, pinIds: [], name: "Lisbon" })).toBe("Lisbon: 4 places. Zoom in.");
  });

  it("is order-independent", () => {
    expect(pinSetKey([{ id: "b" }, { id: "a" }])).toBe(pinSetKey([{ id: "a" }, { id: "b" }]));
  });
});

describe("viewBounds (FR-S9)", () => {
  it("fits the pins when there are any", () => {
    expect(viewBounds([{ lat: 1, lng: 2 }], { lat: 50, lng: 50 })).toEqual(pinBounds([{ lat: 1, lng: 2 }]));
  });
  it("opens on the Stop at city scale when nothing is located", () => {
    const b = viewBounds([], { lat: 38.72, lng: -9.14 })!;
    expect(b.north - b.south).toBeCloseTo(0.2);
    expect(boundsContains(b, { lat: 38.72, lng: -9.14 })).toBe(true);
  });
  it("null without pins or a Stop location", () => {
    expect(viewBounds([], null)).toBeNull();
  });
});
