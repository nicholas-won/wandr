/**
 * Receipt photo storage (FR-60, E-31). Never public.
 *
 * - Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set: a PRIVATE bucket
 *   (RECEIPTS_BUCKET, default "receipts"; create it as private in the Supabase dashboard).
 *   Reads go through short-lived signed URLs handed out only after a membership check.
 * - Otherwise local disk under apps/web/.data/uploads, streamed by an authenticated route.
 *
 * Paths are generated server-side (`<tripId>/<uuid>.<ext>`), never taken from the client.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface ReceiptStorage {
  readonly kind: "supabase" | "local";
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<StoredObject | null>;
  /** A short-lived URL for the browser, or null when bytes must be streamed by the app. */
  signedUrl(path: string, expiresInSeconds: number): Promise<string | null>;
}

const SAFE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|heic|heif)$/;

function assertPath(path: string) {
  if (!SAFE_PATH.test(path)) throw new Error("invalid storage path");
}

export function supabaseStorage(url: string, serviceKey: string, bucket: string, f: typeof fetch = fetch): ReceiptStorage {
  const base = url.replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  return {
    kind: "supabase",
    async put(path, bytes, contentType) {
      assertPath(path);
      const res = await f(`${base}/storage/v1/object/${bucket}/${path}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": contentType, "x-upsert": "false" },
        body: bytes as unknown as BodyInit,
      });
      if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
    },
    async get(path) {
      assertPath(path);
      const res = await f(`${base}/storage/v1/object/authenticated/${bucket}/${path}`, { headers: auth });
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(`storage read failed: ${res.status}`);
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    },
    async signedUrl(path, expiresIn) {
      assertPath(path);
      const res = await f(`${base}/storage/v1/object/sign/${bucket}/${path}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { signedURL?: string };
      return j.signedURL ? `${base}/storage/v1${j.signedURL}` : null;
    },
  };
}

export function localStorageAdapter(root: string): ReceiptStorage {
  const abs = resolve(root);
  const full = (path: string) => {
    assertPath(path);
    const p = resolve(join(abs, path));
    if (!p.startsWith(abs + sep)) throw new Error("invalid storage path");
    return p;
  };
  return {
    kind: "local",
    async put(path, bytes, contentType) {
      const p = full(path);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, bytes, { flag: "wx" });
      await writeFile(`${p}.type`, contentType);
    },
    async get(path) {
      const p = full(path);
      try {
        const [bytes, type] = await Promise.all([readFile(p), readFile(`${p}.type`, "utf8").catch(() => "application/octet-stream")]);
        return { bytes: new Uint8Array(bytes), contentType: type };
      } catch {
        return null;
      }
    },
    async signedUrl() {
      return null;
    },
  };
}

let cached: ReceiptStorage | undefined;

export function receiptStorage(): ReceiptStorage {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached =
    url && key
      ? supabaseStorage(url, key, process.env.RECEIPTS_BUCKET || "receipts")
      : localStorageAdapter(process.env.WANDR_UPLOADS_DIR || join(process.cwd(), ".data", "uploads"));
  return cached;
}

export function setReceiptStorageForTests(s: ReceiptStorage | undefined) {
  cached = s;
}

/** Identify the image from its bytes (never trust the client's content type). */
export function sniffImage(bytes: Uint8Array): { contentType: string; ext: string } | null {
  const b = bytes;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { contentType: "image/png", ext: "png" };
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    return { contentType: "image/webp", ext: "webp" };
  }
  if (b.length > 6 && String.fromCharCode(...b.slice(0, 6)).startsWith("GIF8")) return { contentType: "image/gif", ext: "gif" };
  if (b.length > 12 && String.fromCharCode(...b.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return { contentType: "image/heic", ext: "heic" };
  }
  return null;
}

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
