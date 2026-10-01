/**
 * SSRF-hardened fetcher for user-supplied links (C-20, FR-35).
 *
 * - http/https only, ports 80/443 only, no credentials in URLs
 * - DNS is resolved by us; every resolved address must be public (see ip.ts).
 *   The socket connects to the exact address we validated (custom `lookup`), so a
 *   second DNS answer can't swap in a private IP (DNS rebinding).
 * - Redirects are followed manually (max 5) and every hop is re-validated.
 * - 5 s overall timeout, 2 MB body cap (after decompression), no cookies/auth sent.
 *
 * Server-side only (uses node:http/https/dns).
 */
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import zlib from "node:zlib";
import type { LookupFunction } from "node:net";
import { isBlockedIp, isIpLiteral, parseIPv6 } from "./ip";

export const SAFE_FETCH_USER_AGENT =
  "Mozilla/5.0 (compatible; TripInboxBot/0.1; +link-preview)";

export type SafeFetchErrorCode =
  | "invalid_url"
  | "blocked_scheme"
  | "blocked_port"
  | "blocked_host"
  | "blocked_ip"
  | "dns_failed"
  | "too_many_redirects"
  | "timeout"
  | "network";

export class SafeFetchError extends Error {
  constructor(
    public readonly code: SafeFetchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  /** Extra request headers. Cookie/Authorization/Proxy-Authorization are always dropped. */
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Override DNS resolution (tests). Must return every address for the host. */
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
  /**
   * TEST ONLY: relax the IP/port policy so tests can talk to a loopback server.
   * Never set this in application code.
   */
  unsafePolicyForTests?: { isBlockedIp?: (ip: string) => boolean; allowedPorts?: number[] };
}

export interface SafeResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  /** Body was cut at maxBytes. */
  truncated: boolean;
  /** Every URL visited, in order (first = requested). */
  redirectChain: string[];
}

/** The fetcher interface the rest of packages/ai depends on (inject a fake in tests). */
export type Fetcher = (url: string, opts?: SafeFetchOptions) => Promise<SafeResponse>;

const DEFAULTS = { timeoutMs: 5000, maxBytes: 2 * 1024 * 1024, maxRedirects: 5 };
const STRIPPED_HEADERS = new Set(["cookie", "authorization", "proxy-authorization", "host"]);
const BLOCKED_HOSTNAMES = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.home\.arpa$/i,
  /^metadata$/i,
  /^metadata\.google\.internal$/i,
  /^instance-data(\.ec2\.internal)?$/i,
];

/** Validate scheme/port/host shape of a URL without touching DNS. Throws SafeFetchError. */
export function assertFetchableUrl(raw: string, allowedPorts = [80, 443]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError("invalid_url", "Not a valid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new SafeFetchError("blocked_scheme", `Scheme ${u.protocol} not allowed`);
  }
  if (u.username || u.password) {
    throw new SafeFetchError("invalid_url", "Credentials in URL not allowed");
  }
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (!allowedPorts.includes(port)) {
    throw new SafeFetchError("blocked_port", `Port ${port} not allowed`);
  }
  const host = hostOf(u);
  if (!host || BLOCKED_HOSTNAMES.some((re) => re.test(host))) {
    throw new SafeFetchError("blocked_host", `Host ${host} not allowed`);
  }
  // Single-label hostnames resolve via search domains to internal hosts.
  if (!isIpLiteral(host) && !host.includes(".")) {
    throw new SafeFetchError("blocked_host", `Host ${host} not allowed`);
  }
  return u;
}

function hostOf(u: URL): string {
  let h = u.hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}

async function defaultResolve(hostname: string) {
  const res = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return res.map((r) => ({ address: r.address, family: (r.family === 6 ? 6 : 4) as 4 | 6 }));
}

/**
 * Resolve the host and return one validated address to connect to.
 * Fails closed if ANY resolved address is blocked (a mixed answer is suspicious).
 */
async function resolveSafe(
  host: string,
  resolve: NonNullable<SafeFetchOptions["resolve"]>,
  blocked: (ip: string) => boolean,
): Promise<{ address: string; family: 4 | 6 }> {
  if (isIpLiteral(host)) {
    if (blocked(host)) throw new SafeFetchError("blocked_ip", "Address not allowed");
    return { address: host, family: parseIPv6(host) ? 6 : 4 };
  }
  let addrs: Array<{ address: string; family: 4 | 6 }>;
  try {
    addrs = await resolve(host);
  } catch {
    throw new SafeFetchError("dns_failed", `Could not resolve ${host}`);
  }
  if (addrs.length === 0) throw new SafeFetchError("dns_failed", `No addresses for ${host}`);
  for (const a of addrs) {
    if (blocked(a.address)) throw new SafeFetchError("blocked_ip", "Address not allowed");
  }
  return addrs[0]!;
}

interface HopResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
}

function requestOnce(
  u: URL,
  pinned: { address: string; family: 4 | 6 },
  opts: { method: string; headers: Record<string, string>; maxBytes: number; signal: AbortSignal; blocked: (ip: string) => boolean },
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    // Pin the connection to the address we validated. Node calls this instead of DNS.
    const lookup: LookupFunction = (_hostname, options, cb) => {
      if (opts.blocked(pinned.address)) {
        (cb as (e: Error) => void)(new SafeFetchError("blocked_ip", "Address not allowed"));
        return;
      }
      if ((options as { all?: boolean }).all) {
        (cb as unknown as (e: null, a: Array<{ address: string; family: number }>) => void)(null, [
          { address: pinned.address, family: pinned.family },
        ]);
      } else {
        cb(null, pinned.address, pinned.family);
      }
    };
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: hostOf(u), // SNI + Host header use the real name
        port: u.port || undefined,
        path: `${u.pathname}${u.search}`,
        method: opts.method,
        headers: opts.headers,
        lookup,
        agent: false, // no connection reuse across hops/hosts
        signal: opts.signal,
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v === undefined) continue;
          headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
        }
        const status = res.statusCode ?? 0;
        if (opts.method === "HEAD" || (status >= 300 && status < 400)) {
          res.resume();
          resolve({ status, headers, body: "", truncated: false });
          return;
        }
        const declared = Number(headers["content-length"] ?? "NaN");
        let stream: NodeJS.ReadableStream = res;
        const enc = (headers["content-encoding"] ?? "").toLowerCase();
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = Number.isFinite(declared) && declared > opts.maxBytes && enc === "";
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve({ status, headers, body: Buffer.concat(chunks).toString("utf8"), truncated });
        };
        stream.on("data", (c: Buffer) => {
          if (done) return;
          const room = opts.maxBytes - size;
          if (c.length >= room) {
            chunks.push(c.subarray(0, Math.max(0, room)));
            size = opts.maxBytes;
            truncated = true;
            finish();
            res.destroy();
            return;
          }
          chunks.push(c);
          size += c.length;
        });
        stream.on("end", finish);
        stream.on("error", (e: Error) => {
          if (done) return;
          done = true;
          reject(new SafeFetchError("network", e.message));
        });
      },
    );
    req.on("error", (e: Error) => {
      if (e instanceof SafeFetchError) reject(e);
      else if (e.name === "AbortError") reject(new SafeFetchError("timeout", "Request timed out"));
      else reject(new SafeFetchError("network", e.message));
    });
    req.end();
  });
}

/**
 * Fetch a user-supplied URL safely. Resolves with non-2xx responses too (caller decides);
 * rejects with SafeFetchError for policy violations, DNS/network errors and timeouts.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const blocked = options.unsafePolicyForTests?.isBlockedIp ?? isBlockedIp;
  const allowedPorts = options.unsafePolicyForTests?.allowedPorts ?? [80, 443];
  const resolve = options.resolve ?? defaultResolve;
  let method = options.method ?? "GET";

  const headers: Record<string, string> = {
    "user-agent": SAFE_FETCH_USER_AGENT,
    accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
    "accept-language": "en-US,en;q=0.8",
    "accept-encoding": "gzip, deflate, br",
  };
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    if (!STRIPPED_HEADERS.has(k.toLowerCase())) headers[k.toLowerCase()] = v;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const chain: string[] = [];
  try {
    let current = assertFetchableUrl(rawUrl, allowedPorts);
    for (let hop = 0; ; hop++) {
      chain.push(current.toString());
      const pinned = await resolveSafe(hostOf(current), resolve, blocked);
      if (controller.signal.aborted) throw new SafeFetchError("timeout", "Request timed out");
      const res = await requestOnce(current, pinned, {
        method,
        headers,
        maxBytes,
        signal: controller.signal,
        blocked,
      });
      const location = res.headers["location"];
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= maxRedirects) throw new SafeFetchError("too_many_redirects", "Too many redirects");
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new SafeFetchError("invalid_url", "Bad redirect location");
        }
        current = assertFetchableUrl(next.toString(), allowedPorts);
        if (res.status === 303) method = "GET";
        continue;
      }
      return {
        url: current.toString(),
        status: res.status,
        headers: res.headers,
        body: res.body,
        truncated: res.truncated,
        redirectChain: chain,
      };
    }
  } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    if (controller.signal.aborted) throw new SafeFetchError("timeout", "Request timed out");
    throw new SafeFetchError("network", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
