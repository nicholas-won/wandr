/**
 * Budget check-in (FR-74, FR-T4, FR-T9, D11, D58, DN-14 option A via D44, V-5, M-7).
 *
 * Money is integer minor units + ISO currency (never floats).
 *
 * - Group (3+): each member's range is private. The group sees a rounded band, only when at least
 *   3 people have answered (FR-74). Ideas are tagged "within budget" / "splurge".
 * - Duo: each person sees the other's range after both have answered, with a heads-up before
 *   entering (FR-T9). Ideas are tagged "within both budgets" / "over one of your budgets".
 * - Solo: personal budget; ideas tagged within / over.
 *
 * Who may see an individual answer is recorded per answer in `openTo` (like votes): an answer
 * entered while the trip is a duo is open to the pair; entered in a group or solo, to nobody.
 * So answers given privately in a group are never revealed if the trip shrinks to a duo, and the
 * original duo keep seeing each other's ranges after a third person joins (FR-T4).
 */
import type { MemberId, TripSize } from "./domain";
import { computeOpenTo } from "./voting/visibility";

export interface BudgetAnswer {
  memberId: MemberId;
  currency: string;
  minMinor: number;
  maxMinor: number;
  /** Members allowed to see this exact range (duo pair), see module docs. */
  openTo: readonly MemberId[];
}

/** FR-74: minimum answers before the group band is shown. */
export const MIN_ANSWERS_FOR_BAND = 3;

/** `openTo` for a newly entered/updated answer (same rule as votes, FR-T9). */
export function computeBudgetOpenTo(size: TripSize, activeMemberIds: readonly MemberId[]): MemberId[] {
  return computeOpenTo(size, activeMemberIds);
}

/** Number of minor units per major unit for an ISO 4217 code (USD → 100, JPY → 1). */
export function minorPerMajor(currency: string): number {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits;
  return 10 ** (digits ?? 2);
}

/** Step = 10^(number of digits − 1) of a positive integer: 47 → 10, 320 → 100, 1250 → 1000. */
function oneSigFigStep(n: number): number {
  return n <= 0 ? 1 : 10 ** (String(Math.trunc(n)).length - 1);
}

/**
 * Round DOWN to one significant figure in whole major units, e.g. $320.75 → $300, $47 → $40,
 * $1,250 → $1,000. Returns minor units.
 */
export function roundBandDown(amountMinor: number, currency: string): number {
  assertMinor(amountMinor);
  const unit = minorPerMajor(currency);
  const major = Math.floor(amountMinor / unit);
  const step = oneSigFigStep(major);
  return Math.floor(major / step) * step * unit;
}

/**
 * Round UP to one significant figure in whole major units, e.g. $470 → $500, $41 → $50,
 * $1,001 → $2,000, $999.50 → $1,000. Returns minor units.
 */
export function roundBandUp(amountMinor: number, currency: string): number {
  assertMinor(amountMinor);
  const unit = minorPerMajor(currency);
  const major = Math.ceil(amountMinor / unit);
  const step = oneSigFigStep(major);
  return Math.ceil(major / step) * step * unit;
}

function assertMinor(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Expected non-negative integer minor units, got ${n}`);
}

export interface BudgetBand {
  currency: string;
  lowMinor: number;
  highMinor: number;
}

/**
 * FR-74 group band. Null unless at least 3 members answered in `currency`.
 * Band = [lowest minimum, lowest maximum] across answers, rounded OUTWARD to one significant
 * figure (DN-14 A: "a rounded band derived from the lowest answers"). The high end is the level
 * every respondent said they're comfortable with, so it's what "within budget" is measured against.
 * Rounding outward + the n ≥ 3 rule stop the band from echoing one person's exact answer (V-5).
 */
export function groupBudgetBand(answers: readonly BudgetAnswer[], currency: string): BudgetBand | null {
  const inCurrency = answers.filter((a) => a.currency === currency);
  if (inCurrency.length < MIN_ANSWERS_FOR_BAND) return null;
  const lowestMin = Math.min(...inCurrency.map((a) => a.minMinor));
  const lowestMax = Math.min(...inCurrency.map((a) => a.maxMinor));
  return {
    currency,
    lowMinor: roundBandDown(lowestMin, currency),
    highMinor: roundBandUp(lowestMax, currency),
  };
}

export interface BudgetRange {
  memberId: MemberId;
  currency: string;
  minMinor: number;
  maxMinor: number;
}

export interface BudgetView {
  size: TripSize;
  own: BudgetRange | null;
  /** Other members' exact ranges this viewer may see. */
  others: BudgetRange[];
  /** Group band (group size only, ≥3 answers). */
  band: BudgetBand | null;
}

const toRange = (a: BudgetAnswer): BudgetRange => ({
  memberId: a.memberId,
  currency: a.currency,
  minMinor: a.minMinor,
  maxMinor: a.maxMinor,
});

/**
 * What one member may see (FR-74, FR-T4, FR-T9).
 * - solo: own only.
 * - duo: own; the other's range only once the viewer has answered too AND the other's answer is
 *   open to the viewer (entered as a duo). No band.
 * - group: own; any answer open to the viewer (the original duo pair, FR-T4); the band if ≥3 answered.
 */
export function budgetView(input: {
  viewerId: MemberId;
  size: TripSize;
  answers: readonly BudgetAnswer[];
  currency: string;
}): BudgetView {
  const { viewerId, size, answers, currency } = input;
  const ownAnswer = answers.find((a) => a.memberId === viewerId) ?? null;
  const own = ownAnswer ? toRange(ownAnswer) : null;
  const openToViewer = answers
    .filter((a) => a.memberId !== viewerId && a.openTo.includes(viewerId))
    .map(toRange);

  switch (size) {
    case "solo":
      return { size, own, others: [], band: null };
    case "duo":
      return { size, own, others: own ? openToViewer : [], band: null };
    case "group":
      return { size, own, others: openToViewer, band: groupBudgetBand(answers, currency) };
  }
}

export type BudgetTag =
  | "within_budget" // group (≤ band) and solo
  | "splurge" // group: above the band
  | "over_budget" // solo: above own max
  | "within_both" // duo
  | "over_one" // duo: above exactly one person's max
  | "over_both"; // duo: above both maxes

export const BUDGET_TAG_LABELS: Record<BudgetTag, string> = {
  within_budget: "within budget",
  splurge: "splurge",
  over_budget: "over budget",
  within_both: "within both budgets",
  over_one: "over one of your budgets",
  over_both: "over both budgets",
};

/**
 * Tag an idea's estimated price (minor units, same currency) for a viewer's budget view.
 * Returns null when there's nothing to compare against (no price, other currency, band not
 * available yet, duo partner's range not visible).
 */
export function tagIdeaPrice(
  price: { amountMinor: number; currency: string } | null,
  view: BudgetView,
): BudgetTag | null {
  if (!price) return null;
  assertMinor(price.amountMinor);
  const p = price.amountMinor;

  switch (view.size) {
    case "solo":
      if (!view.own || view.own.currency !== price.currency) return null;
      return p <= view.own.maxMinor ? "within_budget" : "over_budget";
    case "duo": {
      const other = view.others[0];
      if (!view.own || !other) return null;
      if (view.own.currency !== price.currency || other.currency !== price.currency) return null;
      const over = [view.own, other].filter((r) => p > r.maxMinor).length;
      return over === 0 ? "within_both" : over === 1 ? "over_one" : "over_both";
    }
    case "group":
      if (!view.band || view.band.currency !== price.currency) return null;
      return p <= view.band.highMinor ? "within_budget" : "splurge";
  }
}
