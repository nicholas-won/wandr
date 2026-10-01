/**
 * Thin, injectable wrapper around the Anthropic SDK for structured-output calls.
 * Extraction and receipt reading depend on the `StructuredModel` interface so tests
 * and no-key environments never touch the network.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/** Default model per CLAUDE.md / §7a. Override with AI_MODEL (only with an eval + founder OK). */
export const DEFAULT_MODEL = "claude-opus-5-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface StructuredRequest<T> {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: Effort;
}

export interface StructuredResult<T> {
  /** Null on refusal, truncation or a schema mismatch. */
  output: T | null;
  stopReason: string | null;
  model: string;
  error?: string;
}

export interface StructuredModel {
  readonly model: string;
  generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export interface ClaudeClientOptions {
  apiKey?: string;
  model?: string;
  /** Per-request timeout (ms). Extraction must finish within NFR-1 budgets. */
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Build a StructuredModel from env (ANTHROPIC_API_KEY, AI_MODEL). Returns null when no
 * key is configured: callers then use the deterministic heuristic fallback.
 */
export function createClaudeModel(
  opts: ClaudeClientOptions = {},
  env: Record<string, string | undefined> = process.env,
): StructuredModel | null {
  const apiKey = opts.apiKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = opts.model ?? env.AI_MODEL ?? DEFAULT_MODEL;
  const client = new Anthropic({
    apiKey,
    timeout: opts.timeoutMs ?? 30_000,
    maxRetries: opts.maxRetries ?? 1,
  });
  return {
    model,
    async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      try {
        const res = await client.messages.parse({
          model,
          max_tokens: req.maxTokens ?? 16000,
          system: req.system,
          messages: [{ role: "user", content: req.content }],
          output_config: {
            format: zodOutputFormat(req.schema as z.ZodType<T>),
            effort: req.effort ?? "medium",
          },
        });
        if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
          return { output: null, stopReason: res.stop_reason, model };
        }
        return { output: (res.parsed_output as T | null) ?? null, stopReason: res.stop_reason, model };
      } catch (e) {
        if (e instanceof Anthropic.APIError) {
          return { output: null, stopReason: null, model, error: `api_${e.status ?? "error"}` };
        }
        if (e instanceof Anthropic.AnthropicError) {
          // Structured output failed to parse/validate.
          return { output: null, stopReason: null, model, error: "parse_failed" };
        }
        throw e;
      }
    },
  };
}
