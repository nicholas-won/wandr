/**
 * Typed fetch client for the v1 API (used by apps/mobile). Validates every response against the
 * contract so a server change surfaces as a clear error instead of a crash deep in the UI.
 */
import { ApiError, endpoints, pathFor, type BodyOf, type EndpointName, type ResponseOf } from "./index";

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
    args: { params?: Record<string, string>; body?: BodyOf<K> } = {},
  ): Promise<ResponseOf<K>> {
    const ep = endpoints[name];
    const token = opts.getToken ? await opts.getToken() : null;
    const res = await f(`${opts.baseUrl.replace(/\/$/, "")}${pathFor(ep.path, args.params)}`, {
      method: ep.method,
      headers: {
        Accept: "application/json",
        ...(ep.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: ep.body ? JSON.stringify(ep.body.parse(args.body ?? {})) : undefined,
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = ApiError.safeParse(json);
      throw new ApiRequestError(res.status, err.success ? err.data.error : "http_error", err.success ? err.data.message : `Request failed (${res.status})`);
    }
    return ep.response.parse(json) as ResponseOf<K>;
  };
}
