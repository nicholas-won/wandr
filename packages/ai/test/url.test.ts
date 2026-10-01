import { describe, expect, it, vi } from "vitest";
import { canonicalizeUrl, classifyInput, isShortLink, normalizeUrl } from "../src/url";
import type { Fetcher, SafeResponse } from "../src/safe-fetch";

describe("classifyInput (FR-20)", () => {
  it.each([
    ["https://www.tiktok.com/@a/video/123", "tiktok"],
    ["https://vm.tiktok.com/ZMabc123/", "tiktok"],
    ["https://www.instagram.com/reel/Cabc/?igsh=xyz", "instagram"],
    ["https://instagr.am/p/abc", "instagram"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://m.youtube.com/shorts/abcdef123", "youtube"],
    ["https://maps.app.goo.gl/Xyz123", "google_maps"],
    ["https://www.google.com/maps/place/Foo/@1,2,3z", "google_maps"],
    ["https://maps.google.com/?q=Foo", "google_maps"],
    ["https://goo.gl/maps/abc", "google_maps"],
    ["https://www.google.co.uk/maps/search/pizza", "google_maps"],
    ["https://www.airbnb.com/rooms/1", "url"],
    ["https://www.google.com/search?q=maps", "url"],
    ["sunset sail in lisbon", "text"],
  ])("%s → %s", (input, kind) => {
    expect(classifyInput(input).kind).toBe(kind);
  });

  it("finds a link inside surrounding text and keeps the text", () => {
    const c = classifyInput("omg we have to go here!! https://vm.tiktok.com/ZM123/ (the 2nd one)");
    expect(c.kind).toBe("tiktok");
    expect(c.url).toBe("https://vm.tiktok.com/ZM123/");
    expect(c.text).toBe("omg we have to go here!! (the 2nd one)");
  });

  it("accepts scheme-less platform links", () => {
    const c = classifyInput("vm.tiktok.com/ZM123");
    expect(c.kind).toBe("tiktok");
    expect(c.url).toBe("https://vm.tiktok.com/ZM123");
  });

  it("strips trailing punctuation", () => {
    expect(classifyInput("see https://example.com/a.").url).toBe("https://example.com/a");
  });
});

describe("normalizeUrl (C-13, FR-34)", () => {
  it("strips tracking params and fragments, lowercases host", () => {
    expect(normalizeUrl("https://WWW.TikTok.com/@User/video/123?_t=abc&_r=1&is_from_webapp=1#x")).toBe(
      "https://www.tiktok.com/@User/video/123",
    );
    expect(normalizeUrl("https://Example.COM/a/b/?utm_source=x&utm_medium=y&b=2&a=1&fbclid=zzz")).toBe(
      "https://example.com/a/b?a=1&b=2",
    );
  });

  it("canonicalizes instagram post variants", () => {
    const a = normalizeUrl("https://instagram.com/reel/Cabc123/?igsh=MWQ1ZGUxMzBkMA==");
    const b = normalizeUrl("https://www.instagram.com/reels/Cabc123");
    const c = normalizeUrl("https://www.instagram.com/someuser/reel/Cabc123/?utm_source=ig_web_copy_link");
    expect(a).toBe("https://www.instagram.com/reel/Cabc123");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("canonicalizes youtube variants", () => {
    const want = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(normalizeUrl("https://youtu.be/dQw4w9WgXcQ?si=abc&t=42")).toBe(want);
    expect(normalizeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&si=x")).toBe(want);
    expect(normalizeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(want);
  });

  it("keeps identifying Maps params only", () => {
    expect(
      normalizeUrl("https://www.google.com/maps/search/?api=1&query=Sagrada&query_place_id=ChIJk&entry=ttu&g_ep=abc"),
    ).toBe("https://google.com/maps/search?api=1&query=Sagrada&query_place_id=ChIJk");
  });

  it("tiktok m. host and http → https", () => {
    expect(normalizeUrl("http://m.tiktok.com/v/123")).toBe("https://www.tiktok.com/v/123");
  });

  it("is idempotent", () => {
    for (const u of ["https://www.tiktok.com/@a/video/1?_t=1", "https://youtu.be/abcdefgh", "https://example.com/?b=1&a=2"]) {
      expect(normalizeUrl(normalizeUrl(u))).toBe(normalizeUrl(u));
    }
  });

  it("returns non-URLs unchanged", () => {
    expect(normalizeUrl(" hello ")).toBe("hello");
  });
});

describe("short links", () => {
  it("detects short links", () => {
    expect(isShortLink("https://vm.tiktok.com/ZM1/")).toBe(true);
    expect(isShortLink("https://vt.tiktok.com/ZS1/")).toBe(true);
    expect(isShortLink("https://www.tiktok.com/t/ZT1/")).toBe(true);
    expect(isShortLink("https://maps.app.goo.gl/abc")).toBe(true);
    expect(isShortLink("https://goo.gl/maps/abc")).toBe(true);
    expect(isShortLink("https://www.tiktok.com/@a/video/1")).toBe(false);
  });

  const resp = (url: string): SafeResponse => ({ url, status: 200, headers: {}, body: "", truncated: false, redirectChain: [] });

  it("resolves short links only via the injected (safe) fetcher", async () => {
    const fetcher = vi.fn<Fetcher>(async () => resp("https://www.tiktok.com/@cook/video/999?_r=1&_t=x"));
    const out = await canonicalizeUrl("https://vm.tiktok.com/ZM1/", fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(out.normalizedUrl).toBe("https://www.tiktok.com/@cook/video/999");
    expect(out.resolvedFrom).toBe("https://vm.tiktok.com/ZM1/");
  });

  it("does not fetch for normal links", async () => {
    const fetcher = vi.fn<Fetcher>();
    await canonicalizeUrl("https://www.tiktok.com/@a/video/1", fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to the short link on fetch failure", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("boom");
    });
    const out = await canonicalizeUrl("https://maps.app.goo.gl/abc", fetcher);
    expect(out.normalizedUrl).toBe("https://maps.app.goo.gl/abc");
  });
});
