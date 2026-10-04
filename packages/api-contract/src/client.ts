/**
 * Typed fetch client for the v1 API (used by apps/mobile). Validates every response against the
 * contract so a server change surfaces as a clear error instead of a crash deep in the UI.
 */
import type { z } from "zod";
import { ApiError, endpoints, pathFor, type BodyOf, type EndpointDef, type EndpointName, type QueryOf, type ResponseOf } from "./index";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export function createApiClient(opts: ClientOptions) {
  const f = opts.fetchImpl ?? fetch;
  return async function call<K extends EndpointName>(
    name: K,
    args: { params?: Record<string, string>; body?: BodyOf<K>; query?: QueryOf<K> } = {},
  ): Promise<ResponseOf<K>> {
    const ep: EndpointDef = endpoints[name];
    const token = opts.getToken ? await opts.getToken() : null;
    const multipart = ep.body === "multipart";
    const json = ep.body !== null && !multipart;
    let url = `${opts.baseUrl.replace(/\/$/, "")}${pathFor(ep.path, args.params)}`;
    if (args.query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(ep.query ? ep.query.parse(args.query) : (args.query as Record<string, unknown>))) {
        if (v !== undefined && v !== null) q.set(k, String(v));
      }
      if (q.size) url += `?${q}`;
    }
    const res = await f(url, {
      method: ep.method,
      headers: {
        Accept: "application/json",
        // Multipart: let fetch set the boundary.
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: multipart
        ? (args.body as FormData)
        : json
          ? JSON.stringify((ep.body as z.ZodType).parse(args.body ?? {}))
          : undefined,
    });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = ApiError.safeParse(payload);
      throw new ApiRequestError(res.status, err.success ? err.data.error : "http_error", err.success ? err.data.message : `Request failed (${res.status})`);
    }
    return ep.response.parse(payload) as ResponseOf<K>;
  };
}
