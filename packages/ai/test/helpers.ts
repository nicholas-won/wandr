import type { StructuredModel, StructuredRequest, StructuredResult } from "../src/claude";
import type { SourceMetadata } from "../src/intake";

export function meta(over: Partial<SourceMetadata> = {}): SourceMetadata {
  return {
    kind: "tiktok",
    url: "https://www.tiktok.com/@a/video/1",
    normalizedUrl: "https://www.tiktok.com/@a/video/1",
    userText: "",
    hashtags: [],
    fetchStatus: "ok",
    warnings: [],
    ...over,
  };
}

/** Mock StructuredModel: returns canned output (validated through the real schema) and records requests. */
export function mockModel(
  output: unknown | ((req: StructuredRequest<unknown>) => unknown),
  extra: Partial<StructuredResult<unknown>> = {},
): StructuredModel & { requests: StructuredRequest<unknown>[] } {
  const requests: StructuredRequest<unknown>[] = [];
  return {
    model: "claude-opus-5-5",
    requests,
    async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      requests.push(req as StructuredRequest<unknown>);
      const raw = typeof output === "function" ? (output as (r: StructuredRequest<unknown>) => unknown)(req as StructuredRequest<unknown>) : output;
      if (raw === null) return { output: null, stopReason: extra.stopReason ?? "refusal", model: "claude-opus-5-5", ...extra } as StructuredResult<T>;
      const parsed = req.schema.safeParse(raw);
      if (!parsed.success) return { output: null, stopReason: null, model: "claude-opus-5-5", error: "parse_failed" };
      return { output: parsed.data, stopReason: "end_turn", model: "claude-opus-5-5" };
    },
  };
}
