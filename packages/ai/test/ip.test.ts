import { describe, expect, it } from "vitest";
import { isBlockedIp, isIpLiteral, parseIPv4, parseIPv6 } from "../src/ip";

describe("isBlockedIp — IPv4 (C-20)", () => {
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1", // CGNAT
    "100.127.255.254",
    "100.100.100.200", // Alibaba metadata
    "127.0.0.1",
    "127.1.2.3",
    "169.254.169.254", // AWS/GCP/Azure metadata
    "169.254.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.192", // Oracle metadata / IETF
    "192.0.2.10",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1", // multicast
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "142.250.72.14", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "192.169.0.1", "11.0.0.1"])(
    "allows public %s",
    (ip) => expect(isBlockedIp(ip)).toBe(false),
  );

  it("fails closed on garbage", () => {
    for (const s of ["", "abc", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.2.3.-1", "01.2.3.4x", " "]) {
      expect(isBlockedIp(s)).toBe(true);
    }
  });
});

describe("isBlockedIp — IPv6 (C-20)", () => {
  it.each([
    "::",
    "::1",
    "0:0:0:0:0:0:0:1",
    "[::1]",
    "fe80::1",
    "fe80::1%eth0",
    "febf::1",
    "fec0::1", // site-local
    "fc00::1",
    "fd00::1",
    "fd00:ec2::254", // AWS IMDS v6
    "fdff:ffff::1",
    "ff02::1", // multicast
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:7f00:1", // same, hex form
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "::ffff:0:192.168.1.1", // IPv4-translated
    "::127.0.0.1", // IPv4-compatible (deprecated)
    "64:ff9b::a9fe:a9fe", // NAT64 → 169.254.169.254
    "64:ff9b::10.0.0.1",
    "64:ff9b:1::1", // NAT64 local-use
    "2002:7f00:1::1", // 6to4 of 127.0.0.1
    "2002:a9fe:a9fe::1", // 6to4 of metadata
    "2001:0:4136:e378:8000:63bf:3fff:fdd2", // Teredo
    "2001:db8::1", // documentation
    "3fff::1", // documentation (RFC 9637)
    "100::1", // discard-only
    "2001:2::1", // benchmarking
    "::2", // reserved (not 2000::/3)
    "4000::1",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888", "2a03:2880:f12f:83:face:b00c::25de", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1"])(
    "allows public %s",
    (ip) => expect(isBlockedIp(ip)).toBe(false),
  );

  it("fails closed on malformed v6", () => {
    for (const s of [":::", "1::2::3", "12345::", "g::1", "1:2:3:4:5:6:7:8:9", "::ffff:999.0.0.1", "[", "fe80::1%"]) {
      expect(isBlockedIp(s)).toBe(true);
    }
  });
});

describe("parsers", () => {
  it("parseIPv4", () => {
    expect(parseIPv4("1.2.3.4")).toBe(0x01020304);
    expect(parseIPv4("255.255.255.255")).toBe(0xffffffff);
    expect(parseIPv4("1.2.3")).toBeNull();
  });
  it("parseIPv6 expands :: and embedded v4", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(parseIPv6("2001:db8::")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseIPv6("1:2:3:4:5:6:7::")).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
    expect(parseIPv6("1.2.3.4")).toBeNull();
  });
  it("isIpLiteral", () => {
    expect(isIpLiteral("1.2.3.4")).toBe(true);
    expect(isIpLiteral("[::1]")).toBe(true);
    expect(isIpLiteral("example.com")).toBe(false);
  });
});
