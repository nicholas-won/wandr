import { describe, expect, it } from "vitest";
import {
  MoneyError,
  assertCurrency,
  assertMinor,
  currencyExponent,
  formatMinor,
  minorToDecimalString,
  parseMajorToMinor,
  toSafeNumber,
} from "../../src/money";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof MoneyError ? e.code : `non-money:${String(e)}`;
  }
  return "no-throw";
};

describe("currencyExponent", () => {
  it.each([
    ["USD", 2],
    ["EUR", 2],
    ["GBP", 2],
    ["MXN", 2],
    ["JPY", 0],
    ["KRW", 0],
    ["VND", 0],
    ["ISK", 0],
    ["KWD", 3],
    ["BHD", 3],
    ["OMR", 3],
    ["JOD", 3],
    ["TND", 3],
    ["CLF", 4],
  ])("%s -> %i", (c, e) => expect(currencyExponent(c)).toBe(e));

  it("rejects malformed codes", () => {
    for (const bad of ["usd", "US", "USDD", "", "U$D", "123"]) {
      expect(code(() => currencyExponent(bad))).toBe("INVALID_CURRENCY");
    }
    expect(code(() => assertCurrency(undefined as unknown as string))).toBe("INVALID_CURRENCY");
  });
});

describe("assertMinor / toSafeNumber", () => {
  it("accepts safe integers", () => {
    expect(() => assertMinor(0)).not.toThrow();
    expect(() => assertMinor(-5)).not.toThrow();
    expect(() => assertMinor(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });
  it("rejects floats, NaN, Infinity and unsafe integers", () => {
    expect(code(() => assertMinor(1.5))).toBe("INVALID_AMOUNT");
    expect(code(() => assertMinor(Number.NaN))).toBe("INVALID_AMOUNT");
    expect(code(() => assertMinor(Infinity))).toBe("INVALID_AMOUNT");
    expect(code(() => assertMinor("5" as unknown as number))).toBe("INVALID_AMOUNT");
    expect(code(() => assertMinor(2 ** 53))).toBe("UNSAFE_INTEGER");
  });
  it("toSafeNumber guards overflow", () => {
    expect(toSafeNumber(123n)).toBe(123);
    expect(code(() => toSafeNumber(2n ** 53n))).toBe("UNSAFE_INTEGER");
    expect(code(() => toSafeNumber(-(2n ** 53n)))).toBe("UNSAFE_INTEGER");
  });
});

describe("parseMajorToMinor", () => {
  it.each([
    ["12.34", "USD", 1234],
    ["12.3", "USD", 1230],
    ["12", "USD", 1200],
    ["0.01", "USD", 1],
    ["-12.34", "USD", -1234],
    ["+5", "USD", 500],
    ["  7.50 ", "USD", 750],
    ["1,234.56", "USD", 123456],
    ["1,234,567.89", "USD", 123456789],
    ["12.340", "USD", 1234],
    ["0.10", "USD", 10],
    ["-0", "USD", 0],
    ["1500", "JPY", 1500],
    ["1,500", "JPY", 1500],
    ["1500.00", "JPY", 1500],
    ["1.234", "KWD", 1234],
    ["0.005", "BHD", 5],
    ["0.1", "KWD", 100],
    ["90071992547409.91", "USD", 9007199254740991],
  ] as const)("%s %s -> %i", (s, c, n) => expect(parseMajorToMinor(s, c)).toBe(n));

  it("never produces -0", () => {
    expect(Object.is(parseMajorToMinor("-0.00", "USD"), 0)).toBe(true);
  });

  it("avoids float artifacts that naive parsing gets wrong", () => {
    // parseFloat("0.29") * 100 === 28.999999999999996
    expect(parseMajorToMinor("0.29", "USD")).toBe(29);
    expect(parseMajorToMinor("1.005", "KWD")).toBe(1005);
    expect(parseMajorToMinor("4.35", "USD")).toBe(435);
  });

  it("supports comma decimal separators", () => {
    expect(parseMajorToMinor("12,34", "EUR", { decimalSeparator: "," })).toBe(1234);
    expect(parseMajorToMinor("1.234,56", "EUR", { decimalSeparator: "," })).toBe(123456);
    expect(parseMajorToMinor("1234", "EUR", { decimalSeparator: "," })).toBe(123400);
  });

  it("rejects too many decimals instead of rounding", () => {
    expect(code(() => parseMajorToMinor("12.345", "USD"))).toBe("TOO_MANY_DECIMALS");
    expect(code(() => parseMajorToMinor("1500.5", "JPY"))).toBe("TOO_MANY_DECIMALS");
    expect(code(() => parseMajorToMinor("1.2345", "KWD"))).toBe("TOO_MANY_DECIMALS");
  });

  it("rejects garbage", () => {
    for (const bad of ["", "abc", "1.2.3", "12,34", "1,23", "1,2345.00", ".5", "5.", "$5", "5e3", "--5", "1 000", "NaN", "Infinity"]) {
      expect(code(() => parseMajorToMinor(bad, "USD")), bad).toBe("PARSE_ERROR");
    }
  });

  it("rejects amounts beyond the safe integer range", () => {
    expect(code(() => parseMajorToMinor("90071992547409.92", "USD"))).toBe("UNSAFE_INTEGER");
    expect(code(() => parseMajorToMinor("99999999999999999999", "JPY"))).toBe("UNSAFE_INTEGER");
  });

  it("rejects invalid currencies", () => {
    expect(code(() => parseMajorToMinor("1", "usd"))).toBe("INVALID_CURRENCY");
  });
});

describe("minorToDecimalString", () => {
  it.each([
    [1234, "USD", "12.34"],
    [5, "USD", "0.05"],
    [-5, "USD", "-0.05"],
    [0, "USD", "0.00"],
    [500, "JPY", "500"],
    [-500, "JPY", "-500"],
    [5, "KWD", "0.005"],
    [1234567, "BHD", "1234.567"],
    [Number.MAX_SAFE_INTEGER, "USD", "90071992547409.91"],
  ] as const)("%i %s -> %s", (n, c, s) => expect(minorToDecimalString(n, c)).toBe(s));

  it("round-trips with parseMajorToMinor", () => {
    for (const [n, c] of [
      [1, "USD"],
      [-99, "EUR"],
      [123456789, "JPY"],
      [1001, "KWD"],
    ] as const) {
      expect(parseMajorToMinor(minorToDecimalString(n, c), c)).toBe(n);
    }
  });
});

describe("formatMinor", () => {
  it("formats per currency exponent and locale", () => {
    expect(formatMinor(1234, "USD")).toBe("$12.34");
    expect(formatMinor(-1234, "USD")).toBe("-$12.34");
    expect(formatMinor(1500, "JPY", "en-US")).toBe("¥1,500");
    expect(formatMinor(1234, "KWD", "en-US")).toMatch(/KWD\s?1\.234/);
    expect(formatMinor(123456, "EUR", "de-DE")).toBe("1.234,56 €");
    expect(formatMinor(0, "USD")).toBe("$0.00");
  });
  it("keeps full precision for huge amounts", () => {
    expect(formatMinor(Number.MAX_SAFE_INTEGER, "USD")).toBe("$90,071,992,547,409.91");
  });
});
