/**
 * Idea screenshot storage (FR-20 "upload a screenshot", FR-L1). Never public: bytes are served
 * only by /api/screenshot after an RLS check that the viewer can see the idea or save.
 *
 * Bucket: SCREENSHOTS_BUCKET (default "screenshots", private). Local: apps/web/.data/screenshots.
 * Paths: `<tripId | userId>/<uuid>.<ext>`.
 */
import { join } from "node:path";
import { sniffImage, storageFromEnv, type ObjectStorage } from "./objects";

export type ScreenshotStorage = ObjectStorage;

let cached: ScreenshotStorage | undefined;

export function screenshotStorage(): ScreenshotStorage {
  cached ??= storageFromEnv(
    process.env.SCREENSHOTS_BUCKET || "screenshots",
    process.env.WANDR_SCREENSHOTS_DIR || join(process.cwd(), ".data", "screenshots"),
  );
  return cached;
}

export function setScreenshotStorageForTests(s: ScreenshotStorage | undefined) {
  cached = s;
}

export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

/**
 * Largest image we send to Claude as base64 (the API caps an image at about 5 MB once encoded;
 * base64 grows bytes by 4/3). Bigger screenshots are kept and shown, but resolved without the
 * model reading them, so the card asks "Is this right?".
 */
export const MAX_MODEL_IMAGE_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4);

/** Read a stored screenshot for the extraction model, or null when it can't be sent. */
export async function loadScreenshotForModel(
  storage: ScreenshotStorage,
  path: string,
): Promise<{ base64: string; mediaType: ScreenshotMediaType } | null> {
  const obj = await storage.get(path);
  if (!obj || obj.bytes.length > MAX_MODEL_IMAGE_BYTES) return null;
  const check = checkScreenshot(obj.bytes);
  if (!check.ok) return null;
  return { base64: Buffer.from(obj.bytes).toString("base64"), mediaType: check.contentType };
}

export type ScreenshotMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export type ScreenshotCheck = { ok: true; contentType: ScreenshotMediaType; ext: string } | { ok: false; error: string };

/** Validate an uploaded screenshot from its bytes (never the client's content type). */
export function checkScreenshot(bytes: Uint8Array): ScreenshotCheck {
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (bytes.length > MAX_SCREENSHOT_BYTES) return { ok: false, error: "That image is too large (10 MB max)." };
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, error: "That doesn't look like an image. Use a JPEG or PNG screenshot." };
  if (kind.contentType === "image/heic") {
    return { ok: false, error: "HEIC photos aren't supported yet. Use a JPEG or PNG screenshot." };
  }
  return { ok: true, contentType: kind.contentType as ScreenshotMediaType, ext: kind.ext };
}
