/** FR-126: expenses, refunds, corrections and payments as CSV. Full scope only (FR-5). */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@wandr/db";
import { claimsFor, getSession } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { ExpenseError, exportExpensesCsv } from "@/server/expenses";

export async function GET(req: NextRequest, ctx: RouteContext<"/t/[tripId]/money/export">) {
  const { tripId } = await ctx.params;
  const session = await getSession();
  if (!session.user || session.user.provisional || session.user.needsRecheck) {
    return NextResponse.redirect(new URL(routes.signin(`${routes.trip(tripId)}/money`), req.url));
  }
  try {
    const { filename, csv } = await exportExpensesCsv(await getDb(), claimsFor(session, tripId), tripId);
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ExpenseError) return new NextResponse(null, { status: 404 });
    throw e;
  }
}
