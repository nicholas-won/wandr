/**
 * Receipt capture and reading (FR-60, FR-61, FR-64; E-4–E-11, E-31).
 *
 * 1. The uploader's photo is sniffed, size-checked, hashed and stored privately; a
 *    `receipt_uploads` row is inserted as the caller (RLS: full scope, own row).
 * 2. `readReceiptJob` runs in `after()` as the service: Claude reads the image (heuristic text
 *    parser fallback without a key; image-only without a key → manual entry). The result is
 *    stored for an editable prefill; nothing reaches balances until the uploader saves (E-7).
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { asService, expenses, members, receiptUploads, withSession, type Claims, type Db } from "@wandr/db";
import { createClaudeModel, readReceipt, type Receipt, type ReceiptValidation, type StructuredModel } from "@wandr/ai";
import { MAX_RECEIPT_BYTES, receiptStorage, sniffImage, type ReceiptStorage } from "@/lib/storage/receipts";
import { ExpenseError } from "./expenses";

export interface UploadResult {
  uploadId: string;
  /** Same photo already on an expense in this trip (FR-64, E-11). */
  duplicateOfExpenseId: string | null;
}

export async function createReceiptUpload(
  db: Db,
  claims: Claims,
  input: { tripId: string; bytes: Uint8Array },
  storage: ReceiptStorage = receiptStorage(),
): Promise<UploadResult> {
  if (!claims.sub) throw new ExpenseError("signin");
  if (input.bytes.length === 0) throw new ExpenseError("invalid", "That file is empty.");
  if (input.bytes.length > MAX_RECEIPT_BYTES) throw new ExpenseError("invalid", "That photo is too large (10 MB max).");
  const kind = sniffImage(input.bytes);
  if (!kind) throw new ExpenseError("invalid", "That doesn't look like a photo.");
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const id = randomUUID();
  const path = `${input.tripId}/${id}.${kind.ext}`;
  if (!/^[0-9a-f-]{36}$/.test(input.tripId)) throw new ExpenseError("invalid");
  // Check membership before writing bytes anywhere (money is full scope, FR-5).
  const memberId = await withSession(db, claims, async (tx) => {
    const [m] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, input.tripId), eq(members.userId, claims.sub!), eq(members.status, "active")));
    return m?.id ?? null;
  });
  if (!memberId) throw new ExpenseError("not_found");
  await storage.put(path, input.bytes, kind.contentType);
  return withSession(db, claims, async (tx) => {
    await tx.insert(receiptUploads).values({
      id,
      tripId: input.tripId,
      uploadedByMemberId: memberId, // the DB guard sets this to the caller anyway
      storagePath: path,
      contentType: kind.contentType,
      byteSize: input.bytes.length,
      imageHash: hash,
    });
    const [dup] = await tx
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.tripId, input.tripId), eq(expenses.receiptHash, hash)));
    return { uploadId: id, duplicateOfExpenseId: dup?.id ?? null };
  });
}

export interface StoredReading {
  receipt: Receipt;
  validation: ReceiptValidation;
  extractor: "claude" | "heuristic";
}

/** Background read (FR-61). Idempotent: only acts on uploads still `reading`. */
export async function readReceiptJob(
  db: Db,
  uploadId: string,
  deps: { model?: StructuredModel | null; storage?: ReceiptStorage } = {},
): Promise<void> {
  const storage = deps.storage ?? receiptStorage();
  const [row] = await asService(db, (tx) => tx.select().from(receiptUploads).where(eq(receiptUploads.id, uploadId)));
  if (!row || row.status !== "reading") return;
  let status = "failed";
  let result: StoredReading | null = null;
  try {
    const model = deps.model !== undefined ? deps.model : createClaudeModel();
    const obj = await storage.get(row.storagePath);
    const mediaType = row.contentType as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    // Claude reads JPEG/PNG/WebP/GIF; HEIC falls back to manual entry (E-10).
    if (obj && model && ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
      const [last] = await asService(db, (tx) =>
        tx
          .select({ currency: expenses.currency })
          .from(expenses)
          .where(eq(expenses.tripId, row.tripId))
          .limit(1),
      );
      const out = await readReceipt(
        {
          image: { base64: Buffer.from(obj.bytes).toString("base64"), mediaType },
          ...(last ? { hints: { currency: last.currency } } : {}),
        },
        model,
      );
      if (out) {
        status = "read";
        result = { receipt: out.receipt, validation: out.validation, extractor: out.extractor };
      }
    }
  } catch (e) {
    console.error("[receipts] read failed", e);
  }
  await asService(db, (tx) =>
    tx.update(receiptUploads).set({ status, result }).where(and(eq(receiptUploads.id, uploadId), eq(receiptUploads.status, "reading"))),
  );
}

export interface UploadView {
  id: string;
  status: "reading" | "read" | "failed";
  reading: StoredReading | null;
  expenseId: string | null;
  duplicateOfExpenseId: string | null;
}

/** The caller's own upload (prefill for the form). */
export async function getReceiptUpload(db: Db, claims: Claims, tripId: string, uploadId: string): Promise<UploadView | null> {
  if (!claims.sub) return null;
  return withSession(db, claims, async (tx) => {
    const [row] = await tx
      .select()
      .from(receiptUploads)
      .where(and(eq(receiptUploads.id, uploadId), eq(receiptUploads.tripId, tripId)));
    if (!row) return null;
    const [dup] = await tx
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.tripId, tripId), eq(expenses.receiptHash, row.imageHash)));
    return {
      id: row.id,
      status: row.status as UploadView["status"],
      reading: (row.result as StoredReading | null) ?? null,
      expenseId: row.expenseId,
      duplicateOfExpenseId: dup && dup.id !== row.expenseId ? dup.id : null,
    };
  });
}

/**
 * Receipt image for the authenticated route. RLS on receipt_uploads decides: the uploader, or
 * people on the expense (E-31). Returns a signed URL (Supabase) or the bytes (local disk).
 */
export async function openReceiptImage(
  db: Db,
  claims: Claims,
  tripId: string,
  uploadId: string,
  storage: ReceiptStorage = receiptStorage(),
): Promise<{ redirect: string } | { bytes: Uint8Array; contentType: string } | null> {
  if (!claims.sub) return null;
  const row = await withSession(db, claims, async (tx) => {
    const [r] = await tx
      .select({ path: receiptUploads.storagePath })
      .from(receiptUploads)
      .where(and(eq(receiptUploads.id, uploadId), eq(receiptUploads.tripId, tripId)));
    return r ?? null;
  });
  if (!row) return null;
  const signed = await storage.signedUrl(row.path, 60);
  if (signed) return { redirect: signed };
  const obj = await storage.get(row.path);
  return obj ? { bytes: obj.bytes, contentType: obj.contentType } : null;
}
