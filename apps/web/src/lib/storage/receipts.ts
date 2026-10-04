/**
 * Receipt photo storage (FR-60, E-31). Never public. Adapters live in ./objects.
 *
 * Bucket: RECEIPTS_BUCKET (default "receipts", private). Local: apps/web/.data/uploads.
 * Paths: `<tripId>/<uuid>.<ext>`.
 */
import { join } from "node:path";
import { storageFromEnv, type ObjectStorage } from "./objects";

export { localStorageAdapter, sniffImage, supabaseStorage, type ObjectStorage, type StoredObject } from "./objects";
export type ReceiptStorage = ObjectStorage;

let cached: ReceiptStorage | undefined;

export function receiptStorage(): ReceiptStorage {
  cached ??= storageFromEnv(
    process.env.RECEIPTS_BUCKET || "receipts",
    process.env.WANDR_UPLOADS_DIR || join(process.cwd(), ".data", "uploads"),
  );
  return cached;
}

export function setReceiptStorageForTests(s: ReceiptStorage | undefined) {
  cached = s;
}

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
