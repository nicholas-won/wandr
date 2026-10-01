import { compareIds } from "./allocate";
import { assertCurrency, assertMinor, currencyExponent, toSafeNumber, type CurrencyCode } from "./currency";
import { MoneyError } from "./errors";
import type { MemberId, Share } from "./types";

/**
 * Spend reports (FR-65, FR-66): category breakdown and per-person spend, kept
 * per currency, plus an APPROXIMATE total in a display currency.
 *
 * The display-currency conversion is the only place in the money domain where
 * approximation is allowed. Its output is for display only and must never feed
 * balances, splits or settlement.
 */

/** FR-65 categories; mirrors the `expense_category` enum in @wandr/db. */
export type ExpenseCategory = "lodging" | "food_drink" | "transport" | "activities" | "shopping" | "other";

export interface ReportExpense {
  currency: CurrencyCode;
  totalMinor: number;
  category: ExpenseCategory;
  shares: readonly Share[];
}

type PerCurrency<K extends string> = Record<CurrencyCode, Record<K, number>>;

function addTo<K extends string>(acc: Map<CurrencyCode, Map<K, bigint>>, cur: CurrencyCode, key: K, v: bigint) {
  let m = acc.get(cur);
  if (!m) acc.set(cur, (m = new Map()));
  m.set(key, (m.get(key) ?? 0n) + v);
}

function freeze<K extends string>(acc: Map<CurrencyCode, Map<K, bigint>>): PerCurrency<K> {
  const out = {} as PerCurrency<K>;
  for (const cur of [...acc.keys()].sort()) {
    const m = acc.get(cur)!;
    const row = {} as Record<K, number>;
    for (const k of [...m.keys()].sort(compareIds)) row[k] = toSafeNumber(m.get(k)!);
    out[cur] = row;
  }
  return out;
}

/** Total per category, per currency. Refunds (negative totals) reduce their category. */
export function categoryTotals(expenses: readonly ReportExpense[]): PerCurrency<ExpenseCategory> {
  const acc = new Map<CurrencyCode, Map<ExpenseCategory, bigint>>();
  for (const e of expenses) {
    assertCurrency(e.currency);
    assertMinor(e.totalMinor, "totalMinor");
    addTo(acc, e.currency, e.category, BigInt(e.totalMinor));
  }
  return freeze(acc);
}

/**
 * Each person's spend per currency = the sum of their shares (what they
 * consumed, not what they paid). Includes "just me" expenses (FR-T10).
 */
export function spendPerPerson(expenses: readonly ReportExpense[]): PerCurrency<MemberId> {
  const acc = new Map<CurrencyCode, Map<MemberId, bigint>>();
  for (const e of expenses) {
    assertCurrency(e.currency);
    for (const s of e.shares) {
      assertMinor(s.shareMinor, "shareMinor");
      addTo(acc, e.currency, s.memberId, BigInt(s.shareMinor));
    }
  }
  return freeze(acc);
}

/**
 * Exchange rates in Frankfurter's shape: 1 unit of `base` = `rates[X]` units of
 * X, as DECIMAL STRINGS (e.g. "157.23", "0.9241") so no float ever enters the
 * math. The base currency's own rate is implicitly "1".
 */
export interface ExchangeRates {
  base: CurrencyCode;
  rates: Readonly<Record<CurrencyCode, string>>;
}

interface Rational {
  n: bigint;
  d: bigint;
}

/** Parses a positive decimal string ("1", "0.9241", "157.230") into an exact rational. */
export function parseRate(s: string): Rational {
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(String(s));
  if (!m) throw new MoneyError("INVALID_RATE", `Invalid exchange rate "${s}"`);
  const frac = m[2] ?? "";
  const n = BigInt((m[1] ?? "0") + frac);
  const d = 10n ** BigInt(frac.length);
  if (n === 0n) throw new MoneyError("INVALID_RATE", "Exchange rate must be positive");
  return { n, d };
}

function rateOf(rates: ExchangeRates, cur: CurrencyCode): Rational | undefined {
  if (cur === rates.base) return { n: 1n, d: 1n };
  const r = rates.rates[cur];
  return r === undefined ? undefined : parseRate(r);
}

/** Divides with rounding half away from zero. */
function divRound(num: bigint, den: bigint): bigint {
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = (a * 2n + den) / (den * 2n);
  return neg ? -q : q;
}

/**
 * APPROXIMATE conversion of a minor amount to another currency's minor units,
 * for display only (FR-66). Rounded half away from zero to the target's minor
 * unit. Throws MISSING_RATE if either currency has no rate.
 */
export function convertApprox(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: ExchangeRates,
): number {
  assertMinor(amountMinor);
  assertCurrency(from);
  assertCurrency(to);
  assertCurrency(rates.base);
  if (from === to) return amountMinor;
  const rf = rateOf(rates, from);
  const rt = rateOf(rates, to);
  if (!rf || !rt) {
    throw new MoneyError("MISSING_RATE", "No exchange rate for this currency", { currency: !rf ? from : to });
  }
  const ef = 10n ** BigInt(currencyExponent(from));
  const et = 10n ** BigInt(currencyExponent(to));
  // minor_to = minor_from / 10^ef / (rf) * (rt) * 10^et
  const num = BigInt(amountMinor) * rt.n * rf.d * et;
  const den = ef * rt.d * rf.n;
  return toSafeNumber(divRound(num, den), "converted amount");
}

export interface ApproximateTotal {
  currency: CurrencyCode;
  /** Sum of the convertible amounts, in display-currency minor units. Approximate. */
  approxMinor: number;
  approximate: true;
  /** Currencies left out because no rate was available (sorted). */
  missingCurrencies: CurrencyCode[];
}

/**
 * Approximate total of per-currency amounts in one display currency. Each
 * currency is converted once (not each expense) to limit rounding drift.
 */
export function approximateTotal(
  byCurrency: Readonly<Record<CurrencyCode, number>>,
  displayCurrency: CurrencyCode,
  rates: ExchangeRates,
): ApproximateTotal {
  assertCurrency(displayCurrency);
  let sum = 0n;
  const missing: CurrencyCode[] = [];
  for (const cur of Object.keys(byCurrency).sort()) {
    try {
      sum += BigInt(convertApprox(byCurrency[cur]!, cur, displayCurrency, rates));
    } catch (e) {
      if (e instanceof MoneyError && e.code === "MISSING_RATE") missing.push(cur);
      else throw e;
    }
  }
  return { currency: displayCurrency, approxMinor: toSafeNumber(sum), approximate: true, missingCurrencies: missing };
}

/** Category breakdown in a display currency (FR-66): approximate, display only. */
export function approximateCategoryTotals(
  expenses: readonly ReportExpense[],
  displayCurrency: CurrencyCode,
  rates: ExchangeRates,
): { currency: CurrencyCode; approximate: true; byCategory: Partial<Record<ExpenseCategory, number>>; missingCurrencies: CurrencyCode[] } {
  const per = categoryTotals(expenses);
  const byCat = new Map<ExpenseCategory, Record<CurrencyCode, number>>();
  for (const [cur, row] of Object.entries(per)) {
    for (const [cat, v] of Object.entries(row) as [ExpenseCategory, number][]) {
      const m = byCat.get(cat) ?? {};
      m[cur] = v;
      byCat.set(cat, m);
    }
  }
  const missing = new Set<CurrencyCode>();
  const byCategory: Partial<Record<ExpenseCategory, number>> = {};
  for (const cat of [...byCat.keys()].sort()) {
    const t = approximateTotal(byCat.get(cat)!, displayCurrency, rates);
    byCategory[cat] = t.approxMinor;
    t.missingCurrencies.forEach((c) => missing.add(c));
  }
  return { currency: displayCurrency, approximate: true, byCategory, missingCurrencies: [...missing].sort() };
}
