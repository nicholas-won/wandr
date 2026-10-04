/**
 * Shared eval harness: turns JSON fixtures into pipeline inputs and scores outputs.
 * Used by evals/run.ts (live or heuristic) and by test/evals.test.ts (heuristic only).
 */
import captionsJson from "./captions.json";
import receiptsJson from "./receipts.json";
import type { ExtractionKind, ExtractionResult, TripContext } from "../src/extract";
import {
  detectLodging,
  extractHashtags,
  extractLocationTag,
  parseGoogleMapsUrl,
  type SourceMetadata,
} from "../src/intake";
import { normalizeUrl, type PastedKind } from "../src/url";
import type { ReceiptOutcome } from "../src/receipt";

export interface CaptionCase {
  id: string;
  note: string;
  source: {
    kind: PastedKind;
    url?: string;
    caption?: string;
    title?: string;
    description?: string;
    siteName?: string;
    creatorHandle?: string;
    userText?: string;
    fetchStatus?: SourceMetadata["fetchStatus"];
    jsonLdPlace?: SourceMetadata["jsonLdPlace"];
  };
  trip: keyof typeof TRIPS;
  expect: {
    kind?: ExtractionKind;
    kindAnyOf?: ExtractionKind[];
    places?: Array<{ name: string; altNames?: string[]; category?: string; city?: string; country?: string; regionOrCity?: string }>;
    maxPlaces?: number;
    maxConfidence?: number;
    mustNotInclude?: string[];
    summaryMustNotInclude?: string[];
    suspicious?: boolean;
    suggestedTripName?: boolean;
  };
}

export const TRIPS = {
  empty: { stops: [] },
  lisbon: { stops: [{ id: "stop-lis", name: "Lisbon", lat: 38.7223, lng: -9.1393 }] },
  cdmx: { stops: [{ id: "stop-cdmx", name: "Mexico City", lat: 19.4326, lng: -99.1332 }] },
  tokyo: { stops: [{ id: "stop-tyo", name: "Tokyo", lat: 35.6762, lng: 139.6503 }] },
  paris: { stops: [{ id: "stop-par", name: "Paris", lat: 48.8566, lng: 2.3522 }] },
  nyc: { stops: [{ id: "stop-nyc", name: "New York", lat: 40.7128, lng: -74.006 }] },
  barcelona: { stops: [{ id: "stop-bcn", name: "Barcelona", lat: 41.3874, lng: 2.1686 }] },
  rome: { stops: [{ id: "stop-rom", name: "Rome", lat: 41.9028, lng: 12.4964 }] },
  santorini: { stops: [{ id: "stop-jtr", name: "Santorini", lat: 36.3932, lng: 25.4615 }] },
} satisfies Record<string, TripContext>;

export const captionCases = captionsJson as unknown as CaptionCase[];

/** Build the SourceMetadata intake would have produced for this fixture (no network). */
export function metaFromCase(c: CaptionCase): SourceMetadata {
  const s = c.source;
  const text = [s.caption, s.description, s.userText].filter(Boolean).join("\n");
  const meta: SourceMetadata = {
    kind: s.kind,
    url: s.url ?? null,
    normalizedUrl: s.url ? normalizeUrl(s.url) : null,
    userText: s.userText ?? "",
    title: s.title,
    caption: s.caption,
    description: s.description,
    siteName: s.siteName,
    creatorHandle: s.creatorHandle,
    hashtags: extractHashtags(text),
    locationTag: extractLocationTag(text),
    jsonLdPlace: s.jsonLdPlace,
    fetchStatus: s.fetchStatus ?? (s.url ? "ok" : "skipped"),
    warnings: [],
  };
  if (s.kind === "google_maps" && s.url) meta.maps = parseGoogleMapsUrl(s.url);
  if (s.url) meta.lodging = detectLodging(s.url);
  return meta;
}

function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export interface CaseScore {
  id: string;
  score: number;
  kindOk: boolean;
  recall: number;
  categoryAcc: number | null;
  safetyOk: boolean;
  notes: string[];
}

/** Score one extraction against the fixture's expectations (0..1; safety failures score 0). */
export function scoreCaption(c: CaptionCase, r: ExtractionResult): CaseScore {
  const e = c.expect;
  const notes: string[] = [];
  const kindOk = e.kind ? r.kind === e.kind : e.kindAnyOf ? e.kindAnyOf.includes(r.kind) : true;
  if (!kindOk) notes.push(`kind ${r.kind} ≠ ${e.kind ?? e.kindAnyOf?.join("|")}`);

  let matched = 0;
  let catHits = 0;
  let catTotal = 0;
  for (const exp of e.places ?? []) {
    const names = [exp.name, ...(exp.altNames ?? [])].map(fold);
    const hit = r.places.find((p) => names.some((n) => fold(p.name).includes(n) || fold(p.searchQuery).includes(n)));
    if (hit) {
      matched++;
      if (exp.category) {
        catTotal++;
        if (hit.category === exp.category) catHits++;
        else notes.push(`${exp.name}: category ${hit.category} ≠ ${exp.category}`);
      }
      if (exp.country) {
        catTotal++;
        if (hit.country === exp.country) catHits++;
        else notes.push(`${exp.name}: country ${hit.country} ≠ ${exp.country}`);
      }
      if (exp.regionOrCity) {
        catTotal++;
        if (hit.regionOrCity && fold(hit.regionOrCity) === fold(exp.regionOrCity)) catHits++;
        else notes.push(`${exp.name}: regionOrCity ${hit.regionOrCity} ≠ ${exp.regionOrCity}`);
      }
      if (exp.city && hit.cityHint && !fold(hit.cityHint).includes(fold(exp.city)) && !fold(exp.city).includes(fold(hit.cityHint)))
        notes.push(`${exp.name}: city ${hit.cityHint} ≠ ${exp.city}`);
    } else notes.push(`missing ${exp.name}`);
  }
  const expectedCount = e.places?.length ?? 0;
  const recall = expectedCount ? matched / expectedCount : 1;
  let countOk = true;
  if (e.maxPlaces !== undefined && r.places.length > e.maxPlaces) {
    countOk = false;
    notes.push(`${r.places.length} places > max ${e.maxPlaces}`);
  }
  if (e.maxConfidence !== undefined && r.places.some((p) => p.confidence > e.maxConfidence!)) {
    notes.push(`confidence above ${e.maxConfidence}`);
    countOk = false;
  }

  let safetyOk = true;
  for (const bad of e.mustNotInclude ?? []) {
    if (r.places.some((p) => fold(`${p.name} ${p.searchQuery} ${p.cityHint ?? ""}`).includes(fold(bad)))) {
      safetyOk = false;
      notes.push(`SAFETY: output contains "${bad}"`);
    }
  }
  for (const bad of e.summaryMustNotInclude ?? []) {
    if (r.places.some((p) => fold(p.summary).includes(fold(bad)))) {
      safetyOk = false;
      notes.push(`SAFETY: summary contains "${bad}"`);
    }
  }
  if (e.suspicious && !r.suspiciousInstructions) notes.push("injection not flagged");
  if (e.suspicious && r.places.some((p) => p.confidence >= 0.6)) notes.push("injection case not sent to review");
  if (e.suggestedTripName && !r.suggestedTripName) notes.push("no suggested trip name");

  const categoryAcc = catTotal ? catHits / catTotal : null;
  const parts = [kindOk ? 1 : 0, recall, categoryAcc ?? 1, countOk ? 1 : 0];
  const score = safetyOk ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  return { id: c.id, score, kindOk, recall, categoryAcc, safetyOk, notes };
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export interface ReceiptCase {
  id: string;
  note: string;
  text: string;
  hints?: { currency?: string; country?: string };
  expect: {
    currency?: string;
    totalMinor?: number;
    itemCount?: number;
    taxMinor?: number;
    tipMinor?: number;
    serviceChargeMinor?: number;
    taxIncluded?: boolean;
    unassignedDifferenceMinor?: number;
    ok?: boolean;
    issues?: string[];
    category?: string;
    date?: string;
  };
}

export const receiptCases = receiptsJson as unknown as ReceiptCase[];

export function scoreReceipt(c: ReceiptCase, out: ReceiptOutcome | null): { id: string; score: number; notes: string[] } {
  if (!out) return { id: c.id, score: 0, notes: ["no output"] };
  const e = c.expect;
  const r = out.receipt;
  const v = out.validation;
  const checks: Array<[string, boolean]> = [];
  if (e.currency !== undefined) checks.push([`currency ${r.currency}`, r.currency === e.currency]);
  if (e.totalMinor !== undefined) checks.push([`total ${r.totalMinor}`, r.totalMinor === e.totalMinor]);
  if (e.itemCount !== undefined) checks.push([`items ${r.items.length}`, r.items.length === e.itemCount]);
  if (e.taxMinor !== undefined) checks.push([`tax ${r.taxMinor}`, r.taxMinor === e.taxMinor]);
  if (e.tipMinor !== undefined) checks.push([`tip ${r.tipMinor}`, r.tipMinor === e.tipMinor]);
  if (e.serviceChargeMinor !== undefined) checks.push([`service ${r.serviceChargeMinor}`, r.serviceChargeMinor === e.serviceChargeMinor]);
  if (e.taxIncluded !== undefined) checks.push([`taxIncluded ${r.taxIncluded}`, r.taxIncluded === e.taxIncluded]);
  if (e.unassignedDifferenceMinor !== undefined)
    checks.push([`diff ${v.unassignedDifferenceMinor}`, v.unassignedDifferenceMinor === e.unassignedDifferenceMinor]);
  if (e.ok !== undefined) checks.push([`ok ${v.ok} (${v.issues.map((i) => i.code).join(",")})`, v.ok === e.ok]);
  for (const code of e.issues ?? []) checks.push([`issue ${code}`, v.issues.some((i) => i.code === code)]);
  if (e.category !== undefined) checks.push([`category ${r.category}`, r.category === e.category]);
  if (e.date !== undefined) checks.push([`date ${r.date}`, r.date === e.date]);
  const passed = checks.filter(([, ok]) => ok).length;
  return { id: c.id, score: checks.length ? passed / checks.length : 1, notes: checks.filter(([, ok]) => !ok).map(([n]) => n) };
}
