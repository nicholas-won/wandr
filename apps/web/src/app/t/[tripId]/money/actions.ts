"use server";

/**
 * Money actions (§6.5). Every one needs a verified code on this device (FR-5): requireFull()
 * first, then the server module runs as the caller so RLS applies.
 */
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { money } from "@wandr/core";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { EVENTS } from "@/inngest/client";
import { tripContext } from "@/server/context";
import { enqueue } from "@/server/jobs";
import {
  applyDropOutDecisions,
  applyLateJoiner,
  correctLockedExpense,
  createExpense,
  deleteExpense,
  editItemizedReceipt,
  ExpenseError,
  recordPayment,
  recordRefund,
  resolveDuplicatePair,
  restoreExpense,
  saveBudgetAnswer,
  setAbsorbed,
  setBudgetCheckIn,
  setClaim,
  setGuestOfHonorInSplits,
  updateExpense,
  type DuplicateInfo,
} from "@/server/expenses";

export type MoneyResult<T = object> =
  | ({ ok: true; message?: string } & T)
  | { ok: false; error: string; signin?: string; duplicates?: DuplicateInfo[] };

const moneyPath = (tripId: string) => `${routes.trip(tripId)}/money`;

async function full(tripId: string) {
  await requireFull();
  return tripContext(tripId);
}

/** FR-68: everyone involved hears about changes (messaging slice, throttled there, FR-84). */
async function notifyChange(tripId: string, expenseId: string) {
  try {
    await enqueue({ name: EVENTS.expenseChanged, data: { tripId, expenseId } });
  } catch (e) {
    console.error("[money] notify failed", e);
  }
}

const MONEY_MESSAGES: Partial<Record<string, string>> = {
  NO_PARTICIPANTS: "Pick at least one person to split with.",
  ALL_GUESTS_OF_HONOR: "Everyone picked is a guest of honor. Someone has to pay.",
  RECEIPT_DISCREPANCY: "Items, tax and tip don't add up to the total. Choose how to handle the difference.",
  UNCLAIMED_ITEMS: "Some items haven't been claimed yet.",
  INVALID_CURRENCY: "Pick a currency.",
  TOO_MANY_DECIMALS: "That amount has too many decimals for this currency.",
  PARSE_ERROR: "That amount doesn't look right.",
  REFUND_EXCEEDS_ORIGINAL: "The refund is more than the expense.",
  INVALID_PAYMENT: "A payment needs two different people and a positive amount.",
  PAYERS_DO_NOT_SUM: "What each person paid has to add up to the total.",
  INVALID_COVER: "Check who covers whom: nobody covers themselves, and only one person covers each share.",
};

function fail(e: unknown, tripId: string): { ok: false; error: string; signin?: string } {
  if (e instanceof AuthError || (e instanceof ExpenseError && e.code === "signin")) {
    return { ok: false, error: "Confirm your number first.", signin: routes.signin(moneyPath(tripId)) };
  }
  if (e instanceof ExpenseError) {
    const generic: Record<string, string> = {
      not_found: "We couldn't find that.",
      forbidden: "You can't do that on this trip.",
      locked: "This expense is settled. Add a correction instead.",
      deleted: "That expense was deleted.",
      invalid: "Check the details and try again.",
      not_available: "Not available for this trip.",
    };
    return { ok: false, error: e.message !== e.code ? e.message : (generic[e.code] ?? "Try again.") };
  }
  if (e instanceof money.MoneyError) return { ok: false, error: MONEY_MESSAGES[e.code] ?? e.message };
  if (e instanceof z.ZodError) return { ok: false, error: "Check the details and try again." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

const id = z.string().uuid();
const minor = z.number().int().refine(Number.isSafeInteger);
const chargeSchema = z.object({
  kind: z.enum(["tax", "tip", "service_charge", "fee", "discount"]),
  amountMinor: minor,
  label: z.string().max(80).optional(),
  includedInItems: z.boolean().optional(),
});
const differenceSchema = z.union([
  z.object({ assignTo: id }),
  z.object({ splitEvenlyAmong: z.array(id).min(1) }),
]);
const payersSchema = z.array(z.object({ memberId: id, paidMinor: minor })).max(50);
const coversSchema = z.array(z.object({ memberId: id, coveredBy: id })).max(50);
const gohPolicySchema = z.enum(["sharers", "even", "proportional"]);

const createSchema = z.object({
  merchant: z.string().max(120),
  currency: z.string().regex(/^[A-Z]{3}$/),
  totalMinor: minor,
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  category: z.enum(["lodging", "food_drink", "transport", "activities", "shopping", "other"]),
  paidByMemberId: id.nullable().optional(),
  stopId: id.nullable().optional(),
  ideaId: id.nullable().optional(),
  method: z.enum(["even", "itemized", "just_me"]),
  participantIds: z.array(id).max(200).nullable().optional(),
  items: z.array(z.object({ label: z.string().max(120), amountMinor: minor, quantity: z.number().int().min(1).max(99).optional() })).max(200).optional(),
  charges: z.array(chargeSchema).max(20).optional(),
  difference: differenceSchema.nullable().optional(),
  receiptUploadId: id.nullable().optional(),
  confirmDuplicate: z.boolean().optional(),
  payers: payersSchema.nullable().optional(),
  coveredBy: coversSchema.nullable().optional(),
  personal: z.boolean().optional(),
  gohPolicy: gohPolicySchema.nullable().optional(),
});
export type CreateExpenseForm = z.infer<typeof createSchema>;

/** FR-60–FR-64: save an expense. Returns duplicates instead of saving when it looks like one (FR-64). */
export async function createExpenseAction(tripId: string, form: CreateExpenseForm): Promise<MoneyResult<{ expenseId?: string }>> {
  try {
    const input = createSchema.parse(form);
    const { db, claims } = await full(tripId);
    const r = await createExpense(db, claims, {
      tripId,
      ...input,
      charges: input.charges as money.ReceiptCharge[] | undefined,
      difference: (input.difference ?? null) as money.DifferencePolicy | null,
    });
    if (!r.ok) return { ok: false, error: "This looks like an expense that's already here.", duplicates: r.duplicates };
    if (!input.personal) await notifyChange(tripId, r.expenseId); // Q23c: personal expenses send nothing
    refresh();
    return {
      ok: true,
      expenseId: r.expenseId,
      message: r.pendingItems > 0 ? "Saved. Everyone can claim their items now." : "Expense added.",
    };
  } catch (e) {
    return fail(e, tripId);
  }
}

const updateSchema = z.object({
  merchant: z.string().max(120).optional(),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  category: z.enum(["lodging", "food_drink", "transport", "activities", "shopping", "other"]).optional(),
  stopId: id.nullable().optional(),
  ideaId: id.nullable().optional(),
  paidByMemberId: id.optional(),
  totalMinor: minor.optional(),
  participantIds: z.array(id).max(200).optional(),
  payers: payersSchema.nullable().optional(),
  coveredBy: coversSchema.optional(),
  gohPolicy: gohPolicySchema.optional(),
});

/** FR-68: edit an unlocked expense. */
export async function updateExpenseAction(tripId: string, expenseId: string, patch: z.infer<typeof updateSchema>): Promise<MoneyResult> {
  try {
    const input = updateSchema.parse(patch);
    const { db, claims } = await full(tripId);
    await updateExpense(db, claims, { tripId, expenseId: id.parse(expenseId), ...input });
    await notifyChange(tripId, expenseId);
    refresh();
    return { ok: true, message: "Saved. Balances updated." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** MT6 / Q17: edit an itemized receipt's lines, total and charges before anyone has paid. */
export async function editReceiptAction(
  tripId: string,
  expenseId: string,
  form: { totalMinor: number; items: { id?: string | null; label: string; amountMinor: number; quantity?: number }[]; charges: money.ReceiptCharge[] },
): Promise<MoneyResult> {
  try {
    const input = z
      .object({
        totalMinor: minor,
        items: z
          .array(z.object({ id: id.nullable().optional(), label: z.string().max(120), amountMinor: minor, quantity: z.number().int().min(1).max(99).optional() }))
          .min(1)
          .max(200),
        charges: z.array(chargeSchema).max(20),
      })
      .parse(form);
    const { db, claims } = await full(tripId);
    const r = await editItemizedReceipt(db, claims, {
      tripId,
      expenseId: id.parse(expenseId),
      totalMinor: input.totalMinor,
      items: input.items,
      charges: input.charges as money.ReceiptCharge[],
    });
    await notifyChange(tripId, expenseId);
    refresh();
    return { ok: true, message: r.gapMinor === 0 ? "Saved. It adds up now." : "Saved. The payer covers what's left over." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** Q24: an organizer keeps both flagged receipts, or deletes one. */
export async function resolveDuplicateAction(
  tripId: string,
  expenseId: string,
  otherExpenseId: string,
  resolution: "keep_both" | "delete_first" | "delete_second",
): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    await resolveDuplicatePair(db, claims, {
      tripId,
      expenseId: id.parse(expenseId),
      otherExpenseId: id.parse(otherExpenseId),
      resolution: z.enum(["keep_both", "delete_first", "delete_second"]).parse(resolution),
    });
    refresh();
    return { ok: true, message: resolution === "keep_both" ? "Kept both." : "Deleted the duplicate." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-69: correct a settled expense with adjustment entries (a reason is required). */
export async function correctExpenseAction(
  tripId: string,
  expenseId: string,
  form: { totalMinor: number; paidByMemberId: string; participantIds?: string[]; reason: string },
): Promise<MoneyResult> {
  try {
    const input = z
      .object({ totalMinor: minor, paidByMemberId: id, participantIds: z.array(id).optional(), reason: z.string().min(1).max(300) })
      .parse(form);
    const { db, claims } = await full(tripId);
    await correctLockedExpense(db, claims, { tripId, expenseId: id.parse(expenseId), ...input });
    await notifyChange(tripId, expenseId);
    refresh();
    return { ok: true, message: "Correction added. Everyone's balance is updated." };
  } catch (e) {
    return fail(e, tripId);
  }
}

export async function deleteExpenseAction(tripId: string, expenseId: string): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    await deleteExpense(db, claims, tripId, id.parse(expenseId));
    await notifyChange(tripId, expenseId);
    refresh();
    return { ok: true, message: "Expense deleted." };
  } catch (e) {
    return fail(e, tripId);
  }
}

export async function restoreExpenseAction(tripId: string, expenseId: string): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    await restoreExpense(db, claims, tripId, id.parse(expenseId));
    refresh();
    return { ok: true, message: "Restored." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-72: refund part or all of an expense; it reuses the original split. */
export async function refundAction(tripId: string, expenseId: string, amountMinor: number): Promise<MoneyResult<{ expenseId?: string }>> {
  try {
    const { db, claims } = await full(tripId);
    const r = await recordRefund(db, claims, { tripId, expenseId: id.parse(expenseId), amountMinor: minor.parse(amountMinor) });
    await notifyChange(tripId, r.expenseId);
    refresh();
    return { ok: true, expenseId: r.expenseId, message: "Refund recorded." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-71: record a settle-up. Locks the related expenses (FR-69). Can't be deleted. */
export async function recordPaymentAction(
  tripId: string,
  form: { fromMemberId: string; toMemberId: string; currency: string; amountMinor: number; note?: string },
): Promise<MoneyResult> {
  try {
    const input = z
      .object({ fromMemberId: id, toMemberId: id, currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: minor, note: z.string().max(200).optional() })
      .parse(form);
    const { db, claims } = await full(tripId);
    await recordPayment(db, claims, { tripId, ...input });
    refresh();
    return { ok: true, message: "Payment recorded." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-62: claim / unclaim an item (weight = how many of a multi-quantity line). */
export async function claimItemAction(
  tripId: string,
  expenseId: string,
  itemId: string,
  memberId: string,
  weight: number | null,
): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    await setClaim(db, claims, {
      tripId,
      expenseId: id.parse(expenseId),
      itemId: id.parse(itemId),
      memberId: id.parse(memberId),
      weight: weight === null ? null : z.number().int().min(1).max(99).parse(weight),
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-62: the payer covers an unclaimed item. */
export async function absorbItemAction(tripId: string, expenseId: string, itemId: string, absorbed: boolean): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    await setAbsorbed(db, claims, { tripId, expenseId: id.parse(expenseId), itemId: id.parse(itemId), absorbed });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-90: one tap excludes a guest of honor from splits. */
export async function guestOfHonorAction(tripId: string, memberId: string, on: boolean): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    const r = await setGuestOfHonorInSplits(db, claims, { tripId, memberId: id.parse(memberId), on });
    refresh();
    const settled = r.settledUnchanged ? ` ${r.settledUnchanged} settled ${r.settledUnchanged === 1 ? "expense was" : "expenses were"} left as is.` : "";
    return { ok: true, message: `${on ? "Excluded from" : "Back in"} ${r.resplit} ${r.resplit === 1 ? "split" : "splits"}.${settled}` };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-12 / FR-T10: late joiner checklist. */
export async function lateJoinerAction(
  tripId: string,
  memberId: string,
  form: { include: string[]; skip: string[]; replace: string[] },
): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    await applyLateJoiner(db, claims, {
      tripId,
      memberId: id.parse(memberId),
      include: z.array(id).parse(form.include),
      skip: z.array(id).parse(form.skip),
      replace: z.array(id).parse(form.replace),
    });
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-13: drop-out decisions per expense. */
export async function dropOutAction(
  tripId: string,
  memberId: string,
  decisions: { expenseId: string; decision: "keep" | "redistribute" | "refund_if_replaced" }[],
): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    await applyDropOutDecisions(db, claims, {
      tripId,
      memberId: id.parse(memberId),
      decisions: z.array(z.object({ expenseId: id, decision: z.enum(["keep", "redistribute", "refund_if_replaced"]) })).parse(decisions),
    });
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-74 / D11: organizers switch the budget check-in on or off. */
export async function budgetToggleAction(tripId: string, on: boolean): Promise<MoneyResult> {
  try {
    const { db, claims } = await full(tripId);
    await setBudgetCheckIn(db, claims, tripId, on);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-74 / FR-T9: a private range. */
export async function budgetAnswerAction(tripId: string, form: { currency: string; minMinor: number; maxMinor: number }): Promise<MoneyResult> {
  try {
    const input = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), minMinor: minor, maxMinor: minor }).parse(form);
    const { db, claims } = await full(tripId);
    await saveBudgetAnswer(db, claims, { tripId, ...input });
    refresh();
    return { ok: true, message: "Saved. Only you can see your exact range." };
  } catch (e) {
    return fail(e, tripId);
  }
}

/** FR-66: each person picks the display currency for the approximate total (a device preference). */
export async function displayCurrencyAction(currency: string): Promise<MoneyResult> {
  const c = z.string().regex(/^[A-Z]{3}$/).safeParse(currency);
  if (!c.success) return { ok: false, error: "Pick a currency." };
  (await cookies()).set("w_dccy", c.data, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  refresh();
  return { ok: true };
}
