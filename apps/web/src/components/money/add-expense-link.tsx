import Link from "next/link";
import { Receipt } from "lucide-react";

/**
 * Quiet entry point to money before the first expense (P2: the Money section appears only
 * after it). Kept secondary so "Add idea" stays the page's one primary action (P3).
 */
export function AddExpenseLink({ tripId }: { tripId: string }) {
  return (
    <Link
      href={`/t/${tripId}/money`}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <Receipt className="size-4" aria-hidden /> Paid for something? Add an expense or snap a receipt
    </Link>
  );
}
