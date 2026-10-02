/**
 * Weather for the plan (FR-O11, D70). Pure helpers over Open-Meteo daily forecasts:
 * WMO weather codes → a short label, and a "rain likely" check for outdoor plans.
 * Forecasts are display hints only; the optimizer never moves items on its own (§6.11).
 */

export interface DailyForecast {
  date: string; // YYYY-MM-DD, local to the place
  code: number; // WMO weather interpretation code
  maxC: number;
  minC: number;
  /** 0–100, null when unknown. */
  rainChance: number | null;
}

const LABELS: [number[], string, string][] = [
  [[0], "Clear", "☀️"],
  [[1, 2], "Partly cloudy", "🌤️"],
  [[3], "Cloudy", "☁️"],
  [[45, 48], "Fog", "🌫️"],
  [[51, 53, 55, 56, 57], "Drizzle", "🌦️"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Rain", "🌧️"],
  [[71, 73, 75, 77, 85, 86], "Snow", "🌨️"],
  [[95, 96, 99], "Thunderstorms", "⛈️"],
];

export function weatherLabel(code: number): { label: string; icon: string } {
  const hit = LABELS.find(([codes]) => codes.includes(code));
  return hit ? { label: hit[1], icon: hit[2] } : { label: "Mixed", icon: "🌥️" };
}

/** "☀️ 24° / 17° · 10% rain" */
export function forecastSummary(f: DailyForecast): string {
  const { icon } = weatherLabel(f.code);
  const temps = `${Math.round(f.maxC)}° / ${Math.round(f.minC)}°`;
  return f.rainChance === null ? `${icon} ${temps}` : `${icon} ${temps} · ${Math.round(f.rainChance)}% rain`;
}

const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

/** Rain likely enough to suggest indoor plans: 60%+ chance, or a wet weather code. */
export function rainLikely(f: DailyForecast): boolean {
  return (f.rainChance ?? 0) >= 60 || WET.has(f.code);
}

/** Parse Open-Meteo's `daily` block. Skips malformed days rather than throwing. */
export function parseOpenMeteoDaily(json: unknown): DailyForecast[] {
  const d = (json as { daily?: Record<string, unknown[]> } | null)?.daily;
  if (!d || !Array.isArray(d.time)) return [];
  const out: DailyForecast[] = [];
  d.time.forEach((date, i) => {
    const num = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : Number(v));
    const code = num(d.weather_code?.[i]);
    const maxC = num(d.temperature_2m_max?.[i]);
    const minC = num(d.temperature_2m_min?.[i]);
    const rain = d.precipitation_probability_max?.[i];
    if (typeof date !== "string" || !Number.isFinite(code) || !Number.isFinite(maxC) || !Number.isFinite(minC)) return;
    out.push({ date, code, maxC, minC, rainChance: rain === null || rain === undefined ? null : Number(rain) });
  });
  return out;
}
