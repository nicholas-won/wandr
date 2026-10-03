/**
 * Forecasts for plan days (FR-O11, D70) from Open-Meteo: free, no key, about 16 days ahead.
 * Display hints only. Failures return nothing so the plan never breaks on weather.
 */
import { parseOpenMeteoDaily, type DailyForecast } from "@wandr/core";

const CACHE = ((globalThis as { __wandrWeather?: Map<string, { at: number; days: DailyForecast[] }> }).__wandrWeather ??=
  new Map());
const TTL_MS = 60 * 60 * 1000;
const HORIZON_DAYS = 15;

export async function forecastFor(
  loc: { lat: number; lng: number } | null,
  dates: readonly string[],
): Promise<Map<string, DailyForecast>> {
  const out = new Map<string, DailyForecast>();
  if (!loc || dates.length === 0) return out;
  const today = new Date().toISOString().slice(0, 10);
  const last = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);
  const wanted = dates.filter((d) => d >= today && d <= last);
  if (wanted.length === 0) return out;

  const key = `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}`;
  let hit = CACHE.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&forecast_days=16`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return out;
      hit = { at: Date.now(), days: parseOpenMeteoDaily(await res.json()) };
      CACHE.set(key, hit);
    } catch {
      return out;
    }
  }
  for (const d of hit.days) if (wanted.includes(d.date)) out.set(d.date, d);
  return out;
}
