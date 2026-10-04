/**
 * Recognising what someone copied or shared (FR-20, FR-21). Pure: no React Native imports.
 * The server does the real work (SSRF-safe fetch, extraction); this only picks the right words
 * for the UI ("Add the TikTok you copied?") and pulls a link out of shared text.
 */

export type LinkKind = "tiktok" | "instagram" | "youtube" | "maps" | "link";

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** First http(s) URL in a piece of text, without trailing punctuation. */
export function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = URL_RE.exec(text);
  if (!m) return null;
  return m[0].replace(/[).,;!?'"\]]+$/, "");
}

export function linkKind(url: string): LinkKind {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "link";
  }
  const is = (d: string) => host === d || host.endsWith(`.${d}`);
  if (is("tiktok.com")) return "tiktok";
  if (is("instagram.com") || is("instagr.am")) return "instagram";
  if (is("youtube.com") || is("youtu.be")) return "youtube";
  if (is("maps.app.goo.gl") || is("goo.gl") || (is("google.com") && url.includes("/maps")) || is("maps.apple.com"))
    return "maps";
  return "link";
}

const KIND_NOUN: Record<LinkKind, string> = {
  tiktok: "the TikTok",
  instagram: "the Instagram post",
  youtube: "the YouTube video",
  maps: "the map link",
  link: "the link",
};

/** "Add the TikTok you copied?" */
export function clipboardOfferLabel(text: string | null): string {
  const url = firstUrl(text);
  return `Add ${KIND_NOUN[url ? linkKind(url) : "link"]} you copied?`;
}

/** Short, readable source for confirmations: "TikTok", "instagram.com". */
export function sourceName(raw: string): string {
  const url = firstUrl(raw);
  if (!url) return "Note";
  const kind = linkKind(url);
  if (kind === "tiktok") return "TikTok";
  if (kind === "instagram") return "Instagram";
  if (kind === "youtube") return "YouTube";
  if (kind === "maps") return "Map link";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/**
 * What we send as `raw` for something shared into the app (FR-21). Prefer the full text when it
 * contains the link (captions help extraction), capped to the contract's 4000 characters.
 */
export function rawFromShare(input: { text?: string | null; webUrl?: string | null }): string | null {
  const text = input.text?.trim() ?? "";
  const url = input.webUrl?.trim() || firstUrl(text);
  let raw = text;
  if (url && !text.includes(url)) raw = text ? `${url}\n${text}` : url;
  raw = raw.trim();
  if (!raw) return null;
  return raw.slice(0, 4000);
}
