import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const ago = (ms: number) => new Date(+now - ms).toISOString();
  it("formats short spans", () => {
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5m");
    expect(relativeTime(ago(3 * 3600_000), now)).toBe("3h");
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2d");
    expect(relativeTime(ago(-60_000), now)).toBe("just now");
  });
  it("falls back to a date", () => {
    expect(relativeTime("2026-09-01T12:00:00Z", now)).toBe("Sep 1");
    expect(relativeTime("2025-09-01T12:00:00Z", now)).toBe("Sep 1, 2025");
    expect(relativeTime("nope", now)).toBe("");
  });
});
