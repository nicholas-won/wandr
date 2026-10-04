"use server";

/** M-1/M-2: a removed member records a settle-up from their money-only view (FR-71). */
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@wandr/db";
import { money } from "@wandr/core";
import { AuthError, requireFull } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { AccountError, recordFormerSettleUp } from "@/server/account";

export type SettleState = { ok?: boolean; error?: string };

const input = z.object({
  otherMemberId: z.string().uuid(),
  direction: z.enum(["paid", "received"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: z.string().min(1),
  note: z.string().max(200).optional(),
});

export async function settleUpAction(tripId: string, _prev: SettleState, form: FormData): Promise<SettleState> {
  void _prev;
  let userId: string;
  try {
    userId = (await requireFull()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect(e.code === "recheck_required" ? routes.recheck(routes.settle(tripId)) : routes.signin(routes.settle(tripId)));
    throw e;
  }
  const parsed = input.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: "Pick who, and an amount." };
  let amountMinor: number;
  try {
    amountMinor = money.parseMajorToMinor(parsed.data.amount, parsed.data.currency);
  } catch {
    return { error: "That amount doesn't look right." };
  }
  if (amountMinor <= 0) return { error: "Enter an amount above zero." };
  try {
    await recordFormerSettleUp(await getDb(), userId, {
      tripId,
      otherMemberId: parsed.data.otherMemberId,
      iPaid: parsed.data.direction === "paid",
      currency: parsed.data.currency,
      amountMinor,
      note: parsed.data.note ?? null,
    });
  } catch (e) {
    if (e instanceof AccountError || e instanceof money.MoneyError) return { error: "That payment can't be recorded. Check who and the currency." };
    console.error(e);
    return { error: "Something went wrong. Try again." };
  }
  refresh();
  return { ok: true };
}
