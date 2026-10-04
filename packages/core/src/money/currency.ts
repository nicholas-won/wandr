import { MoneyError } from "./errors";

/**
 * Currency helpers (NFR-4, E-8).
 *
 * Money is always an integer count of the currency's minor unit (cents for USD,
 * yen for JPY, fils for KWD) plus an ISO 4217 code. Amounts are JS `number`s
 * that must be safe integers; anything that could overflow is computed with
 * BigInt and checked on the way out.
 */

/** ISO 4217 alphabetic code, e.g. "USD". Validated at runtime by {@link assertCurrency}. */
export type CurrencyCode = string;

/** ISO 4217 minor-unit exponents that differ from the default of 2. */
const EXPONENT_OVERRIDES: Readonly<Record<string, number>> = {
  // 0 decimals
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0,
  RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // 3 decimals
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // 4 decimals (accounting units)
  CLF: 4, UYW: 4,
};

const DEFAULT_EXPONENT = 2;
const CURRENCY_RE = /^[A-Z]{3}$/;

/** Throws INVALID_CURRENCY unless `code` looks like an ISO 4217 code (three uppercase letters). */
export function assertCurrency(code: string): asserts code is CurrencyCode {
  if (typeof code !== "string" || !CURRENCY_RE.test(code)) {
    throw new MoneyError("INVALID_CURRENCY", `Invalid ISO 4217 currency code: ${String(code)}`, {
      currency: code,
    });
  }
}

/** Number of minor-unit digits for a currency: JPY 0, KWD/BHD 3, default 2. */
export function currencyExponent(currency: CurrencyCode): number {
  assertCurrency(currency);
  return EXPONENT_OVERRIDES[currency] ?? DEFAULT_EXPONENT;
}

/** Throws unless `n` is a safe integer. Use on every amount that enters or leaves the domain. */
export function assertMinor(n: number, label = "amount"): void {
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new MoneyError("INVALID_AMOUNT", `${label} must be an integer number of minor units`, {
      value: n,
    });
  }
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError("UNSAFE_INTEGER", `${label} is outside the safe integer range`, { value: n });
  }
}

/** Converts a BigInt result back to a safe-integer number, throwing if it overflowed. */
export function toSafeNumber(b: bigint, label = "amount"): number {
  if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError("UNSAFE_INTEGER", `${label} is outside the safe integer range`, {
      value: b.toString(),
    });
  }
  return Number(b);
}

export interface ParseOptions {
  /**
   * Decimal separator of the input. Default ".". With ",", "." is accepted as a
   * thousands separator ("1.234,56"); with ".", "," is ("1,234.56").
   */
  decimalSeparator?: "." | ",";
}

/**
 * Parses a human-entered major-unit amount ("12.34", "-0.5", "1,234.56", "1234")
 * into integer minor units without ever going through a float.
 *
 * - Leading "+"/"-" and surrounding whitespace are allowed.
 * - Thousands separators must be well-formed groups of three.
 * - More fraction digits than the currency allows is an error (TOO_MANY_DECIMALS)
 *   unless the extra digits are zeros ("12.340" USD is fine, "12.345" is not).
 *   We never round silently.
 */
export function parseMajorToMinor(
  input: string,
  currency: CurrencyCode,
  options: ParseOptions = {},
): number {
  const exp = currencyExponent(currency);
  const dec = options.decimalSeparator ?? ".";
  const group = dec === "." ? "," : ".";
  const s = String(input).trim();

  const esc = (c: string) => (c === "." ? "\\." : c);
  const grouped = new RegExp(`^([+-]?)(\\d{1,3}(?:${esc(group)}\\d{3})+)(?:${esc(dec)}(\\d+))?$`);
  const plain = new RegExp(`^([+-]?)(\\d+)(?:${esc(dec)}(\\d+))?$`);
  const m = plain.exec(s) ?? grouped.exec(s);
  if (!m) {
    throw new MoneyError("PARSE_ERROR", `Cannot parse amount "${input}"`, { input, currency });
  }
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = (m[2] ?? "0").split(group).join("");
  let frac = m[3] ?? "";
  if (frac.length > exp) {
    const extra = frac.slice(exp);
    if (!/^0+$/.test(extra)) {
      throw new MoneyError(
        "TOO_MANY_DECIMALS",
        `${currency} allows ${exp} decimal place(s); got "${input}"`,
        { input, currency, exponent: exp },
      );
    }
    frac = frac.slice(0, exp);
  }
  frac = frac.padEnd(exp, "0");
  const minor = sign * BigInt(intPart + frac);
  const n = toSafeNumber(minor, "parsed amount");
  return n === 0 ? 0 : n; // normalize -0
}

/**
 * Exact decimal string for a minor amount, e.g. (1234, "USD") -> "12.34",
 * (-5, "KWD") -> "-0.005", (500, "JPY") -> "500". No grouping, no symbol.
 */
export function minorToDecimalString(minor: number, currency: CurrencyCode): string {
  assertMinor(minor);
  const exp = currencyExponent(currency);
  const neg = minor < 0;
  const digits = Math.abs(minor).toString().padStart(exp + 1, "0");
  const body = exp === 0 ? digits : `${digits.slice(0, -exp)}.${digits.slice(-exp)}`;
  return neg ? `-${body}` : body;
}

/**
 * Locale-aware display string ("$12.34", "¥500", "12,34 €"). Uses Intl with an
 * exact decimal string input, so huge amounts never lose precision.
 */
export function formatMinor(minor: number, currency: CurrencyCode, locale = "en-US"): string {
  const exp = currencyExponent(currency);
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  });
  return fmt.format(minorToDecimalString(minor, currency) as Intl.StringNumericLiteral);
}
