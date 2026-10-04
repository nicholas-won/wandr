import { describe, expect, it } from "vitest";
import {
  attendingMemberIds,
  defaultStop,
  distanceKm,
  fileIdea,
  isAttending,
  shouldShowStops,
  type StopLike,
} from "../src/stops";

const LISBON = { lat: 38.7223, lng: -9.1393 };
const PORTO = { lat: 41.1579, lng: -8.6291 };
const SINTRA = { lat: 38.8029, lng: -9.3817 }; // ~23 km from Lisbon
const MADRID = { lat: 40.4168, lng: -3.7038 };

const stop = (id: string, position: number, at: { lat: number; lng: number } | null, isDefault = false): StopLike => ({
  id,
  name: id,
  isDefault,
  position,
  lat: at?.lat ?? null,
  lng: at?.lng ?? null,
});

describe("shouldShowStops (P2)", () => {
  it.each([
    [0, false],
    [1, false],
    [2, true],
    [3, true],
  ])("%i stops → %s", (n, show) => {
    expect(shouldShowStops(Array.from({ length: n }, (_, i) => stop(`s${i}`, i, null)))).toBe(show);
  });
});

describe("defaultStop (§5)", () => {
  it("single Stop is the default", () => expect(defaultStop([stop("only", 0, null)])?.id).toBe("only"));
  it("isDefault wins in multi-Stop trips", () =>
    expect(defaultStop([stop("a", 0, LISBON), stop("hidden", 1, null, true)])?.id).toBe("hidden"));
  it("none otherwise", () => expect(defaultStop([stop("a", 0, LISBON), stop("b", 1, PORTO)])).toBeNull());
});

describe("distanceKm", () => {
  it("Lisbon–Porto ≈ 274 km", () => expect(distanceKm(LISBON, PORTO)).toBeCloseTo(274, -1));
  it("zero for the same point", () => expect(distanceKm(LISBON, LISBON)).toBe(0));
});

describe("fileIdea (FR-S3, FR-S6)", () => {
  const two = [stop("lis", 0, LISBON), stop("por", 1, PORTO)];

  it("nearest Stop within radius", () => {
    expect(fileIdea(SINTRA, two)).toMatchObject({ kind: "stop", stopId: "lis", alsoNearStopIds: [] });
    expect(fileIdea(PORTO, two)).toMatchObject({ kind: "stop", stopId: "por" });
  });

  it("outside every Stop → Unsorted with 'new city?' suggestion", () => {
    expect(fileIdea(MADRID, two)).toEqual({ kind: "unsorted", suggestNewCity: true });
  });

  it("radius is configurable (S-2 day trips)", () => {
    expect(fileIdea(SINTRA, two, { radiusKm: 10 })).toEqual({ kind: "unsorted", suggestNewCity: true });
    expect(fileIdea(MADRID, two, { radiusKm: 600 })).toMatchObject({ kind: "stop", stopId: "por", alsoNearStopIds: ["lis"] });
  });

  it("same city twice: tie → earlier Stop (S-3) with the other as 'also near'", () => {
    const loop = [stop("lis2", 2, LISBON), stop("lis1", 0, LISBON), stop("por", 1, PORTO)];
    expect(fileIdea(LISBON, loop)).toMatchObject({ stopId: "lis1", alsoNearStopIds: ["lis2"] });
  });

  it("no coordinates → default Stop, else Unsorted without a suggestion", () => {
    expect(fileIdea(null, [stop("only", 0, null, true)])).toEqual({ kind: "stop", stopId: "only", distanceKm: null, alsoNearStopIds: [] });
    expect(fileIdea(null, two)).toEqual({ kind: "unsorted", suggestNewCity: false });
    expect(fileIdea(null, [])).toEqual({ kind: "unsorted", suggestNewCity: false });
  });

  it("zero-setup trip (hidden Stop without coords) takes everything", () => {
    expect(fileIdea(MADRID, [stop("hidden", 0, null, true)])).toMatchObject({ kind: "stop", stopId: "hidden" });
  });

  it("single located Stop + far place → 'new city?'", () => {
    expect(fileIdea(PORTO, [stop("lis", 0, LISBON, true)])).toEqual({ kind: "unsorted", suggestNewCity: true });
  });
});

describe("attendance (FR-S7, S-12)", () => {
  const rows = [
    { stopId: "por", memberId: "maya", attending: false },
    { stopId: "lis", memberId: "maya", attending: true },
  ];
  it("attending unless explicitly not", () => {
    expect(isAttending("maya", "por", rows)).toBe(false);
    expect(isAttending("maya", "lis", rows)).toBe(true);
    expect(isAttending("sam", "por", rows)).toBe(true);
  });
  it("attendingMemberIds: active, attending, not hidden", () => {
    const members = [
      { memberId: "maya", status: "active" as const },
      { memberId: "sam", status: "active" as const },
      { memberId: "jo", status: "pending" as const },
      { memberId: "bride", status: "active" as const },
    ];
    expect(attendingMemberIds(members, "por", rows)).toEqual(["sam", "bride"]);
    expect(attendingMemberIds(members, "por", rows, ["bride"])).toEqual(["sam"]);
    expect(attendingMemberIds(members, "lis", rows)).toEqual(["maya", "sam", "bride"]);
  });
});
