/**
 * A receipt photo, for people allowed to see it (E-31: the uploader, or people on the expense;
 * RLS decides). Never public, never cached by shared caches.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@wandr/db";
import { claimsFor, getSession } from "@/lib/auth/session";
import { openReceiptImage } from "@/server/receipts";

const UUID = /^[0-9a-f-]{36}$/;

export async function GET(_req: NextRequest, ctx: RouteContext<"/t/[tripId]/money/receipts/[uploadId]">) {
  const { tripId, uploadId } = await ctx.params;
  if (!UUID.test(tripId) || !UUID.test(uploadId)) return new NextResponse(null, { status: 404 });
  const session = await getSession();
  if (!session.user || session.user.provisional) return new NextResponse(null, { status: 401 });
  const r = await openReceiptImage(await getDb(), claimsFor(session, tripId), tripId, uploadId);
  if (!r) return new NextResponse(null, { status: 404 });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if ("redirect" in r) return NextResponse.redirect(r.redirect, { status: 302, headers });
  return new NextResponse(r.bytes as unknown as BodyInit, { headers: { ...headers, "Content-Type": r.contentType } });
}
