import { describe, expect, it } from "vitest";
import { forecastSummary, parseOpenMeteoDaily, rainLikely, weatherLabel } from "../src/weather";

describe("weather", () => {
  it("parses Open-Meteo daily data and skips bad rows", () => {
    const days = parseOpenMeteoDaily({
      daily: {
        time: ["2026-10-10", "2026-10-11", "2026-10-12"],
        weather_code: [0, 63, null],
        temperature_2m_max: [24.4, 19.6, 18],
        temperature_2m_min: [16.6, 14.2, 12],
        precipitation_probability_max: [10, 85, 20],
      },
    });
    expect(days).toHaveLength(2);
    expect(forecastSummary(days[0]!)).toBe("☀️ 24° / 17° · 10% rain");
    expect(rainLikely(days[0]!)).toBe(false);
    expect(rainLikely(days[1]!)).toBe(true);
  });

  it("labels codes and tolerates missing data", () => {
    expect(weatherLabel(95).label).toBe("Thunderstorms");
    expect(weatherLabel(123).label).toBe("Mixed");
    expect(parseOpenMeteoDaily(null)).toEqual([]);
    expect(rainLikely({ date: "x", code: 2, maxC: 20, minC: 10, rainChance: null })).toBe(false);
  });
});
