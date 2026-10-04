/**
 * Pure IP-range checks for the SSRF guard (C-20, FR-35).
 *
 * `isBlockedIp` returns true for any address our server must never connect to on
 * behalf of a pasted link: private, loopback, link-local, CGNAT, multicast,
 * reserved/documentation ranges and cloud metadata endpoints, for IPv4 and IPv6
 * (including IPv4-mapped / IPv4-compatible / NAT64 / 6to4 embeddings).
 *
 * Anything that fails to parse is treated as blocked (fail closed).
 */

type Cidr4 = readonly [number, number]; // [network as uint32, prefix length]

function v4(cidr: string): Cidr4 {
  const [ip, len] = cidr.split("/");
  const n = parseIPv4(ip!);
  if (n === null) throw new Error(`bad cidr ${cidr}`);
  return [n, Number(len)] as const;
}

/** IPv4 ranges that are not globally routable unicast (RFC 6890 + IANA special registry). */
const BLOCKED_V4: readonly Cidr4[] = [
  "0.0.0.0/8", // "this network", includes 0.0.0.0
  "10.0.0.0/8", // private
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local, includes 169.254.169.254 metadata
  "172.16.0.0/12", // private
  "192.0.0.0/24", // IETF protocol assignments (incl. 192.0.0.192 Oracle metadata)
  "192.0.2.0/24", // TEST-NET-1
  "192.31.196.0/24", // AS112
  "192.52.193.0/24", // AMT
  "192.88.99.0/24", // 6to4 relay anycast (deprecated)
  "192.168.0.0/16", // private
  "192.175.48.0/24", // AS112
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved, includes 255.255.255.255 broadcast
].map(v4);

/** Specific metadata IPs on otherwise-public ranges (defence in depth). */
const BLOCKED_V4_HOSTS = new Set<number>([
  parseIPv4("100.100.100.200")!, // Alibaba Cloud metadata (also inside CGNAT)
]);

export function parseIPv4(s: string): number | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function inV4(n: number, [net, len]: Cidr4): boolean {
  if (len === 0) return true;
  const mask = len === 32 ? 0xffffffff : (~((1 << (32 - len)) - 1)) >>> 0;
  return ((n & mask) >>> 0) === ((net & mask) >>> 0);
}

export function isBlockedIPv4(s: string): boolean {
  const n = parseIPv4(s);
  if (n === null) return true;
  if (BLOCKED_V4_HOSTS.has(n)) return true;
  return BLOCKED_V4.some((c) => inV4(n, c));
}

/** Parse an IPv6 literal (optionally with embedded dotted IPv4 and zone id) into 8 hextets. */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(":")) return null;

  // Embedded IPv4 tail, e.g. ::ffff:127.0.0.1
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const n = parseIPv4(maybeV4);
    if (n === null) return null;
    tail = [(n >>> 16) & 0xffff, n & 0xffff];
    s = s.slice(0, lastColon + 1) + "0:0"; // placeholder, replaced below
  }

  const dbl = s.split("::");
  if (dbl.length > 2) return null;
  const parseGroup = (g: string): number[] | null => {
    if (g === "") return [];
    const out: number[] = [];
    for (const h of g.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(h)) return null;
      out.push(parseInt(h, 16));
    }
    return out;
  };
  const head = parseGroup(dbl[0]!);
  const rest = dbl.length === 2 ? parseGroup(dbl[1]!) : [];
  if (!head || !rest) return null;
  let groups: number[];
  if (dbl.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    groups = [...head, ...new Array<number>(fill).fill(0), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  if (tail.length === 2) {
    groups[6] = tail[0]!;
    groups[7] = tail[1]!;
  }
  return groups;
}

function v4FromHextets(a: number, b: number): string {
  return `${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`;
}

export function isBlockedIPv6(s: string): boolean {
  const g = parseIPv6(s);
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  const allZeroTo = (i: number) => g.slice(0, i).every((x) => x === 0);

  // :: unspecified and ::1 loopback
  if (allZeroTo(7) && (g7 === 0 || g7 === 1)) return true;
  // IPv4-mapped ::ffff:a.b.c.d → judge the embedded IPv4
  if (allZeroTo(5) && g5 === 0xffff) return isBlockedIPv4(v4FromHextets(g6, g7));
  // IPv4-translated ::ffff:0:a.b.c.d (RFC 2765)
  if (allZeroTo(4) && g4 === 0xffff && g5 === 0) return isBlockedIPv4(v4FromHextets(g6, g7));
  // Deprecated IPv4-compatible ::a.b.c.d
  if (allZeroTo(6)) return isBlockedIPv4(v4FromHextets(g6, g7));
  // NAT64 well-known prefix 64:ff9b::/96 and local-use 64:ff9b:1::/48
  if (g0 === 0x64 && g1 === 0xff9b) {
    if (g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isBlockedIPv4(v4FromHextets(g6, g7));
    return true;
  }
  // 6to4 2002::/16 embeds an IPv4 in hextets 1-2
  if (g0 === 0x2002) return isBlockedIPv4(v4FromHextets(g1, g2));
  // Teredo 2001:0::/32: client IPv4 is obfuscated; block outright
  if (g0 === 0x2001 && g1 === 0) return true;
  // Documentation 2001:db8::/32 and 3fff::/20
  if (g0 === 0x2001 && g1 === 0x0db8) return true;
  if ((g0 & 0xfff0) === 0x3ff0) return true;
  // Benchmarking 2001:2::/48, ORCHIDv2 2001:20::/28, other IETF 2001::/23 assignments
  if (g0 === 0x2001 && g1 < 0x200) return true;
  // Discard-only 100::/64
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true;
  // Unique local fc00::/7 (includes fd00::/8, e.g. AWS fd00:ec2::254 metadata)
  if ((g0 & 0xfe00) === 0xfc00) return true;
  // Link-local fe80::/10 and deprecated site-local fec0::/10
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true;
  // Multicast ff00::/8
  if ((g0 & 0xff00) === 0xff00) return true;
  // Only global unicast 2000::/3 is allowed
  if ((g0 & 0xe000) !== 0x2000) return true;
  return false;
}

/** True if we must refuse to connect to this IP literal (v4 or v6). Unparseable → true. */
export function isBlockedIp(ip: string): boolean {
  const s = ip.trim();
  if (parseIPv4(s) !== null) return isBlockedIPv4(s);
  if (s.includes(":")) return isBlockedIPv6(s);
  return true;
}

/** True if the string is an IP literal (v4 or v6, brackets allowed). */
export function isIpLiteral(s: string): boolean {
  return parseIPv4(s) !== null || parseIPv6(s) !== null;
}
