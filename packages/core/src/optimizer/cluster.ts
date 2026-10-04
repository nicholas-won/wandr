import { haversineKm } from "./travel";
import type { LatLng } from "./types";

export interface ClusterPoint extends LatLng {
  id: string;
}

/**
 * Deterministic k-medoids (FR-O7). Seeds by farthest-first from `origin`
 * (lodging, or the centroid when unknown), then alternates assign / medoid
 * update until stable. Ties break by input order, so callers pass points
 * sorted by id. Returns, for each point, its cluster index, plus each
 * cluster's medoid point index.
 */
export function kMedoids(
  points: readonly ClusterPoint[],
  k: number,
  origin: LatLng | null,
): { assignment: number[]; medoids: number[] } {
  const n = points.length;
  if (n === 0 || k <= 0) return { assignment: points.map(() => -1), medoids: [] };
  k = Math.min(k, n);
  const dist = (i: number, j: number) => haversineKm(points[i]!, points[j]!);

  const o: LatLng =
    origin ??
    (() => {
      let lat = 0;
      let lng = 0;
      for (const p of points) {
        lat += p.lat;
        lng += p.lng;
      }
      return { lat: lat / n, lng: lng / n };
    })();

  // Farthest-first seeding.
  const medoids: number[] = [];
  let first = 0;
  let firstD = -1;
  for (let i = 0; i < n; i++) {
    const d = haversineKm(o, points[i]!);
    if (d > firstD + 1e-9) {
      firstD = d;
      first = i;
    }
  }
  medoids.push(first);
  const minD = points.map((_, i) => dist(i, first));
  while (medoids.length < k) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      if (medoids.includes(i)) continue;
      if (minD[i]! > bestD + 1e-9) {
        bestD = minD[i]!;
        best = i;
      }
    }
    if (best < 0) break;
    medoids.push(best);
    for (let i = 0; i < n; i++) minD[i] = Math.min(minD[i]!, dist(i, best));
  }

  const assignment = new Array<number>(n).fill(0);
  const assign = () => {
    for (let i = 0; i < n; i++) {
      let bc = 0;
      let bd = Infinity;
      for (let c = 0; c < medoids.length; c++) {
        const d = dist(i, medoids[c]!);
        if (d < bd - 1e-9) {
          bd = d;
          bc = c;
        }
      }
      assignment[i] = bc;
    }
  };
  for (let iter = 0; iter < 20; iter++) {
    assign();
    let changed = false;
    for (let c = 0; c < medoids.length; c++) {
      const members: number[] = [];
      for (let i = 0; i < n; i++) if (assignment[i] === c) members.push(i);
      let bestM = medoids[c]!;
      let bestSum = Infinity;
      for (const m of members) {
        let s = 0;
        for (const j of members) s += dist(m, j);
        if (s < bestSum - 1e-9) {
          bestSum = s;
          bestM = m;
        }
      }
      if (bestM !== medoids[c]) {
        medoids[c] = bestM;
        changed = true;
      }
    }
    if (!changed) break;
  }
  assign();
  return { assignment, medoids };
}
