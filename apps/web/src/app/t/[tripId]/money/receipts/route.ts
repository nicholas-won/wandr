/**
 * POST a receipt photo (FR-60). Multipart field `file`. Money needs a verified code (FR-5).
 * Reading runs after the response (`after`, FR-61); the form polls the upload until it's read.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { getDb } from "@wandr/db";
import { AuthError, claimsFor, getSession, requireFull } from "@/lib/auth/session";
import { MAX_RECEIPT_BYTES } from "@/lib/storage/receipts";
import { ExpenseError } from "@/server/expenses";
import { createReceiptUpload, readReceiptJob } from "@/server/receipts";

export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: RouteContext<"/t/[tripId]/money/receipts">) {
  const { tripId } = await ctx.params;
  try {
    await requireFull();
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_RECEIPT_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "That photo is too large (10 MB max)." }, { status: 413 });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
    if (file.size > MAX_RECEIPT_BYTES) return NextResponse.json({ error: "That photo is too large (10 MB max)." }, { status: 413 });
    const db = await getDb();
    const claims = claimsFor(await getSession(), tripId);
    const r = await createReceiptUpload(db, claims, { tripId, bytes: new Uint8Array(await file.arrayBuffer()) });
    after(() => readReceiptJob(db, r.uploadId));
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Confirm your number first.", signin: true }, { status: 401 });
    if (e instanceof ExpenseError) {
      const status = e.code === "not_found" ? 404 : e.code === "signin" ? 401 : 400;
      return NextResponse.json({ error: e.message === e.code ? "That didn't work." : e.message }, { status });
    }
    console.error(e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
