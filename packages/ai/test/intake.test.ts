import { describe, expect, it, vi } from "vitest";
import {
  decodeEntities,
  detectLodging,
  extractHashtags,
  extractLocationTag,
  fetchSourceMetadata,
  parseGoogleMapsUrl,
  parseHtmlMeta,
  parseInstagramOg,
} from "../src/intake";
import { SafeFetchError, type Fetcher, type SafeResponse } from "../src/safe-fetch";

function res(url: string, status: number, body: string, headers: Record<string, string> = {}): SafeResponse {
  return { url, status, body, headers, truncated: false, redirectChain: [url] };
}

/** Fake fetcher keyed by URL prefix. */
function fakeFetcher(routes: Record<string, SafeResponse | Error>): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    const r = routes[key]!;
    if (r instanceof Error) throw r;
    return r;
  }) as Fetcher & { calls: string[] };
  f.calls = calls;
  return f;
}

describe("helpers", () => {
  it("decodes entities", () => {
    expect(decodeEntities("Tom &amp; Jerry&#39;s &#x1F355; &quot;x&quot;")).toBe(`Tom & Jerry's 🍕 "x"`);
  });

  it("extracts hashtags (unicode, deduped, lowercased)", () => {
    expect(extractHashtags("yum #Lisbon #lisbon #ラーメン #a not#this #pastel_de_nata")).toEqual([
      "lisbon",
      "ラーメン",
      "pastel_de_nata",
    ]);
  });

  it("extracts 📍 location tags", () => {
    expect(extractLocationTag("so good 📍Manteigaria, Lisbon #lisbon")).toBe("Manteigaria, Lisbon");
    expect(extractLocationTag("Location: Park Bar\nmore")).toBe("Park Bar");
    expect(extractLocationTag("no tag here")).toBeUndefined();
  });

  it("parses meta tags, title and JSON-LD", () => {
    const html = `<html><head><title>T &amp; T</title>
      <meta property="og:title" content="OG Title">
      <meta name='description' content='Desc'>
      <meta content="https://img/x.jpg" property="og:image" />
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Hotel","name":"H"}</script>
      <script type="application/ld+json">not json</script>
      </head></html>`;
    const m = parseHtmlMeta(html);
    expect(m.title).toBe("T & T");
    expect(m.meta["og:title"]).toBe("OG Title");
    expect(m.meta["description"]).toBe("Desc");
    expect(m.meta["og:image"]).toBe("https://img/x.jpg");
    expect(m.jsonLd).toEqual([{ "@context": "https://schema.org", "@type": "Hotel", name: "H" }]);
  });

  it("parses Instagram OG into handle + caption", () => {
    const out = parseInstagramOg({
      "og:description": `1,234 likes, 56 comments - lisbon.eats on March 1, 2026: "best nata 📍Manteigaria #lisbon".`,
      "og:title": `Lisbon Eats on Instagram: "best nata 📍Manteigaria #lisbon"`,
    });
    expect(out.handle).toBe("lisbon.eats");
    expect(out.caption).toContain("best nata");
    expect(out.authorName).toBe("Lisbon Eats");
  });
});

describe("parseGoogleMapsUrl (C-15)", () => {
  it("place URL with exact coords in data blob", () => {
    const m = parseGoogleMapsUrl(
      "https://www.google.com/maps/place/Cervejaria+Ramiro/@38.7206,-9.1360,17z/data=!3m1!4b1!4m6!3m5!1s0xd19338b:0x8f5c3e1a2b3c4d5e!8m2!3d38.7206306!4d-9.1357412",
    );
    expect(m.type).toBe("place");
    expect(m.placeName).toBe("Cervejaria Ramiro");
    expect(m.location).toEqual({ lat: 38.7206306, lng: -9.1357412 });
    expect(m.cid).toBe(BigInt("0x8f5c3e1a2b3c4d5e").toString());
  });

  it("search API link with place id", () => {
    const m = parseGoogleMapsUrl(
      "https://www.google.com/maps/search/?api=1&query=Sagrada%20Familia&query_place_id=ChIJk_s92NyipBIRUMnDG8Kq2Js",
    );
    expect(m.type).toBe("place");
    expect(m.placeName).toBe("Sagrada Familia");
    expect(m.placeId).toBe("ChIJk_s92NyipBIRUMnDG8Kq2Js");
  });

  it("search path", () => {
    const m = parseGoogleMapsUrl("https://www.google.com/maps/search/tacos+condesa/@19.4110,-99.1730,15z");
    expect(m.type).toBe("search");
    expect(m.query).toBe("tacos condesa");
    expect(m.location).toEqual({ lat: 19.411, lng: -99.173 });
  });

  it("dropped pin forms", () => {
    expect(parseGoogleMapsUrl("https://maps.google.com/?q=38.71,-9.14")).toMatchObject({ type: "pin", location: { lat: 38.71, lng: -9.14 } });
    expect(parseGoogleMapsUrl("https://www.google.com/maps/@38.71,-9.14,15z")).toMatchObject({ type: "pin" });
    expect(parseGoogleMapsUrl("https://www.google.com/maps/place/38.7,-9.1")).toMatchObject({ type: "pin" });
  });

  it("cid, directions and lists", () => {
    expect(parseGoogleMapsUrl("https://maps.google.com/?cid=1234567890")).toMatchObject({ type: "place", cid: "1234567890" });
    expect(parseGoogleMapsUrl("https://www.google.com/maps/dir/?api=1&destination=Belem+Tower")).toMatchObject({
      type: "directions",
      placeName: "Belem Tower",
    });
    expect(parseGoogleMapsUrl("https://www.google.com/maps/placelists/list/abc")).toMatchObject({ type: "list" });
  });
});

describe("detectLodging (C-16)", () => {
  it("airbnb with dates and guests", () => {
    expect(detectLodging("https://www.airbnb.com/rooms/123?check_in=2026-11-12&check_out=2026-11-15&adults=4")).toEqual({
      provider: "airbnb",
      checkIn: "2026-11-12",
      checkOut: "2026-11-15",
      guests: 4,
    });
  });
  it("booking.com and non-lodging", () => {
    expect(detectLodging("https://www.booking.com/hotel/pt/foo.html")?.provider).toBe("booking");
    expect(detectLodging("https://example.com/")).toBeUndefined();
  });
});

describe("fetchSourceMetadata", () => {
  it("TikTok via oEmbed, handle from author_unique_id", async () => {
    const fetcher = fakeFetcher({
      "https://www.tiktok.com/oembed": res(
        "https://www.tiktok.com/oembed",
        200,
        JSON.stringify({
          title: "best nata 📍Manteigaria, Lisbon #lisbon #fyp",
          author_name: "Lisbon Bites",
          author_unique_id: "LisbonBites",
          author_url: "https://www.tiktok.com/@lisbonbites",
          thumbnail_url: "https://p16.tiktokcdn.com/x.jpg",
        }),
      ),
    });
    const m = await fetchSourceMetadata("https://www.tiktok.com/@lisbonbites/video/1?_t=x", { fetcher });
    expect(m.kind).toBe("tiktok");
    expect(m.normalizedUrl).toBe("https://www.tiktok.com/@lisbonbites/video/1");
    expect(m.caption).toContain("Manteigaria");
    expect(m.creatorHandle).toBe("lisbonbites");
    expect(m.thumbnailUrl).toMatch(/tiktokcdn/);
    expect(m.hashtags).toEqual(["lisbon", "fyp"]);
    expect(m.locationTag).toBe("Manteigaria, Lisbon");
    expect(m.fetchStatus).toBe("ok");
    expect(fetcher.calls[0]).toContain(encodeURIComponent("https://www.tiktok.com/@lisbonbites/video/1?_t=x"));
  });

  it("TikTok short link resolves first, private post → private (C-1)", async () => {
    const fetcher = fakeFetcher({
      "https://vm.tiktok.com/": res("https://www.tiktok.com/@someone/video/42?_r=1", 200, ""),
      "https://www.tiktok.com/oembed": res("https://www.tiktok.com/oembed", 400, "{}"),
    });
    const m = await fetchSourceMetadata("https://vm.tiktok.com/ZM1/", { fetcher });
    expect(m.normalizedUrl).toBe("https://www.tiktok.com/@someone/video/42");
    expect(m.fetchStatus).toBe("private");
    expect(m.creatorHandle).toBe("someone");
    expect(m.warnings).toContain("private_post");
  });

  it("YouTube via oEmbed", async () => {
    const fetcher = fakeFetcher({
      "https://www.youtube.com/oembed": res(
        "x",
        200,
        JSON.stringify({ title: "48 Hours in Tokyo", author_name: "Wander", author_url: "https://www.youtube.com/@wanderlens", thumbnail_url: "https://i.ytimg.com/x.jpg" }),
      ),
    });
    const m = await fetchSourceMetadata("https://youtu.be/dQw4w9WgXcQ", { fetcher });
    expect(m.kind).toBe("youtube");
    expect(m.title).toBe("48 Hours in Tokyo");
    expect(m.creatorHandle).toBe("wanderlens");
  });

  it("Instagram via OG tags (no oEmbed thumbnail since 2025, C-3)", async () => {
    const html = `<meta property="og:title" content="Lisbon Eats on Instagram: &quot;nata time 📍Manteigaria&quot;">
      <meta property="og:description" content="10 likes, 2 comments - lisbon.eats on May 2, 2026: &quot;nata time 📍Manteigaria #lisbon&quot;.">
      <meta property="og:image" content="https://scontent.cdninstagram.com/x.jpg">`;
    const fetcher = fakeFetcher({ "https://www.instagram.com/": res("x", 200, html, { "content-type": "text/html" }) });
    const m = await fetchSourceMetadata("https://www.instagram.com/reel/Cabc/?igsh=1", { fetcher });
    expect(m.kind).toBe("instagram");
    expect(m.creatorHandle).toBe("lisbon.eats");
    expect(m.caption).toContain("Manteigaria");
    expect(m.thumbnailUrl).toContain("cdninstagram");
    expect(m.hashtags).toContain("lisbon");
  });

  it("Instagram login wall → private", async () => {
    const fetcher = fakeFetcher({ "https://www.instagram.com/": res("x", 200, "<html>Login</html>", { "content-type": "text/html" }) });
    const m = await fetchSourceMetadata("https://www.instagram.com/p/abc/", { fetcher });
    expect(m.fetchStatus).toBe("private");
  });

  it("Google Maps links are parsed without fetching Google", async () => {
    const fetcher = fakeFetcher({});
    const m = await fetchSourceMetadata("https://www.google.com/maps/place/Time+Out+Market/@38.70,-9.14,17z", { fetcher });
    expect(fetcher.calls).toHaveLength(0);
    expect(m.kind).toBe("google_maps");
    expect(m.maps?.placeName).toBe("Time Out Market");
  });

  it("maps.app.goo.gl short link resolves via fetcher then parses", async () => {
    const fetcher = fakeFetcher({
      "https://maps.app.goo.gl/": res("https://www.google.com/maps/place/Pens%C3%A3o+Amor/@38.70,-9.14,17z", 200, ""),
    });
    const m = await fetchSourceMetadata("https://maps.app.goo.gl/abc123", { fetcher });
    expect(m.kind).toBe("google_maps");
    expect(m.maps?.placeName).toBe("Pensão Amor");
  });

  it("generic page: OG + geo + JSON-LD + lodging", async () => {
    const html = `<title>ignored</title>
      <meta property="og:title" content="Rental unit in Lisbon · ★4.9">
      <meta property="og:image" content="https://a0.muscache.com/x.jpg">
      <meta property="og:site_name" content="Airbnb">
      <meta name="geo.position" content="38.71;-9.13">
      <script type="application/ld+json">{"@type":"VacationRental","name":"Alfama loft","address":{"addressLocality":"Lisbon"}}</script>`;
    const fetcher = fakeFetcher({ "https://www.airbnb.com/": res("x", 200, html, { "content-type": "text/html; charset=utf-8" }) });
    const m = await fetchSourceMetadata("https://www.airbnb.com/rooms/1?adults=2", { fetcher });
    expect(m.kind).toBe("url");
    expect(m.lodging?.provider).toBe("airbnb");
    expect(m.title).toBe("Rental unit in Lisbon · ★4.9");
    expect(m.siteName).toBe("Airbnb");
    expect(m.geo).toEqual({ lat: 38.71, lng: -9.13 });
    expect(m.jsonLdPlace?.name).toBe("Alfama loft");
    expect(m.locationTag).toBe("Lisbon");
  });

  it("SSRF-blocked URL becomes a card with fetchStatus=blocked, never throws", async () => {
    const fetcher = fakeFetcher({ "http://169.254.169.254": new SafeFetchError("blocked_ip", "nope") });
    const m = await fetchSourceMetadata("http://169.254.169.254/latest/meta-data", { fetcher });
    expect(m.fetchStatus).toBe("blocked");
    expect(m.warnings).toContain("fetch_blocked_ip");
  });

  it("non-HTML content is skipped", async () => {
    const fetcher = fakeFetcher({ "https://example.com/": res("x", 200, "%PDF", { "content-type": "application/pdf" }) });
    const m = await fetchSourceMetadata("https://example.com/menu.pdf", { fetcher });
    expect(m.warnings[0]).toMatch(/unsupported_content_type/);
  });

  it("plain text needs no fetch", async () => {
    const fetcher = vi.fn<Fetcher>();
    const m = await fetchSourceMetadata("sunset sail in lisbon #boat", { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(m.kind).toBe("text");
    expect(m.hashtags).toEqual(["boat"]);
  });
});
