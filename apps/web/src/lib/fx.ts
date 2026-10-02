/**
 * Exchange rates from Frankfurter (§7a) for the APPROXIMATE display-currency total only
 * (FR-66). Never used for balances, splits or settlement.
 *
 * Rates are kept as decimal strings straight from the response text (no float parsing), as
 * `money.ExchangeRates` expects. Cached in memory for an hour; failures return null and the UI
 * simply leaves the approximate total out.
 */
import type { money } from "@wandr/core";

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; rates: money.ExchangeRates }>();

/** Pulls `"XXX": 1.2345` pairs out of the `rates` object as exact decimal strings. */
export function parseFrankfurterRates(text: string, base: string): money.ExchangeRates | null {
  const block = /"rates"\s*:\s*\{([^}]*)\}/.exec(text);
  if (!block) return null;
  const rates: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/"([A-Z]{3})"\s*:\s*(\d+(?:\.\d+)?)(?=\s*[,}]|\s*$)/g)) {
    rates[m[1]!] = m[2]!;
  }
  return { base, rates };
}

export async function getRates(
  base: string,
  f: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<money.ExchangeRates | null> {
  if (!/^[A-Z]{3}$/.test(base)) return null;
  const hit = cache.get(base);
  if (hit && now - hit.at < TTL_MS) return hit.rates;
  const origin = (process.env.FRANKFURTER_URL || "https://api.frankfurter.dev/v1").replace(/\/+$/, "");
  try {
    const res = await f(`${origin}/latest?base=${base}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const rates = parseFrankfurterRates(await res.text(), base);
    if (rates) cache.set(base, { at: now, rates });
    return rates;
  } catch {
    return null;
  }
}

export function clearRatesCacheForTests() {
  cache.clear();
}
