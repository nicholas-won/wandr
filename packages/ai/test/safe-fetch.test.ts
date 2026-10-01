/**
 * SSRF fetcher tests. Policy checks never touch the network (blocked before connect).
 * Behavioural tests use a loopback server with a TEST-ONLY relaxed policy that still
 * routes through the same resolve → validate → pinned-connect path.
 */
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertFetchableUrl, safeFetch, SafeFetchError } from "../src/safe-fetch";
import { isBlockedIp } from "../src/ip";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (e) {
    return e instanceof SafeFetchError ? e.code : `other:${String(e)}`;
  }
}

const noDns = async () => {
  throw new Error("DNS must not be called");
};

describe("assertFetchableUrl", () => {
  it.each([
    ["file:///etc/passwd", "blocked_scheme"],
    ["gopher://example.com/", "blocked_scheme"],
    ["ftp://example.com/", "blocked_scheme"],
    ["javascript:alert(1)", "blocked_scheme"],
    ["data:text/html,hi", "blocked_scheme"],
    ["http://example.com:8080/", "blocked_port"],
    ["https://example.com:22/", "blocked_port"],
    ["http://user:pass@example.com/", "invalid_url"],
    ["http://localhost/", "blocked_host"],
    ["http://foo.localhost/", "blocked_host"],
    ["http://metadata.google.internal/", "blocked_host"],
    ["http://intranet/", "blocked_host"],
    ["not a url", "invalid_url"],
  ])("%s → %s", (url, expected) => {
    expect(() => assertFetchableUrl(url)).toThrowError(expect.objectContaining({ code: expected }));
  });

  it("accepts normal URLs", () => {
    expect(assertFetchableUrl("https://www.tiktok.com/@a/video/1").hostname).toBe("www.tiktok.com");
    expect(assertFetchableUrl("http://example.com:80/x").hostname).toBe("example.com");
  });
});

describe("safeFetch — blocked before connecting", () => {
  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00:ec2::254]/",
    "http://0.0.0.0/",
    "http://10.1.2.3/",
    "http://2130706433/", // decimal 127.0.0.1 (WHATWG normalizes)
    "http://0x7f.0.0.1/", // hex octet
    "http://017700000001/", // octal
    "http://127.1/", // short form
  ])("IP literal %s", async (url) => {
    expect(await code(safeFetch(url, { resolve: noDns }))).toBe("blocked_ip");
  });

  it("blocks hostnames that resolve to private IPs", async () => {
    const resolve = async () => [{ address: "10.0.0.5", family: 4 as const }];
    expect(await code(safeFetch("https://evil.example/", { resolve }))).toBe("blocked_ip");
  });

  it("blocks when ANY resolved address is private (mixed answers / rebinding)", async () => {
    const resolve = async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "169.254.169.254", family: 4 as const },
    ];
    expect(await code(safeFetch("https://rebind.example/", { resolve }))).toBe("blocked_ip");
  });

  it("blocks IPv4-mapped IPv6 DNS answers", async () => {
    const resolve = async () => [{ address: "::ffff:169.254.169.254", family: 6 as const }];
    expect(await code(safeFetch("https://mapped.example/", { resolve }))).toBe("blocked_ip");
  });

  it("reports DNS failures", async () => {
    const resolve = async () => {
      throw new Error("ENOTFOUND");
    };
    expect(await code(safeFetch("https://nope.example/", { resolve }))).toBe("dns_failed");
    expect(await code(safeFetch("https://empty.example/", { resolve: async () => [] }))).toBe("dns_failed");
  });
});

describe("safeFetch — behaviour against a loopback test server", () => {
  let server: http.Server;
  let port = 0;
  const seen: http.IncomingHttpHeaders[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push(req.headers);
      const url = new URL(req.url ?? "/", "http://x");
      switch (url.pathname) {
        case "/ok":
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<title>hello</title>");
          return;
        case "/redirect-to-metadata":
          res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
          res.end();
          return;
        case "/redirect-to-file":
          res.writeHead(301, { location: "file:///etc/passwd" });
          res.end();
          return;
        case "/redirect-relative":
          res.writeHead(302, { location: "/ok" });
          res.end();
          return;
        case "/loop":
          res.writeHead(302, { location: "/loop" });
          res.end();
          return;
        case "/big":
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("x".repeat(5000));
          return;
        case "/gzip-bomb": {
          res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
          res.end(zlib.gzipSync(Buffer.alloc(1_000_000, 0x61)));
          return;
        }
        case "/slow":
          setTimeout(() => {
            res.writeHead(200);
            res.end("late");
          }, 500);
          return;
        case "/set-cookie":
          res.writeHead(200, { "set-cookie": "a=b" });
          res.end("ok");
          return;
        default:
          res.writeHead(404);
          res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // TEST-ONLY policy: allow exactly 127.0.0.1 and our ephemeral port; everything else uses the real rules.
  const policy = () => ({
    isBlockedIp: (ip: string) => (ip === "127.0.0.1" ? false : isBlockedIp(ip)),
    allowedPorts: [80, 443, port],
  });
  // Pretend "test.example" resolves to the loopback server: proves the connection is pinned
  // to the validated address (no second DNS lookup happens at connect time).
  const resolve = async () => [{ address: "127.0.0.1", family: 4 as const }];
  const base = () => `http://test.example:${port}`;

  it("fetches through the pinned address and sends our UA, not cookies/auth", async () => {
    const res = await safeFetch(`${base()}/ok`, {
      resolve,
      unsafePolicyForTests: policy(),
      headers: { Cookie: "session=secret", Authorization: "Bearer x", "X-Extra": "1" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain("hello");
    const h = seen.at(-1)!;
    expect(h["user-agent"]).toMatch(/Bot/);
    expect(h.cookie).toBeUndefined();
    expect(h.authorization).toBeUndefined();
    expect(h["x-extra"]).toBe("1");
    expect(h.host).toBe(`test.example:${port}`);
  });

  it("re-validates every redirect hop (→ metadata IP blocked)", async () => {
    expect(await code(safeFetch(`${base()}/redirect-to-metadata`, { resolve, unsafePolicyForTests: policy() }))).toBe(
      "blocked_ip",
    );
  });

  it("blocks redirects to non-http schemes", async () => {
    expect(await code(safeFetch(`${base()}/redirect-to-file`, { resolve, unsafePolicyForTests: policy() }))).toBe(
      "blocked_scheme",
    );
  });

  it("follows relative redirects and records the chain", async () => {
    const res = await safeFetch(`${base()}/redirect-relative`, { resolve, unsafePolicyForTests: policy() });
    expect(res.status).toBe(200);
    expect(res.url).toBe(`${base()}/ok`);
    expect(res.redirectChain).toHaveLength(2);
  });

  it("caps redirects at 5", async () => {
    expect(await code(safeFetch(`${base()}/loop`, { resolve, unsafePolicyForTests: policy() }))).toBe("too_many_redirects");
  });

  it("truncates bodies at maxBytes", async () => {
    const res = await safeFetch(`${base()}/big`, { resolve, unsafePolicyForTests: policy(), maxBytes: 1000 });
    expect(res.body.length).toBe(1000);
    expect(res.truncated).toBe(true);
  });

  it("caps decompressed size (gzip bomb)", async () => {
    const res = await safeFetch(`${base()}/gzip-bomb`, { resolve, unsafePolicyForTests: policy(), maxBytes: 10_000 });
    expect(res.body.length).toBeLessThanOrEqual(10_000);
    expect(res.truncated).toBe(true);
  });

  it("times out", async () => {
    expect(await code(safeFetch(`${base()}/slow`, { resolve, unsafePolicyForTests: policy(), timeoutMs: 100 }))).toBe(
      "timeout",
    );
  });

  it("the default policy refuses the loopback server", async () => {
    expect(await code(safeFetch(`http://127.0.0.1:${port}/ok`))).toBe("blocked_port");
    expect(await code(safeFetch(`${base()}/ok`, { resolve, unsafePolicyForTests: { allowedPorts: [port] } }))).toBe(
      "blocked_ip",
    );
  });
});
