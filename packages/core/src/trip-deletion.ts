/**
 * Deleting a trip (JR3, J-10, NFR-5, NFR-7). Pure functions.
 *
 * The owner can't just leave: they transfer ownership first, or delete the whole trip. Deleting
 * is a soft delete: the trip disappears for everyone (RLS hides it), but expense and payment
 * history is kept, never destroyed (NFR-5/NFR-7).
 */

export interface TripDeletionPreview {
  tripName: string;
  /** Other active members who lose access. */
  otherMembers: number;
  ideas: number;
  votes: number;
  polls: number;
  planItems: number;
  /** Expenses and payments are hidden with the trip but kept (NFR-5). */
  expenses: number;
  payments: number;
}

/** Normalize for the typed confirmation: trims, folds case and inner whitespace. */
function norm(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The typed confirmation must match the trip name (case-insensitive). A trip with a blank name
 * asks for the word "delete" instead.
 */
export function deleteConfirmationMatches(typed: string, tripName: string): boolean {
  const want = norm(tripName) || "delete";
  return norm(typed) === want;
}

/** What the confirmation field asks for. */
export function deleteConfirmationWord(tripName: string): string {
  return tripName.replace(/\s+/g, " ").trim() || "delete";
}

/** Lines for the "what's lost" preview; zero counts are skipped. */
export function deletionPreviewLines(p: TripDeletionPreview): string[] {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const out: string[] = [];
  if (p.otherMembers) out.push(`${n(p.otherMembers, "person loses", "people lose")} access`);
  if (p.ideas) out.push(n(p.ideas, "idea", "ideas"));
  if (p.votes) out.push(n(p.votes, "vote", "votes"));
  if (p.polls) out.push(n(p.polls, "poll", "polls"));
  if (p.planItems) out.push(n(p.planItems, "planned item", "planned items"));
  if (p.expenses || p.payments) {
    out.push(
      `${n(p.expenses, "expense", "expenses")} and ${n(p.payments, "payment", "payments")} (hidden, but the record is kept)`,
    );
  }
  return out;
}
