/**
 * Inbound MMS media (FR-82 receipts by text). Server only.
 *
 * SSRF (C-20): media URLs come from the signed Twilio webhook, but we still only ever fetch
 * Twilio's own media endpoint for OUR account, then follow at most 3 redirects to an allowlist of
 * Twilio media CDN hosts. (packages/ai safeFetch is text-only and strips Authorization, so it
 * can't download binary media with Twilio auth; the fixed host allowlist replaces its DNS checks.)
 * Size cap 10 MB; images and PDFs only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env, isProd } from "@/lib/env";

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(jpeg|png|heic|heif|webp|gif)|application\/pdf)$/i;

export class MediaError extends Error {
  constructor(public readonly code: "bad_url" | "bad_host" | "too_large" | "bad_type" | "fetch_failed") {
    super(code);
    this.name = "MediaError";
  }
}

/** The first hop must be Twilio's media API for our own account. */
export function assertTwilioMediaUrl(raw: string, accountSid: string | undefined): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new MediaError("bad_url");
  }
  if (u.protocol !== "https:" || u.hostname !== "api.twilio.com" || u.port || u.username || u.password) {
    throw new MediaError("bad_host");
  }
  if (!accountSid || !u.pathname.startsWith(`/2010-04-01/Accounts/${accountSid}/Messages/`) || !u.pathname.includes("/Media/")) {
    throw new MediaError("bad_url");
  }
  return u;
}

/** Redirect targets Twilio uses for media. */
export function isAllowedMediaHost(u: URL): boolean {
  if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (h === "api.twilio.com" || h === "mms.twiliocdn.com" || h.endsWith(".twiliocdn.com")) return true;
  // Legacy S3-backed media URLs: s3*.amazonaws.com/media.twiliocdn.com/...
  return /^s3[a-z0-9.-]*\.amazonaws\.com$/.test(h) && u.pathname.startsWith("/media.twiliocdn.com/");
}

export type FetchedMedia = { bytes: Uint8Array; contentType: string };

export async function fetchTwilioMedia(raw: string, fetchImpl: typeof fetch = fetch): Promise<FetchedMedia> {
  const e = env();
  let url = assertTwilioMediaUrl(raw, e.TWILIO_ACCOUNT_SID);
  const auth =
    e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN
      ? `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64")}`
      : null;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetchImpl(url, {
      redirect: "manual",
      // Credentials only to Twilio's API host, never to a CDN.
      headers: auth && url.hostname === "api.twilio.com" ? { Authorization: auth } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new MediaError("fetch_failed");
      const next = new URL(loc, url);
      if (!isAllowedMediaHost(next)) throw new MediaError("bad_host");
      url = next;
      continue;
    }
    if (!res.ok) throw new MediaError("fetch_failed");
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!ALLOWED_TYPES.test(contentType)) throw new MediaError("bad_type");
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MEDIA_MAX_BYTES) throw new MediaError("too_large");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MEDIA_MAX_BYTES) throw new MediaError("too_large");
    return { bytes: buf, contentType };
  }
  throw new MediaError("fetch_failed");
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

export const RECEIPTS_BUCKET = "receipts";

/**
 * Store a receipt photo in the private Supabase Storage bucket (§7a). Returns the storage path
 * ("receipts/<trip>/<uuid>.jpg"). Dev without Supabase: writes under .data/media.
 */
export async function storeReceiptMedia(tripId: string, media: FetchedMedia): Promise<string> {
  const name = `${tripId}/${crypto.randomUUID()}.${EXT[media.contentType.toLowerCase()] ?? "bin"}`;
  const e = env();
  if (e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
    const res = await fetch(`${e.SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/${RECEIPTS_BUCKET}/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": media.contentType,
        "x-upsert": "false",
      },
      body: media.bytes as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status}`);
    return `${RECEIPTS_BUCKET}/${name}`;
  }
  if (isProd()) throw new Error("Supabase Storage is not configured");
  const path = join(process.cwd(), ".data", "media", RECEIPTS_BUCKET, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, media.bytes);
  return `${RECEIPTS_BUCKET}/${name}`;
}
