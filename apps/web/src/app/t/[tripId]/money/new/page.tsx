/** Add an expense, from a receipt photo (prefilled by the AI read, FR-61) or by hand (FR-63). */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AutoRefresh } from "@/components/trip/auto-refresh";
import { ExpenseForm } from "@/components/money/expense-form";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { getExpenseFormContext } from "@/server/expenses";
import { getReceiptUpload } from "@/server/receipts";

export default async function NewExpensePage({ params, searchParams }: PageProps<"/t/[tripId]/money/new">) {
  const { tripId } = await params;
  const sp = await searchParams;
  const base = `${routes.trip(tripId)}/money`;
  const receiptId = typeof sp.receipt === "string" && /^[0-9a-f-]{36}$/.test(sp.receipt) ? sp.receipt : null;
  await requireFullOrRedirect(receiptId ? `${base}/new?receipt=${receiptId}` : `${base}/new`);
  const { db, claims } = await tripContext(tripId);
  const ctx = await getExpenseFormContext(db, claims, tripId);
  const upload = receiptId ? await getReceiptUpload(db, claims, tripId, receiptId) : null;
  if (receiptId && !upload) notFound();
  const reading = upload?.status === "reading";

  return (
    <main className="space-y-4">
      <Link href={base} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Money
      </Link>
      <h2 className="font-display text-2xl font-bold">{receiptId ? "Check the receipt" : "Add an expense"}</h2>
      {upload ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image route */}
          <img
            src={`${base}/receipts/${upload.id}`}
            alt="Your receipt"
            className="h-24 w-20 rounded-lg border object-cover"
          />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {reading
              ? "Reading your receipt…"
              : upload.status === "read"
                ? "We filled in what we could read. Check the total, then save."
                : "We couldn't read this one. Enter the total; the photo is saved with the expense."}
          </p>
        </div>
      ) : null}
      <AutoRefresh active={reading} everyMs={1500} />
      {reading ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-2/3" />
          </CardContent>
        </Card>
      ) : upload?.expenseId ? (
        <p className="text-sm">
          This receipt is already saved.{" "}
          <Link className="font-semibold underline" href={`${base}/${upload.expenseId}`}>
            Open it
          </Link>
        </p>
      ) : (
        <ExpenseForm
          key={upload?.status ?? "manual"}
          tripId={tripId}
          ctx={ctx}
          receiptUploadId={upload?.id ?? null}
          reading={upload?.reading ? { receipt: upload.reading.receipt, validation: upload.reading.validation } : null}
          duplicateOfExpenseId={upload?.duplicateOfExpenseId ?? null}
        />
      )}
    </main>
  );
}
