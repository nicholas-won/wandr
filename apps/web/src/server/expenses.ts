/**
 * Expenses and receipts (REQUIREMENTS §6.5 FR-60–FR-75, FR-90, FR-12/13, §6.10 FR-T8/T9/T10,
 * FR-124, FR-126, NFR-4/5; edge cases E-1–E-31).
 *
 * Rules:
 * - Every amount is integer minor units + ISO currency. All split, rounding, balance and
 *   correction math comes from @wandr/core/money; this module only loads rows, calls core and
 *   writes the results.
 * - Reads and writes run through `withSession` so RLS applies (money is full scope only, FR-5;
 *   surprise expenses stay hidden, FR-91). `asService` is used only to recompute stored shares
 *   after a member claims an item (members may claim but not write shares under RLS) and to
 *   undo a soft delete; both check the caller's rights first.
 * - Locked expenses (a payment was recorded, FR-69) are never rewritten: fixes become
 *   adjustment entries (plus a corrected-state snapshot for reports, Q21). Payments,
 *   adjustments and corrections are append-only (NFR-5).
 *
 * Founder money decisions of 2026-10-02 (docs/open-questions.md):
 * - Q16 unclaimed itemized items sit on the UPLOADER until claimed; flagged for organizers.
 * - Q17 a receipt whose lines don't add up is flagged "couldn't read this receipt correctly";
 *   the items can be re-entered (MT6) and any remaining gap is covered by the payer(s).
 * - Q18 leftover pennies go to the uploader (then the payer); the expense shows a rounding flag.
 * - Q19 a guest of honor's items: "only the people who shared it" by default; "even" and
 *   "in proportion" are the alternatives, chosen by the uploader or an organizer.
 * - Q23 several payers, "covered by", and personal-only expenses.
 * - Q24 line-item duplicates are flagged for organizers (keep both / delete one).
 * - MT1 an in-app "What changed" list on the money page.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  asService,
  auditLog,
  budgetAnswers,
  expenseAdjustments,
  expenseCorrections,
  expenseDuplicateReviews,
  expenseItemClaims,
  expenseItems,
  expenseMemberDecisions,
  expensePayers,
  expenses,
  expenseShares,
  ideas,
  members,
  payments,
  receiptUploads,
  stopAttendance,
  stops,
  trips,
  withSession,
  type Claims,
  type Db,
  type Tx,
} from "@wandr/db";
import { budgetView, type BudgetRow } from "@wandr/db/reveals";
import { tripBalances } from "./membership";
import { tripSize, type TripSize } from "@wandr/core";
import * as money from "@wandr/core/money";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SplitMethod = "even" | "itemized" | "just_me";
export type ExpenseCategory = money.ExpenseCategory;
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "food_drink",
  "lodging",
  "transport",
  "activities",
  "shopping",
  "other",
];
export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food_drink: "Food & drink",
  lodging: "Lodging",
  transport: "Transport",
  activities: "Activities",
  shopping: "Shopping",
  other: "Other",
};

/** Stored in expenses.split_config: what's needed to recompute shares (FR-62, FR-90, E-6). */
export interface ExpenseSplitConfig {
  /** Selected people (even split, and the pool unclaimed items are split across for itemized). */
  participants?: string[];
  /** Itemized receipts: tax / tip / service charge / fees / discounts (E-4, E-5). */
  charges?: money.ReceiptCharge[];
  /**
   * Itemized receipts whose lines don't add up: how the gap is handled (E-6). Null/absent = the
   * payer covers it (Q17; several payers in proportion to what they paid).
   */
  difference?: money.DifferencePolicy | null;
  /** Q23b: "covered by" entries (one person pays another person's share). */
  coveredBy?: money.Cover[];
  /** Q19: what happens to a guest of honor's items on an itemized receipt. Default "sharers". */
  gohPolicy?: money.GuestOfHonorItemPolicy;
}

export const GOH_POLICY_LABEL: Record<money.GuestOfHonorItemPolicy, string> = {
  sharers: "Only the people who shared it with them",
  even: "Split evenly among everyone else",
  proportional: "In proportion to what everyone else had",
};

export type ExpenseErrorCode =
  | "signin"
  | "not_found"
  | "forbidden"
  | "locked"
  | "deleted"
  | "invalid"
  | "duplicate"
  | "not_available";

export class ExpenseError extends Error {
  constructor(
    public readonly code: ExpenseErrorCode,
    message: string = code,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ExpenseError";
  }
}

interface MemberRow {
  id: string;
  userId: string | null;
  displayName: string;
  role: "owner" | "organizer" | "member";
  status: "invited" | "pending" | "active" | "not_attending" | "removed";
  isGuestOfHonor: boolean;
  managedByMemberId: string | null;
  joinedAt: Date | null;
  createdAt: Date;
}

interface Ctx {
  tripId: string;
  trip: { id: string; name: string; budgetCheckIn: boolean };
  me: MemberRow;
  members: MemberRow[];
  size: TripSize;
  isOrganizer: boolean;
}

type ExpenseRow = typeof expenses.$inferSelect;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

async function loadCtx(tx: Tx, claims: Claims, tripId: string): Promise<Ctx> {
  if (!claims.sub) throw new ExpenseError("signin", "Confirm your number to see money (FR-5).");
  const [trip] = await tx
    .select({ id: trips.id, name: trips.name, budgetCheckIn: trips.budgetCheckIn })
    .from(trips)
    .where(eq(trips.id, tripId));
  if (!trip) throw new ExpenseError("not_found");
  const rows = (await tx
    .select({
      id: members.id,
      userId: members.userId,
      displayName: members.displayName,
      role: members.role,
      status: members.status,
      isGuestOfHonor: members.isGuestOfHonor,
      managedByMemberId: members.managedByMemberId,
      joinedAt: members.joinedAt,
      createdAt: members.createdAt,
    })
    .from(members)
    .where(eq(members.tripId, tripId))
    .orderBy(asc(members.createdAt))) as MemberRow[];
  const me = rows.find((m) => m.userId === claims.sub);
  if (!me || (me.status !== "active" && me.status !== "not_attending")) throw new ExpenseError("not_found");
  const active = rows.filter((m) => m.status === "active");
  return {
    tripId,
    trip,
    me,
    members: rows,
    size: tripSize(active.length),
    isOrganizer: me.status === "active" && (me.role === "owner" || me.role === "organizer"),
  };
}

function activeIds(ctx: Ctx): string[] {
  return ctx.members.filter((m) => m.status === "active").map((m) => m.id);
}

/** Members who can appear on an expense: active, dropped-out and former (E-33). */
function moneyMemberIds(ctx: Ctx): Set<string> {
  return new Set(
    ctx.members.filter((m) => m.status === "active" || m.status === "not_attending" || m.status === "removed").map((m) => m.id),
  );
}

function gohIds(ctx: Ctx): string[] {
  return ctx.members.filter((m) => m.isGuestOfHonor && m.status === "active").map((m) => m.id);
}

function canManage(ctx: Ctx, e: Pick<ExpenseRow, "uploadedByMemberId">): boolean {
  return e.uploadedByMemberId === ctx.me.id || ctx.isOrganizer;
}

function configOf(e: Pick<ExpenseRow, "splitConfig">): ExpenseSplitConfig {
  return (e.splitConfig ?? {}) as ExpenseSplitConfig;
}

/** Can the caller act for this member? Self, or a managed member they manage (FR-11). */
function actsFor(ctx: Ctx, memberId: string): boolean {
  if (memberId === ctx.me.id) return true;
  const m = ctx.members.find((x) => x.id === memberId);
  return !!m && m.managedByMemberId === ctx.me.id;
}

/** Q18: leftover pennies go to the uploader, then the payer. */
const pennyTo = (e: Pick<ExpenseRow, "uploadedByMemberId" | "paidByMemberId">) => [e.uploadedByMemberId, e.paidByMemberId];

// ---------------------------------------------------------------------------
// Defaults (FR-62, FR-S7, D19)
// ---------------------------------------------------------------------------

/**
 * People an even split defaults to: active members attending the Stop (no attendance row =
 * attending). Without a Stop (whole trip, E-28/E-29): every active member.
 */
async function attendingIds(tx: Tx, ctx: Ctx, stopId: string | null): Promise<string[]> {
  const ids = activeIds(ctx);
  if (!stopId) return ids;
  const rows = await tx
    .select({ memberId: stopAttendance.memberId, attending: stopAttendance.attending })
    .from(stopAttendance)
    .where(eq(stopAttendance.stopId, stopId));
  const notAttending = new Set(rows.filter((r) => !r.attending).map((r) => r.memberId));
  const out = ids.filter((id) => !notAttending.has(id));
  return out.length > 0 ? out : ids;
}

// ---------------------------------------------------------------------------
// Split computation (delegates to packages/core)
// ---------------------------------------------------------------------------

interface ItemInput {
  id: string;
  label: string;
  amountMinor: number;
  quantity: number;
  absorbed: boolean;
  claims: { memberId: string; weight: number }[];
}

interface SplitInput {
  id: string;
  method: SplitMethod;
  currency: string;
  totalMinor: number;
  /** Main payer (`paid_by_member_id`). */
  payerId: string;
  /** Q23a: part-payers when several people paid; null/empty = `payerId` paid it all. */
  payers?: money.PayerPart[] | null;
  /** Q16 / Q18: the person who added the expense. */
  uploaderId: string;
  config: ExpenseSplitConfig;
  items: ItemInput[];
  guestOfHonorIds: string[];
}

interface ComputedSplit {
  shares: money.Share[];
  /** Itemized: items nobody has claimed or absorbed yet; they sit on the uploader (Q16). */
  pendingItemIds: string[];
  excludedGuestOfHonorIds: string[];
  /** Q18: leftover pennies and who took them. */
  rounding: money.Rounding;
  /** Q17: receipt lines minus total gap (0 when it adds up) the payer(s) cover. */
  gapMinor: number;
  /** Q19: items only a guest of honor claimed ("sharers" fell back to "even"). */
  gohFallbackItemIds: string[];
  /** Q23b: shares that moved to a coverer. */
  moved: money.CoveredSplit["moved"];
}

/** Q17: the payer covers a gap; several payers cover it in proportion to what each paid. */
function payerCoversGap(payerId: string, payers: money.PayerPart[] | null | undefined): money.DifferencePolicy {
  if (payers && payers.length > 0) {
    return { proportionalTo: payers.map((p) => ({ memberId: p.memberId, weight: Math.abs(p.paidMinor) })) };
  }
  return { assignTo: payerId };
}

/**
 * FR-62 / FR-90 / FR-T10 plus the 2026-10-02 decisions: unclaimed items sit on the uploader
 * until claimed (Q16); a gap is covered by the payer unless an older stored policy says
 * otherwise (Q17); leftover pennies go to the uploader, then the payer (Q18); guest-of-honor
 * items follow the expense's policy (Q19); covered shares move to their coverer last (Q23b).
 */
export function computeSplit(input: SplitInput): ComputedSplit {
  const leftoverTo = [input.uploaderId, input.payerId];
  const base = { pendingItemIds: [] as string[], excludedGuestOfHonorIds: [] as string[], gapMinor: 0, gohFallbackItemIds: [] as string[] };
  if (input.method === "just_me") {
    return {
      ...base,
      shares: money.splitJustMe({ totalMinor: input.totalMinor, currency: input.currency, memberId: input.payerId }).shares,
      rounding: { leftoverMinor: 0, memberId: null },
      moved: [],
    };
  }
  const participants = input.config.participants ?? [];
  const cover = (s: money.Split) => money.applyCoveredBy(s, input.config.coveredBy ?? []);
  if (input.method === "even") {
    const s = money.splitEven({
      totalMinor: input.totalMinor,
      currency: input.currency,
      participantIds: participants,
      guestOfHonorIds: input.guestOfHonorIds,
      leftoverTo,
    });
    const c = cover(s);
    return { ...base, shares: c.shares, excludedGuestOfHonorIds: s.excludedGuestOfHonorIds, rounding: s.rounding, moved: c.moved };
  }
  const pending = input.items.filter((i) => i.claims.length === 0 && !i.absorbed && i.amountMinor !== 0).map((i) => i.id);
  const claimants = input.items.flatMap((i) => i.claims.map((c) => c.memberId));
  const s = money.splitItemized({
    totalMinor: input.totalMinor,
    currency: input.currency,
    payerId: input.payerId,
    items: input.items.map((i) => ({
      id: i.id,
      label: i.label,
      amountMinor: i.amountMinor,
      absorbed: i.absorbed,
      claims: i.claims.map((c) => ({ memberId: c.memberId, weight: c.weight })),
    })),
    charges: input.config.charges ?? [],
    guestOfHonorIds: input.guestOfHonorIds,
    guestOfHonorPolicy: input.config.gohPolicy ?? "sharers",
    everyoneElse: [...new Set([...participants, ...claimants])],
    unclaimed: { assignTo: input.uploaderId },
    difference: input.config.difference ?? payerCoversGap(input.payerId, input.payers),
    leftoverTo,
  });
  const c = cover(s);
  return {
    shares: c.shares,
    pendingItemIds: pending,
    excludedGuestOfHonorIds: s.excludedGuestOfHonorIds,
    rounding: s.rounding,
    gapMinor: s.validation.discrepancyMinor,
    gohFallbackItemIds: s.gohFallbackItemIds,
    moved: c.moved,
  };
}

async function loadPayers(tx: Tx, expenseId: string): Promise<money.PayerPart[] | null> {
  const rows = await tx
    .select({ memberId: expensePayers.memberId, paidMinor: expensePayers.paidMinor })
    .from(expensePayers)
    .where(eq(expensePayers.expenseId, expenseId));
  return rows.length ? rows.sort((a, b) => money.compareIds(a.memberId, b.memberId)) : null;
}

async function writePayers(tx: Tx, expenseId: string, payers: money.PayerPart[] | null): Promise<void> {
  await tx.delete(expensePayers).where(eq(expensePayers.expenseId, expenseId));
  if (payers && payers.length > 0) {
    await tx.insert(expensePayers).values(payers.map((p) => ({ expenseId, memberId: p.memberId, paidMinor: p.paidMinor })));
  }
}

/** Q23a: validates part-payers for a total. One part (or none) = a single payer. */
function resolvePayers(
  ctx: Ctx,
  totalMinor: number,
  payers: { memberId: string; paidMinor: number }[] | null | undefined,
): { payerId: string; payers: money.PayerPart[] | null } | null {
  if (!payers || payers.length === 0) return null;
  const allowed = moneyMemberIds(ctx);
  for (const p of payers) if (!allowed.has(p.memberId)) throw new ExpenseError("invalid", "A payer isn't on this trip.");
  const parts = money.normalizePayers(totalMinor, payers);
  if (parts.length === 1) return { payerId: parts[0]!.memberId, payers: null };
  return { payerId: money.mainPayer(parts), payers: parts };
}

function validateCovers(ctx: Ctx, covers: money.Cover[] | null | undefined): money.Cover[] {
  if (!covers || covers.length === 0) return [];
  const allowed = moneyMemberIds(ctx);
  for (const c of covers) {
    if (!allowed.has(c.memberId) || !allowed.has(c.coveredBy)) throw new ExpenseError("invalid", "Someone selected isn't on this trip.");
  }
  // Same validation as the split itself (self-cover, cycles, one coverer per share).
  money.applyCoveredBy({ currency: "USD", totalMinor: 0, shares: [] }, covers);
  return covers.map((c) => ({ memberId: c.memberId, coveredBy: c.coveredBy }));
}

async function loadItems(tx: Tx, expenseId: string): Promise<ItemInput[]> {
  const items = await tx.select().from(expenseItems).where(eq(expenseItems.expenseId, expenseId));
  if (items.length === 0) return [];
  const claims = await tx
    .select()
    .from(expenseItemClaims)
    .where(inArray(expenseItemClaims.itemId, items.map((i) => i.id)));
  return items
    .map((i) => ({
      id: i.id,
      label: i.label,
      amountMinor: i.amountMinor,
      quantity: i.quantity,
      absorbed: i.absorbed,
      claims: claims.filter((c) => c.itemId === i.id).map((c) => ({ memberId: c.memberId, weight: c.weight })),
    }))
    .sort((a, b) => money.compareIds(a.id, b.id));
}

async function sharesOf(tx: Tx, expenseId: string): Promise<money.Share[]> {
  const rows = await tx
    .select({ memberId: expenseShares.memberId, shareMinor: expenseShares.shareMinor })
    .from(expenseShares)
    .where(eq(expenseShares.expenseId, expenseId));
  return rows.sort((a, b) => money.compareIds(a.memberId, b.memberId));
}

/** Recompute an unlocked expense's stored shares from its inputs (and its refunds' shares). */
async function recomputeStoredShares(tx: Tx, e: ExpenseRow, goh: string[]): Promise<void> {
  if (e.lockedAt || e.deletedAt) return;
  let shares: money.Share[];
  if (e.refundOfExpenseId) {
    const [orig] = await tx.select().from(expenses).where(eq(expenses.id, e.refundOfExpenseId));
    if (!orig) return;
    const origShares = await sharesOf(tx, orig.id);
    shares = money.refundFromOriginal(
      { currency: orig.currency, totalMinor: orig.totalMinor, shares: origShares },
      -e.totalMinor,
      { leftoverTo: [orig.uploadedByMemberId, orig.paidByMemberId] },
    ).shares;
    await writePayers(tx, e.id, refundPayers(orig, await loadPayers(tx, orig.id), e.totalMinor));
  } else {
    shares = computeSplit({
      id: e.id,
      method: e.splitMethod,
      currency: e.currency,
      totalMinor: e.totalMinor,
      payerId: e.paidByMemberId,
      payers: await loadPayers(tx, e.id),
      uploaderId: e.uploadedByMemberId,
      config: configOf(e),
      items: await loadItems(tx, e.id),
      guestOfHonorIds: goh,
    }).shares;
  }
  await tx.delete(expenseShares).where(eq(expenseShares.expenseId, e.id));
  if (shares.length > 0) {
    await tx.insert(expenseShares).values(shares.map((s) => ({ expenseId: e.id, memberId: s.memberId, shareMinor: s.shareMinor })));
  }
  // Unlocked refunds of this expense follow its new split (FR-72).
  const refunds = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.refundOfExpenseId, e.id), isNull(expenses.deletedAt), isNull(expenses.lockedAt)));
  for (const r of refunds) await recomputeStoredShares(tx, r, goh);
}

/** FR-72 + Q23a: a refund goes back to the original part-payers in proportion to what they paid. */
function refundPayers(orig: ExpenseRow, origPayers: money.PayerPart[] | null, refundTotalMinor: number): money.PayerPart[] | null {
  if (!origPayers || origPayers.length < 2) return null;
  const parts = money.scalePayers(origPayers, refundTotalMinor, { leftoverTo: [orig.uploadedByMemberId, orig.paidByMemberId] });
  return parts.length > 0 ? parts : null;
}

// ---------------------------------------------------------------------------
// Create (FR-60–FR-64, FR-67, FR-T10)
// ---------------------------------------------------------------------------

export interface CreateExpenseInput {
  tripId: string;
  merchant: string;
  currency: string;
  totalMinor: number;
  spentOn?: string | null;
  category: ExpenseCategory;
  paidByMemberId?: string | null;
  stopId?: string | null;
  ideaId?: string | null;
  method?: SplitMethod;
  /** Even split: selected people. Omit for the default (people attending the Stop). */
  participantIds?: string[] | null;
  items?: { label: string; amountMinor: number; quantity?: number }[];
  charges?: money.ReceiptCharge[];
  difference?: money.DifferencePolicy | null;
  receiptUploadId?: string | null;
  /** The user saw the duplicate warning and chose "Add anyway" (FR-64). */
  confirmDuplicate?: boolean;
  /** Q23a: several people paid parts of the bill; the parts must sum to the total. */
  payers?: { memberId: string; paidMinor: number }[] | null;
  /** Q23b: one person pays another person's share. */
  coveredBy?: money.Cover[] | null;
  /** Q23c: personal-only (tracked for me, never split, visible only to me). Duo and group trips. */
  personal?: boolean;
  /** Q19: guest-of-honor item policy for an itemized receipt. */
  gohPolicy?: money.GuestOfHonorItemPolicy | null;
}

export interface DuplicateInfo {
  expenseId: string;
  merchant: string;
  totalMinor: number;
  currency: string;
  spentOn: string | null;
  uploadedBy: string;
  reason: "image_hash" | "merchant_total_time";
}

export type CreateExpenseResult =
  | { ok: true; expenseId: string; pendingItems: number }
  | { ok: false; error: "duplicate"; duplicates: DuplicateInfo[] };

const dateMs = (d: string | null | undefined, fallback: Date) => (d ? Date.parse(`${d}T12:00:00Z`) : fallback.getTime());

export async function createExpense(db: Db, claims: Claims, input: CreateExpenseInput): Promise<CreateExpenseResult> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    money.assertCurrency(input.currency);
    money.assertMinor(input.totalMinor, "total");
    if (input.totalMinor <= 0) throw new ExpenseError("invalid", "Enter the amount you paid.");
    const merchant = input.merchant.trim().slice(0, 120) || "Expense";
    const allowed = moneyMemberIds(ctx);

    // FR-T10: solo trips are a personal spend tracker: "paid by me, for me".
    // Q23c: personal-only expenses in duo/group trips are "just me" too, and private.
    const personal = ctx.size !== "solo" && !!input.personal;
    if (personal && ctx.me.status !== "active") throw new ExpenseError("forbidden");
    const method: SplitMethod = ctx.size === "solo" || personal ? "just_me" : (input.method ?? "even");
    const multi = method === "just_me" ? null : resolvePayers(ctx, input.totalMinor, input.payers);
    const payerId = method === "just_me" ? ctx.me.id : (multi?.payerId ?? input.paidByMemberId ?? ctx.me.id);
    if (!allowed.has(payerId)) throw new ExpenseError("invalid", "The payer isn't on this trip.");
    const covers = method === "just_me" ? [] : validateCovers(ctx, input.coveredBy);

    if (input.stopId) {
      const [s] = await tx.select({ id: stops.id }).from(stops).where(and(eq(stops.id, input.stopId), eq(stops.tripId, input.tripId)));
      if (!s) throw new ExpenseError("invalid", "That Stop isn't in this trip.");
    }
    if (input.ideaId) {
      const [i] = await tx.select({ id: ideas.id }).from(ideas).where(and(eq(ideas.id, input.ideaId), eq(ideas.tripId, input.tripId)));
      if (!i) throw new ExpenseError("invalid", "That idea isn't in this trip.");
    }

    let participants: string[] = [];
    if (method !== "just_me") {
      participants = input.participantIds?.length
        ? [...new Set(input.participantIds)]
        : await attendingIds(tx, ctx, input.stopId ?? null);
      for (const p of participants) if (!allowed.has(p)) throw new ExpenseError("invalid", "Someone selected isn't on this trip.");
    }

    // Receipt photo (FR-60): must be the caller's own upload, not yet used.
    let upload: typeof receiptUploads.$inferSelect | undefined;
    if (input.receiptUploadId) {
      [upload] = await tx
        .select()
        .from(receiptUploads)
        .where(and(eq(receiptUploads.id, input.receiptUploadId), eq(receiptUploads.tripId, input.tripId)));
      if (!upload || upload.uploadedByMemberId !== ctx.me.id) throw new ExpenseError("invalid", "Receipt not found.");
      if (upload.expenseId) throw new ExpenseError("invalid", "That receipt was already added.");
    }

    // FR-64 / E-11: probable duplicates (never auto-deleted; the user decides).
    if (!input.confirmDuplicate && !personal) {
      const dups = await findDuplicates(tx, ctx, {
        merchant,
        totalMinor: input.totalMinor,
        currency: input.currency,
        occurredAtMs: dateMs(input.spentOn, new Date()),
        ...(upload ? { imageHash: upload.imageHash } : {}),
      });
      if (dups.length > 0) return { ok: false as const, error: "duplicate" as const, duplicates: dups };
    }

    const id = randomUUID();
    const items: ItemInput[] =
      method === "itemized"
        ? (input.items ?? [])
            .filter((i) => i.label.trim() || i.amountMinor !== 0)
            .map((i) => {
              money.assertMinor(i.amountMinor, "item amount");
              return {
                id: randomUUID(),
                label: i.label.trim().slice(0, 120) || "Item",
                amountMinor: i.amountMinor,
                quantity: Math.max(1, Math.min(99, Math.trunc(i.quantity ?? 1))),
                absorbed: false,
                claims: [],
              };
            })
            .sort((a, b) => money.compareIds(a.id, b.id))
        : [];
    if (method === "itemized" && items.length === 0) throw new ExpenseError("invalid", "Add the receipt's items, or split it evenly.");

    const coverCfg = covers.length ? { coveredBy: covers } : {};
    const config: ExpenseSplitConfig =
      method === "just_me"
        ? {}
        : method === "even"
          ? { participants, ...coverCfg }
          : {
              participants,
              charges: input.charges ?? [],
              difference: input.difference ?? null,
              ...coverCfg,
              ...(input.gohPolicy ? { gohPolicy: input.gohPolicy } : {}),
            };
    const split = computeSplit({
      id,
      method,
      currency: input.currency,
      totalMinor: input.totalMinor,
      payerId,
      payers: multi?.payers ?? null,
      uploaderId: ctx.me.id,
      config,
      items,
      guestOfHonorIds: gohIds(ctx),
    });

    const charges = config.charges ?? [];
    const sumKind = (k: money.ChargeKind) =>
      money.sumMinor(charges.filter((c) => c.kind === k && !c.includedInItems).map((c) => c.amountMinor));
    await tx.insert(expenses).values({
      id,
      tripId: input.tripId,
      stopId: input.stopId ?? null,
      ideaId: input.ideaId ?? null,
      merchant,
      spentOn: input.spentOn || null,
      currency: input.currency,
      totalMinor: input.totalMinor,
      taxMinor: sumKind("tax"),
      tipMinor: sumKind("tip"),
      category: input.category,
      splitMethod: method,
      paidByMemberId: payerId,
      uploadedByMemberId: ctx.me.id, // the DB sets this to the caller anyway
      receiptPath: upload?.storagePath ?? null,
      receiptHash: upload?.imageHash ?? null,
      splitConfig: config,
      personalMemberId: personal ? ctx.me.id : null,
    });
    if (multi?.payers) await writePayers(tx, id, multi.payers);
    if (items.length > 0) {
      await tx.insert(expenseItems).values(
        items.map((i) => ({ id: i.id, expenseId: id, label: i.label, amountMinor: i.amountMinor, quantity: i.quantity })),
      );
    }
    if (split.shares.length > 0) {
      await tx.insert(expenseShares).values(split.shares.map((s) => ({ expenseId: id, memberId: s.memberId, shareMinor: s.shareMinor })));
    }
    if (upload) {
      await tx.update(receiptUploads).set({ expenseId: id }).where(eq(receiptUploads.id, upload.id));
    }
    return { ok: true as const, expenseId: id, pendingItems: split.pendingItemIds.length };
  });
}

async function findDuplicates(tx: Tx, ctx: Ctx, candidate: money.DuplicateCandidate): Promise<DuplicateInfo[]> {
  const rows = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.tripId, ctx.tripId), isNull(expenses.deletedAt), isNull(expenses.refundOfExpenseId)));
  const existing = rows.map((r) => ({
    id: r.id,
    merchant: r.merchant,
    totalMinor: r.totalMinor,
    currency: r.currency,
    occurredAtMs: dateMs(r.spentOn, r.createdAt),
    ...(r.receiptHash ? { imageHash: r.receiptHash } : {}),
    row: r,
  }));
  const name = (id: string) => ctx.members.find((m) => m.id === id)?.displayName ?? "Someone";
  return money.findProbableDuplicates(candidate, existing).map((m) => ({
    expenseId: m.expense.id,
    merchant: m.expense.merchant,
    totalMinor: m.expense.totalMinor,
    currency: m.expense.currency,
    spentOn: m.expense.row.spentOn,
    uploadedBy: m.expense.row.uploadedByMemberId === ctx.me.id ? "You" : name(m.expense.row.uploadedByMemberId),
    reason: m.reason,
  }));
}

// ---------------------------------------------------------------------------
// Edit, correct, delete (FR-68, FR-69, NFR-5)
// ---------------------------------------------------------------------------

async function loadExpense(tx: Tx, ctx: Ctx, expenseId: string): Promise<ExpenseRow> {
  const [e] = await tx.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.tripId, ctx.tripId)));
  if (!e) throw new ExpenseError("not_found");
  return e;
}

export interface UpdateExpenseInput {
  tripId: string;
  expenseId: string;
  merchant?: string;
  spentOn?: string | null;
  category?: ExpenseCategory;
  stopId?: string | null;
  ideaId?: string | null;
  paidByMemberId?: string;
  /** Even and just_me only; itemized totals follow the receipt lines. */
  totalMinor?: number;
  /** Even only. */
  participantIds?: string[];
  /** Q23a: replace who paid what (empty/one entry = a single payer). Must sum to the total. */
  payers?: { memberId: string; paidMinor: number }[] | null;
  /** Q23b: replace the "covered by" entries. */
  coveredBy?: money.Cover[];
  /** Q19: itemized only. */
  gohPolicy?: money.GuestOfHonorItemPolicy;
}

/** FR-68: the uploader, organizers and the owner edit an UNLOCKED expense. Logged by the DB audit trigger. */
export async function updateExpense(db: Db, claims: Claims, input: UpdateExpenseInput): Promise<void> {
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    const e = await loadExpense(tx, ctx, input.expenseId);
    if (!canManage(ctx, e)) throw new ExpenseError("forbidden", "Only the person who added it or an organizer can edit this.");
    if (e.deletedAt) throw new ExpenseError("deleted");
    if (e.lockedAt) throw new ExpenseError("locked", "This expense is settled. Add a correction instead.");
    if (e.refundOfExpenseId && (input.totalMinor !== undefined || input.participantIds)) {
      throw new ExpenseError("invalid", "Refunds follow the original split.");
    }
    const allowed = moneyMemberIds(ctx);
    let payerId = input.paidByMemberId ?? e.paidByMemberId;
    if (!allowed.has(payerId)) throw new ExpenseError("invalid", "The payer isn't on this trip.");
    if ((ctx.size === "solo" || e.personalMemberId) && payerId !== e.paidByMemberId && e.splitMethod === "just_me") {
      throw new ExpenseError("invalid", "This expense is paid by you, for you.");
    }
    let total = e.totalMinor;
    if (input.totalMinor !== undefined) {
      money.assertMinor(input.totalMinor, "total");
      if (input.totalMinor <= 0) throw new ExpenseError("invalid", "Enter the amount you paid.");
      if (e.splitMethod === "itemized" && input.totalMinor !== e.totalMinor) {
        throw new ExpenseError("invalid", "Change an itemized receipt's total with \"Edit items\".");
      }
      total = input.totalMinor;
    }
    // Q23a: several payers. A new total must come with new parts (they have to add up).
    let payers = await loadPayers(tx, e.id);
    if (input.payers !== undefined) {
      if (e.splitMethod === "just_me" || e.refundOfExpenseId) throw new ExpenseError("invalid", "This expense has one payer.");
      const r = resolvePayers(ctx, total, input.payers);
      payers = r?.payers ?? null;
      if (r) payerId = r.payerId;
    } else if (input.paidByMemberId !== undefined && input.paidByMemberId !== e.paidByMemberId) {
      payers = null; // picking one payer replaces the parts
    } else if (payers && total !== e.totalMinor) {
      throw new ExpenseError("invalid", "Update what each person paid so it adds up to the new total.");
    }
    let config = configOf(e);
    if (input.coveredBy !== undefined) {
      if (e.splitMethod === "just_me" || e.refundOfExpenseId) throw new ExpenseError("invalid", "Nobody else is on this expense.");
      const covers = validateCovers(ctx, input.coveredBy);
      config = { ...config, coveredBy: covers };
    }
    if (input.gohPolicy !== undefined) {
      if (e.splitMethod !== "itemized") throw new ExpenseError("invalid");
      config = { ...config, gohPolicy: input.gohPolicy };
    }
    if (input.participantIds) {
      if (e.splitMethod !== "even") throw new ExpenseError("invalid", "Only even splits have a people list.");
      const ps = [...new Set(input.participantIds)];
      for (const p of ps) if (!allowed.has(p)) throw new ExpenseError("invalid", "Someone selected isn't on this trip.");
      config = { ...config, participants: ps };
    }
    if (input.stopId) {
      const [s] = await tx.select({ id: stops.id }).from(stops).where(and(eq(stops.id, input.stopId), eq(stops.tripId, ctx.tripId)));
      if (!s) throw new ExpenseError("invalid", "That Stop isn't in this trip.");
    }
    if (input.ideaId) {
      const [i] = await tx.select({ id: ideas.id }).from(ideas).where(and(eq(ideas.id, input.ideaId), eq(ideas.tripId, ctx.tripId)));
      if (!i) throw new ExpenseError("invalid", "That idea isn't in this trip.");
    }
    const [updated] = await tx
      .update(expenses)
      .set({
        merchant: input.merchant !== undefined ? input.merchant.trim().slice(0, 120) || e.merchant : e.merchant,
        spentOn: input.spentOn !== undefined ? input.spentOn || null : e.spentOn,
        category: input.category ?? e.category,
        stopId: input.stopId !== undefined ? input.stopId : e.stopId,
        ideaId: input.ideaId !== undefined ? input.ideaId : e.ideaId,
        paidByMemberId: payerId,
        totalMinor: total,
        splitConfig: config,
      })
      .where(eq(expenses.id, e.id))
      .returning();
    if (!updated) throw new ExpenseError("forbidden");
    if (!e.refundOfExpenseId) await writePayers(tx, e.id, payers);
    await recomputeStoredShares(tx, updated, gohIds(ctx));
  });
}

export interface EditReceiptInput {
  tripId: string;
  expenseId: string;
  totalMinor: number;
  /** Lines to keep (with `id`) or add (without). Lines left out are removed with their claims. */
  items: { id?: string | null; label: string; amountMinor: number; quantity?: number }[];
  charges: money.ReceiptCharge[];
}

/**
 * MT6 (founder decision): an itemized receipt can be edited until someone has paid (lock):
 * items, amounts, total and charges. Claims on kept lines stay (quantity claims are capped at
 * the new quantity); shares are recomputed. Also the Q17 "enter the line items yourself" path.
 */
export async function editItemizedReceipt(db: Db, claims: Claims, input: EditReceiptInput): Promise<{ gapMinor: number }> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    const e = await loadExpense(tx, ctx, input.expenseId);
    if (!canManage(ctx, e)) throw new ExpenseError("forbidden", "Only the person who added it or an organizer can edit this.");
    if (e.deletedAt) throw new ExpenseError("deleted");
    if (e.lockedAt) throw new ExpenseError("locked", "Someone already paid against this, so it can't be edited. Add a correction instead.");
    if (e.splitMethod !== "itemized") throw new ExpenseError("invalid");
    money.assertMinor(input.totalMinor, "total");
    if (input.totalMinor <= 0) throw new ExpenseError("invalid", "Enter the amount you paid.");
    const payers = await loadPayers(tx, e.id);
    if (payers && input.totalMinor !== e.totalMinor) {
      throw new ExpenseError("invalid", "Update what each person paid so it adds up to the new total.");
    }
    const lines = input.items
      .filter((i) => i.label.trim() || i.amountMinor !== 0)
      .map((i) => {
        money.assertMinor(i.amountMinor, "item amount");
        return {
          id: i.id ?? null,
          label: i.label.trim().slice(0, 120) || "Item",
          amountMinor: i.amountMinor,
          quantity: Math.max(1, Math.min(99, Math.trunc(i.quantity ?? 1))),
        };
      });
    if (lines.length === 0) throw new ExpenseError("invalid", "Add the receipt's items.");
    for (const c of input.charges) money.validateReceipt({ totalMinor: 0, currency: e.currency, items: [], charges: [c] });
    const existing = await tx.select().from(expenseItems).where(eq(expenseItems.expenseId, e.id));
    const keep = new Set(lines.flatMap((l) => (l.id ? [l.id] : [])));
    for (const id of keep) if (!existing.some((x) => x.id === id)) throw new ExpenseError("invalid", "That item isn't on this receipt.");
    const gone = existing.filter((x) => !keep.has(x.id)).map((x) => x.id);
    if (gone.length) await tx.delete(expenseItems).where(inArray(expenseItems.id, gone));
    for (const l of lines) {
      if (l.id) {
        await tx
          .update(expenseItems)
          .set({ label: l.label, amountMinor: l.amountMinor, quantity: l.quantity })
          .where(eq(expenseItems.id, l.id));
        await tx
          .update(expenseItemClaims)
          .set({ weight: l.quantity })
          .where(and(eq(expenseItemClaims.itemId, l.id), sql`${expenseItemClaims.weight} > ${l.quantity}`));
      } else {
        await tx.insert(expenseItems).values({ expenseId: e.id, label: l.label, amountMinor: l.amountMinor, quantity: l.quantity });
      }
    }
    const sumKind = (k: money.ChargeKind) =>
      money.sumMinor(input.charges.filter((c) => c.kind === k && !c.includedInItems).map((c) => c.amountMinor));
    const [updated] = await tx
      .update(expenses)
      .set({
        totalMinor: input.totalMinor,
        taxMinor: sumKind("tax"),
        tipMinor: sumKind("tip"),
        splitConfig: { ...configOf(e), charges: input.charges },
      })
      .where(eq(expenses.id, e.id))
      .returning();
    await recomputeStoredShares(tx, updated!, gohIds(ctx));
    const v = money.validateReceipt({
      totalMinor: input.totalMinor,
      currency: e.currency,
      items: lines.map((l) => ({ amountMinor: l.amountMinor, label: l.label })),
      charges: input.charges,
    });
    return { gapMinor: v.discrepancyMinor };
  });
}

export interface CorrectLockedInput {
  tripId: string;
  expenseId: string;
  totalMinor: number;
  paidByMemberId: string;
  /** Q23a: several payers in the corrected version (must sum to `totalMinor`). */
  payers?: { memberId: string; paidMinor: number }[] | null;
  /** Even expenses may change who's in; others keep their proportions. */
  participantIds?: string[];
  reason: string;
}

/**
 * FR-69 / E-22: a settled (locked) expense is never edited. The correction is appended as
 * adjustment entries (summing to zero) relative to the expense's current corrected state, plus
 * a snapshot of the corrected state so spending reports follow it (Q21).
 */
export async function correctLockedExpense(db: Db, claims: Claims, input: CorrectLockedInput): Promise<{ entries: number }> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    const e = await loadExpense(tx, ctx, input.expenseId);
    if (!canManage(ctx, e)) throw new ExpenseError("forbidden", "Only the person who added it or an organizer can correct this.");
    if (!e.lockedAt) throw new ExpenseError("invalid", "This expense isn't settled yet; edit it directly.");
    const reason = input.reason.trim().slice(0, 300);
    if (!reason) throw new ExpenseError("invalid", "Say why it's being corrected.");
    money.assertMinor(input.totalMinor, "total");
    if (Math.sign(input.totalMinor) !== Math.sign(e.totalMinor) && input.totalMinor !== 0) {
      throw new ExpenseError("invalid", "Use a refund to reverse money.");
    }
    if (!moneyMemberIds(ctx).has(input.paidByMemberId)) throw new ExpenseError("invalid", "The payer isn't on this trip.");
    const original = await ledgerOf(tx, e);
    const prior = await adjustmentsFor(tx, e.id, e.currency);
    const current = await currentState(tx, e, original);
    // Weights come from the ORIGINAL split so repeated corrections don't drift by a cent each time.
    const target = targetSplit(ctx, e, original, input.totalMinor, input.participantIds);
    // Q23a: who paid in the corrected version.
    let payerId = input.paidByMemberId;
    let payers: money.PayerPart[] | null = null;
    const given = input.totalMinor === 0 ? null : resolvePayers(ctx, input.totalMinor, input.payers);
    if (given) {
      payerId = given.payerId;
      payers = given.payers;
    } else if (current.payers?.length && input.paidByMemberId === current.payerId && input.totalMinor !== 0) {
      payers = money.scalePayers(current.payers, input.totalMinor, { leftoverTo: pennyTo(e) });
    }
    const next: money.LedgerExpense = {
      currency: e.currency,
      totalMinor: input.totalMinor,
      payerId,
      ...(payers && payers.length ? { payers } : {}),
      shares: target,
    };
    const entries = money.correctionAdjustments(original, prior, next);
    await insertAdjustments(tx, ctx, e.id, entries, reason);
    await insertCorrection(tx, ctx, e.id, next, reason);
    return { entries: entries.length };
  });
}

/** An expense row as the ledger sees it (payers, personal flag, stored shares). */
async function ledgerOf(tx: Tx, e: ExpenseRow): Promise<money.LedgerExpense> {
  const payers = await loadPayers(tx, e.id);
  return {
    id: e.id,
    currency: e.currency,
    totalMinor: e.totalMinor,
    payerId: e.paidByMemberId,
    ...(payers ? { payers } : {}),
    ...(e.personalMemberId ? { personal: true } : {}),
    shares: await sharesOf(tx, e.id),
  };
}

/** The latest corrected state of a settled expense (Q21), or the original when never corrected. */
async function currentState(tx: Tx, e: ExpenseRow, original: money.LedgerExpense): Promise<money.LedgerExpense> {
  const [last] = await tx
    .select()
    .from(expenseCorrections)
    .where(eq(expenseCorrections.expenseId, e.id))
    .orderBy(desc(expenseCorrections.createdAt), desc(expenseCorrections.id))
    .limit(1);
  if (!last) return original;
  const payers = last.payers as money.PayerPart[] | null;
  return {
    currency: e.currency,
    totalMinor: last.totalMinor,
    payerId: last.paidByMemberId,
    ...(payers && payers.length ? { payers } : {}),
    shares: (last.shares as money.Share[]).slice().sort((a, b) => money.compareIds(a.memberId, b.memberId)),
  };
}

async function insertCorrection(tx: Tx, ctx: Ctx, expenseId: string, next: money.LedgerExpense, reason: string) {
  await tx.insert(expenseCorrections).values({
    expenseId,
    tripId: ctx.tripId, // set by the DB guard
    totalMinor: next.totalMinor,
    shares: next.shares.map((s) => ({ memberId: s.memberId, shareMinor: s.shareMinor })),
    paidByMemberId: next.payerId,
    payers: next.payers?.length ? next.payers.map((p) => ({ memberId: p.memberId, paidMinor: p.paidMinor })) : null,
    reason,
    createdByMemberId: ctx.me.id, // set by the DB guard
  });
}

async function adjustmentsFor(tx: Tx, expenseId: string, currency: string): Promise<money.AdjustmentEntry[]> {
  const rows = await tx
    .select({ memberId: expenseAdjustments.memberId, deltaMinor: expenseAdjustments.deltaMinor, reason: expenseAdjustments.reason })
    .from(expenseAdjustments)
    .where(eq(expenseAdjustments.expenseId, expenseId));
  // Balance resolutions from member removal (FR-9) are only anchored to an expense; they are not
  // corrections of it, so a later correction must not undo them.
  return rows
    .filter((r) => !r.reason.startsWith("member_removed:"))
    .map((r) => ({ memberId: r.memberId, currency, deltaMinor: r.deltaMinor }));
}

/** Corrected shares: even expenses may change who's in; others keep their current proportions. */
function targetSplit(
  ctx: Ctx,
  e: ExpenseRow,
  current: money.LedgerExpense,
  totalMinor: number,
  participantIds: string[] | undefined,
): money.Share[] {
  if (e.splitMethod === "even" && participantIds?.length) {
    return money.applyCoveredBy(
      money.splitEven({
        totalMinor,
        currency: e.currency,
        participantIds: [...new Set(participantIds)],
        guestOfHonorIds: gohIds(ctx),
        leftoverTo: pennyTo(e),
      }),
      configOf(e).coveredBy ?? [],
    ).shares;
  }
  const weights = current.shares.map((s) => ({ memberId: s.memberId, weight: Math.abs(s.shareMinor) }));
  if (weights.every((w) => w.weight === 0)) {
    return money.splitEven({ totalMinor, currency: e.currency, participantIds: weights.map((w) => w.memberId), leftoverTo: pennyTo(e) })
      .shares;
  }
  return money.splitByWeights({ totalMinor, currency: e.currency, weights, leftoverTo: pennyTo(e) }).shares;
}

async function insertAdjustments(tx: Tx, ctx: Ctx, expenseId: string, entries: money.AdjustmentEntry[], reason: string) {
  if (entries.length === 0) return;
  await tx.insert(expenseAdjustments).values(
    entries.map((a) => ({
      expenseId,
      tripId: ctx.tripId, // set by the DB guard
      memberId: a.memberId,
      deltaMinor: a.deltaMinor,
      reason,
      createdByMemberId: ctx.me.id, // set by the DB guard
    })),
  );
}

/** Soft delete (NFR-5). Locked expenses can't be deleted (FR-69). */
export async function deleteExpense(db: Db, claims: Claims, tripId: string, expenseId: string): Promise<void> {
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    const e = await loadExpense(tx, ctx, expenseId);
    if (!canManage(ctx, e)) throw new ExpenseError("forbidden", "Only the person who added it or an organizer can delete this.");
    if (e.lockedAt) throw new ExpenseError("locked", "This expense is settled. Add a correction or a refund instead.");
    if (e.deletedAt) return;
    await tx.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, e.id));
  });
}

/** Undo a soft delete (P7). Clients can't touch deleted rows, so this runs as the service after an RLS check. */
export async function restoreExpense(db: Db, claims: Claims, tripId: string, expenseId: string): Promise<void> {
  const ok = await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    const e = await loadExpense(tx, ctx, expenseId);
    return canManage(ctx, e) && !!e.deletedAt ? ctx.me.id : null;
  });
  if (!ok) throw new ExpenseError("forbidden");
  await asService(db, async (tx) => {
    await tx.update(expenses).set({ deletedAt: null }).where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)));
    await tx.execute(sql`insert into audit_log (trip_id, actor_member_id, action, entity, entity_id)
      values (${tripId}, ${ok}, 'restore', 'expense', ${expenseId})`);
  });
}

// ---------------------------------------------------------------------------
// Refunds (FR-72, E-12) and payments (FR-71)
// ---------------------------------------------------------------------------

export async function recordRefund(
  db: Db,
  claims: Claims,
  input: { tripId: string; expenseId: string; amountMinor: number; spentOn?: string | null },
): Promise<{ expenseId: string }> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    const orig = await loadExpense(tx, ctx, input.expenseId);
    if (orig.deletedAt) throw new ExpenseError("deleted");
    if (orig.refundOfExpenseId || orig.totalMinor <= 0) throw new ExpenseError("invalid", "Only an expense can be refunded.");
    if (orig.personalMemberId) throw new ExpenseError("invalid", "Change the amount of a personal expense instead.");
    const refunds = await tx
      .select({ total: expenses.totalMinor })
      .from(expenses)
      .where(and(eq(expenses.refundOfExpenseId, orig.id), isNull(expenses.deletedAt)));
    // A settled expense that was corrected refunds along its corrected total and split (Q21).
    const state = await currentState(tx, orig, await ledgerOf(tx, orig));
    const left = money.refundableRemaining(state.totalMinor, refunds.map((r) => r.total));
    if (input.amountMinor > left) throw new ExpenseError("invalid", "That's more than is left to refund.");
    const id = randomUUID();
    const split = money.refundFromOriginal(
      { currency: orig.currency, totalMinor: state.totalMinor, shares: state.shares.filter((s) => s.shareMinor !== 0) },
      input.amountMinor,
      { leftoverTo: pennyTo(orig) },
    );
    const payers = state.payers?.length
      ? money.scalePayers(state.payers, split.totalMinor, { leftoverTo: pennyTo(orig) })
      : null;
    await tx.insert(expenses).values({
      id,
      tripId: ctx.tripId,
      stopId: orig.stopId,
      ideaId: orig.ideaId,
      merchant: `Refund: ${orig.merchant}`.slice(0, 120),
      spentOn: input.spentOn || null,
      currency: orig.currency,
      totalMinor: split.totalMinor,
      category: orig.category,
      splitMethod: orig.splitMethod,
      paidByMemberId: state.payerId, // the money went back to the original payer(s)
      uploadedByMemberId: ctx.me.id,
      refundOfExpenseId: orig.id,
      splitConfig: {},
    });
    if (payers?.length) await writePayers(tx, id, payers);
    await tx.insert(expenseShares).values(split.shares.map((s) => ({ expenseId: id, memberId: s.memberId, shareMinor: s.shareMinor })));
    return { expenseId: id };
  });
}

/**
 * FR-71: record a settle-up. The recorder must be one of the two people (or act for them), or
 * an organizer. Recording locks the related expenses (DB trigger, FR-69). Never deleted.
 */
export async function recordPayment(
  db: Db,
  claims: Claims,
  input: { tripId: string; fromMemberId: string; toMemberId: string; currency: string; amountMinor: number; note?: string | null },
): Promise<void> {
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    if (ctx.size === "solo") throw new ExpenseError("not_available");
    money.assertPayment({
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      currency: input.currency,
      amountMinor: input.amountMinor,
    });
    const allowed = moneyMemberIds(ctx);
    if (!allowed.has(input.fromMemberId) || !allowed.has(input.toMemberId)) {
      throw new ExpenseError("invalid", "Both people must be on this trip.");
    }
    if (!ctx.isOrganizer && !actsFor(ctx, input.fromMemberId) && !actsFor(ctx, input.toMemberId)) {
      throw new ExpenseError("forbidden", "You can record payments you made or received.");
    }
    await tx.insert(payments).values({
      tripId: ctx.tripId,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      currency: input.currency,
      amountMinor: input.amountMinor,
      recordedByMemberId: ctx.me.id,
      note: input.note?.trim().slice(0, 200) || null,
    });
  });
}

// ---------------------------------------------------------------------------
// Itemized claims (FR-62, D22, E-1–E-3)
// ---------------------------------------------------------------------------

/**
 * Claim (or unclaim) an item. Members claim for themselves (or managed members); the uploader
 * and organizers can assign anyone. `weight` = units for quantity claims ("1 of 3", E-3).
 */
export async function setClaim(
  db: Db,
  claims: Claims,
  input: { tripId: string; expenseId: string; itemId: string; memberId: string; weight: number | null },
): Promise<void> {
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    const e = await loadExpense(tx, ctx, input.expenseId);
    if (e.deletedAt) throw new ExpenseError("deleted");
    if (e.lockedAt) throw new ExpenseError("locked", "This expense is settled; claims can't change.");
    if (e.splitMethod !== "itemized") throw new ExpenseError("invalid");
    if (!actsFor(ctx, input.memberId) && !canManage(ctx, e)) throw new ExpenseError("forbidden", "You can only claim your own items.");
    if (!moneyMemberIds(ctx).has(input.memberId)) throw new ExpenseError("invalid");
    const [item] = await tx
      .select()
      .from(expenseItems)
      .where(and(eq(expenseItems.id, input.itemId), eq(expenseItems.expenseId, e.id)));
    if (!item) throw new ExpenseError("not_found");
    await tx
      .delete(expenseItemClaims)
      .where(and(eq(expenseItemClaims.itemId, item.id), eq(expenseItemClaims.memberId, input.memberId)));
    if (input.weight !== null) {
      const w = Math.trunc(input.weight);
      if (!(w >= 1 && w <= Math.max(1, item.quantity))) throw new ExpenseError("invalid", "Pick how many you had.");
      await tx.insert(expenseItemClaims).values({ itemId: item.id, memberId: input.memberId, weight: w });
    }
  });
  await recomputeAsService(db, input.tripId, input.expenseId);
}

/** FR-62 "absorb": the payer covers an unclaimed item. Uploader/organizers only. */
export async function setAbsorbed(
  db: Db,
  claims: Claims,
  input: { tripId: string; expenseId: string; itemId: string; absorbed: boolean },
): Promise<void> {
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    const e = await loadExpense(tx, ctx, input.expenseId);
    if (!canManage(ctx, e)) throw new ExpenseError("forbidden");
    if (e.lockedAt) throw new ExpenseError("locked");
    if (e.deletedAt) throw new ExpenseError("deleted");
    const r = await tx
      .update(expenseItems)
      .set({ absorbed: input.absorbed })
      .where(and(eq(expenseItems.id, input.itemId), eq(expenseItems.expenseId, e.id)))
      .returning({ id: expenseItems.id });
    if (r.length === 0) throw new ExpenseError("not_found");
  });
  await recomputeAsService(db, input.tripId, input.expenseId);
}

/**
 * After a claim change, stored shares are recomputed from the claims. Members may claim but
 * can't write shares under RLS, so this runs as the service. It is deterministic from the rows
 * and refuses locked or deleted expenses, so it can't be used to change anything else.
 */
async function recomputeAsService(db: Db, tripId: string, expenseId: string): Promise<void> {
  await asService(db, async (tx) => {
    const [e] = await tx.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)));
    if (!e || e.lockedAt || e.deletedAt) return;
    const goh = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.isGuestOfHonor, true), eq(members.status, "active")));
    await recomputeStoredShares(tx, e, goh.map((g) => g.id));
  });
}

// ---------------------------------------------------------------------------
// Guest of honor (FR-90)
// ---------------------------------------------------------------------------

/**
 * One tap: the guest of honor is excluded from every UNLOCKED split and their share spreads
 * across the rest. Settled (locked) expenses are left as they are and counted in the result so
 * the organizer can correct them if they want (FR-69). Organizers only; group trips only.
 * (surprise.ts `setGuestOfHonor` only flips the flag; call `resplitForGuestsOfHonor` after it.)
 */
export async function setGuestOfHonorInSplits(
  db: Db,
  claims: Claims,
  input: { tripId: string; memberId: string; on: boolean },
): Promise<{ resplit: number; settledUnchanged: number }> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    if (!ctx.isOrganizer) throw new ExpenseError("forbidden", "Only organizers can mark a guest of honor.");
    if (ctx.size !== "group") throw new ExpenseError("not_available");
    const target = ctx.members.find((m) => m.id === input.memberId && m.status === "active");
    if (!target) throw new ExpenseError("invalid");
    await tx.update(members).set({ isGuestOfHonor: input.on }).where(eq(members.id, target.id));
    const goh = new Set(gohIds(ctx));
    if (input.on) goh.add(target.id);
    else goh.delete(target.id);
    if (goh.size >= activeIds(ctx).length) throw new ExpenseError("invalid", "Someone has to pay.");
    return resplitAll(tx, ctx, goh, target.id);
  });
}

/** Re-split every unlocked expense with the trip's current guest-of-honor flags (FR-90). Organizers only. */
export async function resplitForGuestsOfHonor(
  db: Db,
  claims: Claims,
  tripId: string,
): Promise<{ resplit: number; settledUnchanged: number }> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    if (!ctx.isOrganizer) throw new ExpenseError("forbidden");
    return resplitAll(tx, ctx, new Set(gohIds(ctx)), null);
  });
}

async function resplitAll(tx: Tx, ctx: Ctx, goh: Set<string>, onlyInvolving: string | null) {
  const rows = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.tripId, ctx.tripId), isNull(expenses.deletedAt), isNull(expenses.refundOfExpenseId)));
  let resplit = 0;
  let settledUnchanged = 0;
  for (const e of rows) {
    if (e.splitMethod === "just_me") continue;
    if (onlyInvolving) {
      const items = await loadItems(tx, e.id);
      const involved =
        (configOf(e).participants ?? []).includes(onlyInvolving) ||
        items.some((i) => i.claims.some((c) => c.memberId === onlyInvolving)) ||
        (await sharesOf(tx, e.id)).some((s) => s.memberId === onlyInvolving);
      if (!involved) continue;
    }
    if (e.lockedAt) {
      settledUnchanged++;
      continue;
    }
    await recomputeStoredShares(tx, e, [...goh]);
    resplit++;
  }
  return { resplit, settledUnchanged };
}

// ---------------------------------------------------------------------------
// Late joiners (FR-12, FR-T10) and drop-outs (FR-13)
// ---------------------------------------------------------------------------

export interface ChecklistExpense {
  expenseId: string;
  merchant: string;
  spentOn: string | null;
  currency: string;
  totalMinor: number;
  method: SplitMethod;
  locked: boolean;
  /** Late joiners: this expense has a drop-out flagged "refund if replaced" (FR-13). */
  replaces?: { memberId: string; name: string; shareMinor: number };
  /** Drop-outs: their current share. */
  shareMinor?: number;
}

export interface MembershipReview {
  memberId: string;
  name: string;
  kind: "late_join" | "drop_out";
  pending: number;
}

/** Organizer view: who joined after expenses existed, or dropped out with shares, and still needs a decision. */
export async function membershipReviews(db: Db, claims: Claims, tripId: string): Promise<MembershipReview[]> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    if (!ctx.isOrganizer) return [];
    const out: MembershipReview[] = [];
    for (const m of ctx.members) {
      if (m.status === "active" && m.id !== ctx.me.id) {
        const list = await lateJoinList(tx, ctx, m.id);
        if (list.length) out.push({ memberId: m.id, name: m.displayName, kind: "late_join", pending: list.length });
      }
      if (m.status === "not_attending" || m.status === "removed") {
        const list = await dropOutList(tx, ctx, m.id);
        if (list.length) out.push({ memberId: m.id, name: m.displayName, kind: "drop_out", pending: list.length });
      }
    }
    return out;
  });
}

async function decisionsFor(tx: Tx, ctx: Ctx, memberId: string, kind: "late_join" | "drop_out") {
  return tx
    .select()
    .from(expenseMemberDecisions)
    .where(
      and(
        eq(expenseMemberDecisions.tripId, ctx.tripId),
        eq(expenseMemberDecisions.memberId, memberId),
        eq(expenseMemberDecisions.kind, kind),
      ),
    );
}

async function lateJoinList(tx: Tx, ctx: Ctx, memberId: string): Promise<ChecklistExpense[]> {
  const m = ctx.members.find((x) => x.id === memberId);
  if (!m) return [];
  const joined = m.joinedAt ?? m.createdAt;
  const rows = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.tripId, ctx.tripId), isNull(expenses.deletedAt), isNull(expenses.refundOfExpenseId)))
    .orderBy(asc(expenses.createdAt));
  const decided = new Set((await decisionsFor(tx, ctx, memberId, "late_join")).map((d) => d.expenseId));
  // Drop-out shares flagged "refund if replaced" and not yet replaced.
  const flagged = await tx
    .select()
    .from(expenseMemberDecisions)
    .where(
      and(
        eq(expenseMemberDecisions.tripId, ctx.tripId),
        eq(expenseMemberDecisions.kind, "drop_out"),
        eq(expenseMemberDecisions.decision, "refund_if_replaced"),
      ),
    );
  const replacedDone = await tx
    .select()
    .from(expenseMemberDecisions)
    .where(and(eq(expenseMemberDecisions.tripId, ctx.tripId), eq(expenseMemberDecisions.decision, "replaced")));
  const out: ChecklistExpense[] = [];
  for (const e of rows) {
    if (e.createdAt >= joined || decided.has(e.id)) continue;
    if (e.splitMethod === "itemized") continue; // Q22: they claim their own items instead (see lateJoinerClaimables)
    if (e.personalMemberId) continue; // Q23c: personal expenses are never shared
    const shares = await sharesOf(tx, e.id);
    if (shares.some((s) => s.memberId === memberId)) continue;
    const flag = flagged.find(
      (f) => f.expenseId === e.id && !replacedDone.some((r) => r.expenseId === e.id && r.replacedMemberId === f.memberId),
    );
    const item: ChecklistExpense = {
      expenseId: e.id,
      merchant: e.merchant,
      spentOn: e.spentOn,
      currency: e.currency,
      totalMinor: e.totalMinor,
      method: e.splitMethod,
      locked: !!e.lockedAt,
    };
    if (flag) {
      const share = shares.find((s) => s.memberId === flag.memberId);
      if (share) {
        item.replaces = {
          memberId: flag.memberId,
          name: ctx.members.find((x) => x.id === flag.memberId)?.displayName ?? "Former member",
          shareMinor: share.shareMinor,
        };
      }
    }
    out.push(item);
  }
  return out;
}

async function dropOutList(tx: Tx, ctx: Ctx, memberId: string): Promise<ChecklistExpense[]> {
  const rows = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.tripId, ctx.tripId), isNull(expenses.deletedAt), isNull(expenses.refundOfExpenseId)))
    .orderBy(asc(expenses.createdAt));
  const decided = new Set((await decisionsFor(tx, ctx, memberId, "drop_out")).map((d) => d.expenseId));
  const out: ChecklistExpense[] = [];
  for (const e of rows) {
    if (decided.has(e.id) || e.splitMethod === "just_me") continue;
    const share = (await sharesOf(tx, e.id)).find((s) => s.memberId === memberId);
    if (!share || share.shareMinor === 0) continue;
    out.push({
      expenseId: e.id,
      merchant: e.merchant,
      spentOn: e.spentOn,
      currency: e.currency,
      totalMinor: e.totalMinor,
      method: e.splitMethod,
      locked: !!e.lockedAt,
      shareMinor: share.shareMinor,
    });
  }
  return out;
}

export async function lateJoinerChecklist(db: Db, claims: Claims, tripId: string, memberId: string): Promise<ChecklistExpense[]> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    if (!ctx.isOrganizer) throw new ExpenseError("forbidden");
    return lateJoinList(tx, ctx, memberId);
  });
}

export interface ClaimableReceipt {
  expenseId: string;
  merchant: string;
  spentOn: string | null;
  currency: string;
  totalMinor: number;
}

/**
 * Q22 (founder decision): late joiners claim their own items on itemized receipts; organizers
 * can also add them. For organizers: per late joiner, the unsettled itemized receipts from
 * before they joined that they have no items on yet.
 */
export async function lateJoinerClaimables(
  db: Db,
  claims: Claims,
  tripId: string,
): Promise<{ memberId: string; name: string; receipts: ClaimableReceipt[] }[]> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    if (!ctx.isOrganizer) return [];
    const rows = await tx
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.tripId, tripId),
          eq(expenses.splitMethod, "itemized"),
          isNull(expenses.deletedAt),
          isNull(expenses.lockedAt),
          isNull(expenses.refundOfExpenseId),
        ),
      )
      .orderBy(asc(expenses.createdAt));
    const out: { memberId: string; name: string; receipts: ClaimableReceipt[] }[] = [];
    for (const m of ctx.members) {
      if (m.status !== "active") continue;
      const joined = m.joinedAt ?? m.createdAt;
      const receipts: ClaimableReceipt[] = [];
      for (const e of rows) {
        if (e.createdAt >= joined) continue;
        const items = await loadItems(tx, e.id);
        if (items.some((i) => i.claims.some((c) => c.memberId === m.id))) continue;
        receipts.push({ expenseId: e.id, merchant: e.merchant, spentOn: e.spentOn, currency: e.currency, totalMinor: e.totalMinor });
      }
      if (receipts.length) out.push({ memberId: m.id, name: m.id === ctx.me.id ? "You" : m.displayName, receipts });
    }
    return out;
  });
}

export async function dropOutChecklist(db: Db, claims: Claims, tripId: string, memberId: string): Promise<ChecklistExpense[]> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    if (!ctx.isOrganizer) throw new ExpenseError("forbidden");
    return dropOutList(tx, ctx, memberId);
  });
}

/** The split as it stands now: stored shares, or a settled expense's latest correction (Q21). */
async function currentSplit(tx: Tx, e: ExpenseRow): Promise<money.Split> {
  const original = await ledgerOf(tx, e);
  const s = e.lockedAt ? await currentState(tx, e, original) : original;
  return { currency: e.currency, totalMinor: s.totalMinor, shares: [...s.shares] };
}

/** Rewrite an unlocked expense's split, or append adjustments (and a correction snapshot) for a locked one (FR-69). */
async function applyNewSplit(tx: Tx, ctx: Ctx, e: ExpenseRow, next: money.Split, reason: string, config?: ExpenseSplitConfig) {
  if (e.lockedAt) {
    const original = await ledgerOf(tx, e);
    const current = await currentState(tx, e, original);
    const prior = await adjustmentsFor(tx, e.id, e.currency);
    const target: money.LedgerExpense = { ...current, totalMinor: next.totalMinor, shares: next.shares };
    const entries = money.correctionAdjustments(original, prior, target);
    await insertAdjustments(tx, ctx, e.id, entries, reason);
    await insertCorrection(tx, ctx, e.id, target, reason); // Q21: reports follow
    return;
  }
  if (config) await tx.update(expenses).set({ splitConfig: config }).where(eq(expenses.id, e.id));
  await tx.delete(expenseShares).where(eq(expenseShares.expenseId, e.id));
  await tx.insert(expenseShares).values(next.shares.map((s) => ({ expenseId: e.id, memberId: s.memberId, shareMinor: s.shareMinor })));
}

/**
 * FR-12: the organizer ticks which past shared expenses the new person shares (`include`),
 * which they don't (`skip`), and where they replace a drop-out flagged "refund if replaced"
 * (FR-13). FR-T10: a solo "just me" expense becomes an even split with the new person.
 */
export async function applyLateJoiner(
  db: Db,
  claims: Claims,
  input: { tripId: string; memberId: string; include: string[]; skip: string[]; replace?: string[] },
): Promise<void> {
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    if (!ctx.isOrganizer) throw new ExpenseError("forbidden");
    const joiner = ctx.members.find((m) => m.id === input.memberId && m.status === "active");
    if (!joiner) throw new ExpenseError("invalid");
    const list = await lateJoinList(tx, ctx, joiner.id);
    const byId = new Map(list.map((x) => [x.expenseId, x]));
    const goh = gohIds(ctx);
    for (const id of input.replace ?? []) {
      const item = byId.get(id);
      if (!item?.replaces) throw new ExpenseError("invalid");
      const e = await loadExpense(tx, ctx, id);
      const current = await currentSplit(tx, e);
      const next = money.replaceMember(current, item.replaces.memberId, joiner.id);
      const cfg = configOf(e);
      const participants = (cfg.participants ?? []).filter((p) => p !== item.replaces!.memberId);
      await applyNewSplit(tx, ctx, e, next, `${joiner.displayName} replaced ${item.replaces.name}`, {
        ...cfg,
        participants: [...new Set([...participants, joiner.id])],
      });
      await tx.insert(expenseMemberDecisions).values({
        tripId: ctx.tripId,
        expenseId: e.id,
        memberId: joiner.id,
        kind: "late_join",
        decision: "replaced",
        replacedMemberId: item.replaces.memberId,
      });
      byId.delete(id);
    }
    for (const id of input.include) {
      if (!byId.has(id)) continue;
      const e = await loadExpense(tx, ctx, id);
      const current = await currentSplit(tx, e);
      let next: money.Split;
      let cfg: ExpenseSplitConfig;
      if (e.splitMethod === "just_me") {
        const people = [...new Set([...current.shares.map((s) => s.memberId), joiner.id])];
        next = money.resplitEvenly(current, people, { guestOfHonorIds: goh, leftoverTo: pennyTo(e) });
        cfg = { participants: people };
        if (!e.lockedAt) await tx.update(expenses).set({ splitMethod: "even" }).where(eq(expenses.id, e.id));
      } else {
        const people = [...new Set([...(configOf(e).participants ?? current.shares.map((s) => s.memberId)), joiner.id])];
        next = money.resplitEvenly(current, people, { guestOfHonorIds: goh, leftoverTo: pennyTo(e) });
        cfg = { ...configOf(e), participants: people };
      }
      await applyNewSplit(tx, ctx, e, next, `Added ${joiner.displayName} (joined later)`, cfg);
      await tx.insert(expenseMemberDecisions).values({
        tripId: ctx.tripId,
        expenseId: e.id,
        memberId: joiner.id,
        kind: "late_join",
        decision: "include",
      });
      byId.delete(id);
    }
    for (const id of input.skip) {
      if (!byId.has(id)) continue;
      await tx.insert(expenseMemberDecisions).values({
        tripId: ctx.tripId,
        expenseId: id,
        memberId: joiner.id,
        kind: "late_join",
        decision: "skip",
      });
    }
  });
}

export type DropOutDecision = money.DropOutDecision;

/** FR-13: per expense, keep their share, redistribute it, or mark "refund if replaced". */
export async function applyDropOutDecisions(
  db: Db,
  claims: Claims,
  input: { tripId: string; memberId: string; decisions: { expenseId: string; decision: DropOutDecision }[] },
): Promise<void> {
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    if (!ctx.isOrganizer) throw new ExpenseError("forbidden");
    const who = ctx.members.find((m) => m.id === input.memberId);
    if (!who) throw new ExpenseError("invalid");
    const list = new Set((await dropOutList(tx, ctx, who.id)).map((x) => x.expenseId));
    for (const d of input.decisions) {
      if (!list.has(d.expenseId)) continue;
      const e = await loadExpense(tx, ctx, d.expenseId);
      if (d.decision === "redistribute") {
        const current = await currentSplit(tx, e);
        const cfg = configOf(e);
        if (e.splitMethod === "itemized" && !e.lockedAt) {
          // Their claimed items go back to the pool (E-1); the uploader re-assigns or the rest share them.
          const items = await tx.select({ id: expenseItems.id }).from(expenseItems).where(eq(expenseItems.expenseId, e.id));
          if (items.length) {
            await tx
              .delete(expenseItemClaims)
              .where(and(eq(expenseItemClaims.memberId, who.id), inArray(expenseItemClaims.itemId, items.map((i) => i.id))));
          }
          const participants = (cfg.participants ?? []).filter((p) => p !== who.id);
          const [updated] = await tx
            .update(expenses)
            .set({ splitConfig: { ...cfg, participants } })
            .where(eq(expenses.id, e.id))
            .returning();
          await recomputeStoredShares(tx, updated!, gohIds(ctx));
        } else {
          const next = money.applyDropOut(current, who.id, "redistribute", { leftoverTo: pennyTo(e) }).split;
          const kept = next.shares.filter((s) => s.memberId !== who.id || s.shareMinor !== 0);
          await applyNewSplit(
            tx,
            ctx,
            e,
            { ...next, shares: kept },
            `${who.displayName} dropped out; share spread over the others`,
            { ...cfg, participants: (cfg.participants ?? []).filter((p) => p !== who.id) },
          );
        }
      }
      await tx.insert(expenseMemberDecisions).values({
        tripId: ctx.tripId,
        expenseId: e.id,
        memberId: who.id,
        kind: "drop_out",
        decision: d.decision,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Reads: money page, expense detail (FR-124, FR-65, FR-66, FR-70, FR-T8)
// ---------------------------------------------------------------------------

export interface ExpenseListItem {
  id: string;
  merchant: string;
  spentOn: string | null;
  createdAt: Date;
  currency: string;
  totalMinor: number;
  category: ExpenseCategory;
  method: SplitMethod;
  payerId: string;
  payerName: string;
  /** Q23a: number of people who paid parts (0 or 1 = one payer). */
  payerCount: number;
  myShareMinor: number;
  locked: boolean;
  isRefund: boolean;
  /** Q23c: tracked for me only. */
  personal: boolean;
  /** Unclaimed items; until claimed they sit on the uploader (Q16). */
  pendingClaims: number;
  /** The caller added it and items are still unclaimed (D22 nudge). */
  needsMyAttention: boolean;
  /** Q17: the lines don't add up to the total ("couldn't read this receipt correctly"). */
  unreadable: boolean;
  hasReceipt: boolean;
}

export interface SettleLine {
  currency: string;
  direction: "you_owe" | "owes_you";
  otherMemberId: string;
  otherName: string;
  amountMinor: number;
}

export interface Transfer {
  currency: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amountMinor: number;
}

/** MT1: one line of the in-app "What changed" list. */
export interface ActivityView {
  key: string;
  kind: "expense" | "correction" | "edit" | "payment";
  at: Date;
  currency: string;
  expenseId: string | null;
  merchant: string | null;
  actorName: string;
  otherName: string | null;
  effectMinor: number | null;
  myShareMinor: number | null;
  reason: string | null;
}

/** Q24: two receipts whose line items look like the same bill. */
export interface DuplicatePair {
  a: { id: string; merchant: string; totalMinor: number; currency: string; spentOn: string | null; uploadedBy: string; locked: boolean };
  b: { id: string; merchant: string; totalMinor: number; currency: string; spentOn: string | null; uploadedBy: string; locked: boolean };
  labelPermille: number;
  amountPermille: number;
}

export interface MoneyOverview {
  tripId: string;
  size: TripSize;
  me: { memberId: string; isOrganizer: boolean; displayName: string };
  members: { id: string; displayName: string; status: string; isGuestOfHonor: boolean }[];
  expenses: ExpenseListItem[];
  /** Balances per currency, by member (FR-66, FR-70). */
  balances: Record<string, Record<string, number>>;
  /** The caller's lines: "You owe Sam $X" per currency (FR-T8; simplified in groups). */
  mine: SettleLine[];
  /** Everyone's suggested transfers (groups, FR-70). Recomputed on view (E-23). */
  transfers: Transfer[];
  /** Group spending (personal-only expenses excluded), corrections applied (Q21). */
  categories: Record<string, Partial<Record<ExpenseCategory, number>>>;
  spend: Record<string, Record<string, number>>;
  /** Q23c: the caller's personal-only spend per currency. */
  personalSpend: Record<string, number>;
  currencies: string[];
  payments: { id: string; fromName: string; toName: string; currency: string; amountMinor: number; createdAt: Date; note: string | null }[];
  budgetCheckIn: boolean;
  /** MT1: latest money changes affecting the caller. */
  activity: ActivityView[];
  /** Organizer-only flags (empty for everyone else). */
  organizer: {
    /** Q16: receipts whose unclaimed items sit on the uploader. */
    unclaimed: { expenseId: string; merchant: string; uploaderName: string; count: number }[];
    /** Q24: probable duplicates by line items, not yet resolved. */
    duplicates: DuplicatePair[];
  };
}

/** Q21: corrected-state snapshots by expense, oldest first. */
async function correctionsBy(tx: Tx, ids: string[]): Promise<Map<string, money.CorrectionSnapshot[]>> {
  const out = new Map<string, money.CorrectionSnapshot[]>();
  if (!ids.length) return out;
  const rows = await tx
    .select()
    .from(expenseCorrections)
    .where(inArray(expenseCorrections.expenseId, ids))
    .orderBy(asc(expenseCorrections.createdAt), asc(expenseCorrections.id));
  for (const r of rows) {
    const list = out.get(r.expenseId) ?? [];
    list.push({ totalMinor: r.totalMinor, shares: r.shares as money.Share[] });
    out.set(r.expenseId, list);
  }
  return out;
}

export async function getMoneyOverview(db: Db, claims: Claims, tripId: string): Promise<MoneyOverview> {
  const o = await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    const rows = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)))
      .orderBy(desc(expenses.createdAt));
    const ids = rows.map((r) => r.id);
    const shareRows = ids.length ? await tx.select().from(expenseShares).where(inArray(expenseShares.expenseId, ids)) : [];
    const payerRows = ids.length ? await tx.select().from(expensePayers).where(inArray(expensePayers.expenseId, ids)) : [];
    const itemRows = ids.length
      ? await tx.select().from(expenseItems).where(inArray(expenseItems.expenseId, ids))
      : [];
    const claimRows = itemRows.length
      ? await tx.select().from(expenseItemClaims).where(inArray(expenseItemClaims.itemId, itemRows.map((i) => i.id)))
      : [];
    const claimed = new Set(claimRows.map((c) => c.itemId));
    const payRows = await tx.select().from(payments).where(eq(payments.tripId, tripId)).orderBy(desc(payments.createdAt));
    const adjRows = ids.length
      ? await tx.select().from(expenseAdjustments).where(inArray(expenseAdjustments.expenseId, ids))
      : [];
    const corrections = await correctionsBy(tx, ids);

    const name = (id: string) => {
      const m = ctx.members.find((x) => x.id === id);
      if (!m) return "Former member";
      if (id === ctx.me.id) return "You";
      return m.status === "removed" ? `${m.displayName} (former member)` : m.displayName;
    };
    const sharesBy = new Map<string, money.Share[]>();
    for (const s of shareRows) {
      const list = sharesBy.get(s.expenseId) ?? [];
      list.push({ memberId: s.memberId, shareMinor: s.shareMinor });
      sharesBy.set(s.expenseId, list);
    }
    const payersBy = new Map<string, money.PayerPart[]>();
    for (const p of payerRows) {
      const list = payersBy.get(p.expenseId) ?? [];
      list.push({ memberId: p.memberId, paidMinor: p.paidMinor });
      payersBy.set(p.expenseId, list);
    }
    const ledger: money.LedgerExpense[] = rows.map((r) => ({
      id: r.id,
      currency: r.currency,
      totalMinor: r.totalMinor,
      payerId: r.paidByMemberId,
      ...(payersBy.get(r.id) ? { payers: payersBy.get(r.id)! } : {}),
      ...(r.personalMemberId ? { personal: true } : {}),
      shares: (sharesBy.get(r.id) ?? []).sort((a, b) => money.compareIds(a.memberId, b.memberId)),
    }));

    // Same ledger the removal flow uses (membership.ts, FR-9), here under the caller's RLS.
    const balances = await tripBalances(tx, tripId);

    let mineRaw: money.SettleUpLine[] = [];
    let transfers: Transfer[] = [];
    if (ctx.size !== "solo") {
      const other = ctx.members.find((m) => m.status === "active" && m.id !== ctx.me.id);
      if (ctx.size === "duo" && other) {
        try {
          mineRaw = money.duoSettleUp(balances, ctx.me.id, other.id);
        } catch (e) {
          if (!(e instanceof money.MoneyError)) throw e;
          mineRaw = money.settleUpFor(balances, ctx.me.id); // a former member still holds a balance
        }
      } else {
        mineRaw = money.settleUpFor(balances, ctx.me.id);
      }
      const all = money.simplifyAll(balances);
      transfers = Object.values(all)
        .flat()
        .map((t) => ({
          currency: t.currency,
          fromId: t.fromMemberId,
          fromName: name(t.fromMemberId),
          toId: t.toMemberId,
          toName: name(t.toMemberId),
          amountMinor: t.amountMinor,
        }));
    }

    // Reports (FR-65/66): group spending without personal-only expenses, corrections applied (Q21).
    const report = rows.flatMap((r, i) =>
      r.personalMemberId
        ? []
        : [
            money.correctedForReport(
              { currency: r.currency, totalMinor: r.totalMinor, category: r.category, shares: ledger[i]!.shares },
              corrections.get(r.id) ?? [],
            ),
          ],
    );
    const personalSpend: Record<string, number> = {};
    for (const r of rows) {
      if (r.personalMemberId !== ctx.me.id) continue;
      personalSpend[r.currency] = money.sumMinor([personalSpend[r.currency] ?? 0, r.totalMinor]);
    }
    const currencies = [...new Set(rows.map((r) => r.currency))].sort();

    const itemsOf = (id: string) => itemRows.filter((it) => it.expenseId === id);
    const list: ExpenseListItem[] = rows.map((r, i) => {
      const items = itemsOf(r.id);
      const pending = r.lockedAt ? 0 : items.filter((it) => !claimed.has(it.id) && !it.absorbed && it.amountMinor !== 0).length;
      const unreadable =
        r.splitMethod === "itemized" &&
        !money.validateReceipt({
          totalMinor: r.totalMinor,
          currency: r.currency,
          items: items.map((it) => ({ amountMinor: it.amountMinor, label: it.label })),
          charges: configOf(r).charges ?? [],
        }).balanced;
      return {
        id: r.id,
        merchant: r.merchant,
        spentOn: r.spentOn,
        createdAt: r.createdAt,
        currency: r.currency,
        totalMinor: r.totalMinor,
        category: r.category,
        method: r.splitMethod,
        payerId: r.paidByMemberId,
        payerName: name(r.paidByMemberId),
        payerCount: payersBy.get(r.id)?.length ?? 1,
        myShareMinor: ledger[i]!.shares.find((s) => s.memberId === ctx.me.id)?.shareMinor ?? 0,
        locked: !!r.lockedAt,
        isRefund: !!r.refundOfExpenseId,
        personal: !!r.personalMemberId,
        pendingClaims: pending,
        needsMyAttention: pending > 0 && r.uploadedByMemberId === ctx.me.id,
        unreadable,
        hasReceipt: !!r.receiptPath,
      };
    });

    // MT1: money changes that affect me (expenses, corrections, payments; edits added below).
    const events: money.MoneyEvent[] = [];
    rows.forEach((r, i) => {
      events.push({
        kind: "expense",
        expenseId: r.id,
        atMs: r.createdAt.getTime(),
        merchant: r.merchant,
        currency: r.currency,
        totalMinor: r.totalMinor,
        payerId: r.paidByMemberId,
        ...(ledger[i]!.payers ? { payers: ledger[i]!.payers } : {}),
        shares: ledger[i]!.shares,
        isRefund: !!r.refundOfExpenseId,
        personal: !!r.personalMemberId,
        actorId: r.uploadedByMemberId,
      });
    });
    const byCorrection = new Map<string, typeof adjRows>();
    for (const a of adjRows) {
      const k = `${a.expenseId}|${a.createdAt.getTime()}|${a.createdByMemberId}|${a.reason}`;
      byCorrection.set(k, [...(byCorrection.get(k) ?? []), a]);
    }
    for (const group of byCorrection.values()) {
      const a = group[0]!;
      const r = rows.find((x) => x.id === a.expenseId);
      if (!r) continue;
      events.push({
        kind: "correction",
        expenseId: a.expenseId,
        atMs: a.createdAt.getTime(),
        merchant: r.merchant,
        currency: r.currency,
        entries: group.map((g) => ({ memberId: g.memberId, deltaMinor: g.deltaMinor })),
        reason: a.reason.startsWith("member_removed:") ? "Balance settled when someone left" : a.reason,
        actorId: a.createdByMemberId,
      });
    }
    for (const p of payRows) {
      events.push({
        kind: "payment",
        paymentId: p.id,
        atMs: p.createdAt.getTime(),
        fromMemberId: p.fromMemberId,
        toMemberId: p.toMemberId,
        currency: p.currency,
        amountMinor: p.amountMinor,
        actorId: p.recordedByMemberId,
      });
    }

    // Organizer flags: Q16 unclaimed items on the uploader, Q24 line-item duplicates.
    const organizer: MoneyOverview["organizer"] = { unclaimed: [], duplicates: [] };
    if (ctx.isOrganizer) {
      for (const e of list) {
        if (e.pendingClaims > 0 && !e.personal) {
          const r = rows.find((x) => x.id === e.id)!;
          organizer.unclaimed.push({ expenseId: e.id, merchant: e.merchant, uploaderName: name(r.uploadedByMemberId), count: e.pendingClaims });
        }
      }
      const receipts = rows
        .filter((r) => !r.refundOfExpenseId && !r.personalMemberId && itemsOf(r.id).length > 0)
        .map((r) => ({
          id: r.id,
          currency: r.currency,
          occurredAtMs: dateMs(r.spentOn, r.createdAt),
          items: itemsOf(r.id).map((it) => ({ label: it.label, amountMinor: it.amountMinor })),
        }));
      const pairs = money.findSimilarReceiptPairs(receipts);
      if (pairs.length) {
        const reviewed = await tx
          .select({ a: expenseDuplicateReviews.expenseId, b: expenseDuplicateReviews.otherExpenseId })
          .from(expenseDuplicateReviews)
          .where(eq(expenseDuplicateReviews.tripId, tripId));
        const done = new Set(reviewed.map((x) => `${x.a}|${x.b}`));
        const view = (id: string) => {
          const r = rows.find((x) => x.id === id)!;
          return {
            id,
            merchant: r.merchant,
            totalMinor: r.totalMinor,
            currency: r.currency,
            spentOn: r.spentOn,
            uploadedBy: name(r.uploadedByMemberId),
            locked: !!r.lockedAt,
          };
        };
        for (const p of pairs) {
          if (done.has(`${p.a}|${p.b}`)) continue;
          organizer.duplicates.push({ a: view(p.a), b: view(p.b), labelPermille: p.similarity.labelPermille, amountPermille: p.similarity.amountPermille });
        }
      }
    }

    return {
      ctx,
      events,
      name,
      visibleIds: ids,
      sharesBy,
      overview: {
        tripId,
        size: ctx.size,
        me: { memberId: ctx.me.id, isOrganizer: ctx.isOrganizer, displayName: ctx.me.displayName },
        members: ctx.members
          .filter((m) => m.status === "active" || m.status === "not_attending" || m.status === "removed")
          .map((m) => ({ id: m.id, displayName: m.displayName, status: m.status, isGuestOfHonor: m.isGuestOfHonor })),
        expenses: list,
        balances,
        mine: mineRaw.map((l) => ({ ...l, otherName: name(l.otherMemberId) })),
        transfers,
        categories: money.categoryTotals(report),
        spend: money.spendPerPerson(report),
        personalSpend,
        currencies,
        payments: payRows.map((p) => ({
          id: p.id,
          fromName: name(p.fromMemberId),
          toName: name(p.toMemberId),
          currency: p.currency,
          amountMinor: p.amountMinor,
          createdAt: p.createdAt,
          note: p.note,
        })),
        budgetCheckIn: ctx.trip.budgetCheckIn,
        activity: [] as ActivityView[],
        organizer,
      } satisfies MoneyOverview,
    };
  });

  // MT1 edits: the audit trail is organizer-only under RLS, so read just the edit times of
  // expenses the caller can already see (ids from the RLS read above) as the service.
  const editRows = o.visibleIds.length
    ? await asService(db, (tx) =>
        tx
          .select({ entityId: auditLog.entityId, actor: auditLog.actorMemberId, at: auditLog.createdAt })
          .from(auditLog)
          .where(
            and(eq(auditLog.tripId, tripId), eq(auditLog.entity, "expense"), eq(auditLog.action, "update"), inArray(auditLog.entityId, o.visibleIds)),
          )
          .orderBy(desc(auditLog.createdAt))
          .limit(100),
      )
    : [];
  const rowsById = new Map(o.overview.expenses.map((e) => [e.id, e]));
  for (const ed of editRows) {
    const e = ed.entityId ? rowsById.get(ed.entityId) : undefined;
    if (!e || !ed.actor || e.personal) continue;
    o.events.push({
      kind: "edit",
      expenseId: e.id,
      atMs: ed.at.getTime(),
      merchant: e.merchant,
      currency: e.currency,
      shares: o.sharesBy.get(e.id) ?? [],
      actorId: ed.actor,
    });
  }
  o.overview.activity = money.moneyActivityFor(o.ctx.me.id, o.events, 15).map((a) => ({
    key: a.key,
    kind: a.kind,
    at: new Date(a.atMs),
    currency: a.currency,
    expenseId: a.expenseId,
    merchant: a.merchant,
    actorName: o.name(a.actorId),
    otherName: a.otherMemberId ? o.name(a.otherMemberId) : null,
    effectMinor: a.effectMinor,
    myShareMinor: a.myShareMinor,
    reason: a.reason,
  }));
  return o.overview;
}

/** Q24: an organizer resolves a flagged pair: keep both (recorded), or delete one (soft delete, unlocked only). */
export async function resolveDuplicatePair(
  db: Db,
  claims: Claims,
  input: { tripId: string; expenseId: string; otherExpenseId: string; resolution: "keep_both" | "delete_first" | "delete_second" },
): Promise<void> {
  const [a, b] = [input.expenseId, input.otherExpenseId].sort(money.compareIds) as [string, string];
  if (a === b) throw new ExpenseError("invalid");
  if (input.resolution === "keep_both") {
    await withSession(db, claims, async (tx) => {
      const ctx = await loadCtx(tx, claims, input.tripId);
      if (!ctx.isOrganizer) throw new ExpenseError("forbidden", "Only organizers resolve duplicates.");
      await loadExpense(tx, ctx, a);
      await loadExpense(tx, ctx, b);
      await tx.insert(expenseDuplicateReviews).values({ tripId: ctx.tripId, expenseId: a, otherExpenseId: b, decision: "keep_both" });
    });
    return;
  }
  const target = input.resolution === "delete_first" ? input.expenseId : input.otherExpenseId;
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    if (!ctx.isOrganizer) throw new ExpenseError("forbidden", "Only organizers resolve duplicates.");
  });
  await deleteExpense(db, claims, input.tripId, target);
}
/** P2: the Money section appears once the caller can see at least one expense. */
export async function hasExpenses(db: Db, claims: Claims, tripId: string): Promise<boolean> {
  if (!claims.sub) return false;
  return withSession(db, claims, async (tx) => {
    const r = await tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.tripId, tripId)).limit(1);
    return r.length > 0;
  });
}

export interface ExpenseDetail {
  id: string;
  tripId: string;
  merchant: string;
  spentOn: string | null;
  createdAt: Date;
  currency: string;
  totalMinor: number;
  category: ExpenseCategory;
  method: SplitMethod;
  payerId: string;
  /** Q23a: part-payers (empty = `payerId` paid it all). */
  payers: { memberId: string; name: string; paidMinor: number }[];
  uploaderId: string;
  stopId: string | null;
  ideaId: string | null;
  ideaTitle: string | null;
  locked: boolean;
  deleted: boolean;
  /** Q23c: tracked for the caller only. */
  personal: boolean;
  refundOf: { id: string; merchant: string } | null;
  refunds: { id: string; totalMinor: number; createdAt: Date }[];
  refundableMinor: number;
  canManage: boolean;
  receiptUploadId: string | null;
  participants: string[];
  shares: { memberId: string; name: string; shareMinor: number; guestOfHonor: boolean }[];
  items: {
    id: string;
    label: string;
    amountMinor: number;
    quantity: number;
    absorbed: boolean;
    claims: { memberId: string; name: string; weight: number }[];
  }[];
  charges: money.ReceiptCharge[];
  validation: money.ReceiptValidation | null;
  adjustments: { memberId: string; name: string; deltaMinor: number; reason: string; createdAt: Date }[];
  /** Q21: the latest corrected total of a settled expense (null if never corrected). */
  correctedTotalMinor: number | null;
  members: { id: string; displayName: string; status: string; isGuestOfHonor: boolean; managedByMe: boolean }[];
  me: { memberId: string; isOrganizer: boolean };
  size: TripSize;
  /** Q18: leftover pennies from the split and who took them (null = divided exactly). */
  rounding: { leftoverMinor: number; name: string | null } | null;
  /** Q16: unclaimed items currently on the uploader. */
  unclaimedOnUploader: { count: number; uploaderName: string } | null;
  /** Q17: lines vs total gap the payer(s) cover; null when the receipt adds up. */
  gap: { amountMinor: number; coveredBy: string } | null;
  /** Q19: a guest of honor has items on this receipt: show the choice. */
  guestOfHonorItems: { names: string[]; policy: money.GuestOfHonorItemPolicy; fallbackItems: number } | null;
  /** Q23b: who covers whom. */
  coveredBy: { memberId: string; name: string; coveredById: string; coveredByName: string }[];
}

export async function getExpenseDetail(db: Db, claims: Claims, tripId: string, expenseId: string): Promise<ExpenseDetail | null> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    const [e] = await tx.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)));
    if (!e) return null;
    const name = (id: string) => (id === ctx.me.id ? "You" : (ctx.members.find((m) => m.id === id)?.displayName ?? "Former member"));
    const items = await loadItems(tx, e.id);
    const shares = await sharesOf(tx, e.id);
    const payers = await loadPayers(tx, e.id);
    const adj = await tx
      .select()
      .from(expenseAdjustments)
      .where(eq(expenseAdjustments.expenseId, e.id))
      .orderBy(asc(expenseAdjustments.createdAt));
    const refunds = await tx
      .select({ id: expenses.id, totalMinor: expenses.totalMinor, createdAt: expenses.createdAt })
      .from(expenses)
      .where(and(eq(expenses.refundOfExpenseId, e.id), isNull(expenses.deletedAt)));
    const [orig] = e.refundOfExpenseId
      ? await tx.select({ id: expenses.id, merchant: expenses.merchant }).from(expenses).where(eq(expenses.id, e.refundOfExpenseId))
      : [];
    const [idea] = e.ideaId ? await tx.select({ title: ideas.title }).from(ideas).where(eq(ideas.id, e.ideaId)) : [];
    // MT3: the photo shows for everyone who can see the expense (RLS on receipt_uploads).
    const [upload] = await tx
      .select({ id: receiptUploads.id })
      .from(receiptUploads)
      .where(eq(receiptUploads.expenseId, e.id));
    const cfg = configOf(e);
    const goh = new Set(gohIds(ctx));
    const validation =
      e.splitMethod === "itemized"
        ? money.validateReceipt({
            totalMinor: e.totalMinor,
            currency: e.currency,
            items: items.map((i) => ({ amountMinor: i.amountMinor, label: i.label })),
            charges: cfg.charges ?? [],
          })
        : null;
    const state = await currentState(tx, e, await ledgerOf(tx, e));

    // Q16–Q19 flags come from the same deterministic split the shares were stored from.
    let split: ComputedSplit | null = null;
    if (!e.refundOfExpenseId) {
      try {
        split = computeSplit({
          id: e.id,
          method: e.splitMethod,
          currency: e.currency,
          totalMinor: e.totalMinor,
          payerId: e.paidByMemberId,
          payers,
          uploaderId: e.uploadedByMemberId,
          config: cfg,
          items,
          guestOfHonorIds: [...goh],
        });
      } catch {
        split = null; // e.g. settled under different guest-of-honor flags (MT4)
      }
    }
    const gohWithItems = [...new Set(items.flatMap((i) => i.claims.map((c) => c.memberId)).filter((m) => goh.has(m)))];
    const unclaimed = items.filter((i) => i.claims.length === 0 && !i.absorbed && i.amountMinor !== 0).length;
    const gapPolicy = cfg.difference ?? payerCoversGap(e.paidByMemberId, payers);
    const gapBy =
      typeof gapPolicy === "object" && "assignTo" in gapPolicy
        ? name(gapPolicy.assignTo)
        : typeof gapPolicy === "object" && "proportionalTo" in gapPolicy
          ? "the payers"
          : "everyone";

    return {
      id: e.id,
      tripId,
      merchant: e.merchant,
      spentOn: e.spentOn,
      createdAt: e.createdAt,
      currency: e.currency,
      totalMinor: e.totalMinor,
      category: e.category,
      method: e.splitMethod,
      payerId: e.paidByMemberId,
      payers: (payers ?? []).map((p) => ({ ...p, name: name(p.memberId) })),
      uploaderId: e.uploadedByMemberId,
      stopId: e.stopId,
      ideaId: e.ideaId,
      ideaTitle: idea?.title ?? null,
      locked: !!e.lockedAt,
      deleted: !!e.deletedAt,
      personal: !!e.personalMemberId,
      refundOf: orig ?? null,
      refunds,
      refundableMinor:
        e.refundOfExpenseId || e.personalMemberId || state.totalMinor <= 0
          ? 0
          : money.refundableRemaining(state.totalMinor, refunds.map((r) => r.totalMinor)),
      canManage: canManage(ctx, e),
      receiptUploadId: upload?.id ?? null,
      participants: cfg.participants ?? shares.map((s) => s.memberId),
      shares: shares.map((s) => ({ ...s, name: name(s.memberId), guestOfHonor: goh.has(s.memberId) })),
      items: items.map((i) => ({
        id: i.id,
        label: i.label,
        amountMinor: i.amountMinor,
        quantity: i.quantity,
        absorbed: i.absorbed,
        claims: i.claims.map((c) => ({ ...c, name: name(c.memberId) })),
      })),
      charges: cfg.charges ?? [],
      validation,
      adjustments: adj.map((a) => ({
        memberId: a.memberId,
        name: name(a.memberId),
        deltaMinor: a.deltaMinor,
        reason: a.reason,
        createdAt: a.createdAt,
      })),
      correctedTotalMinor: e.lockedAt && state.totalMinor !== e.totalMinor ? state.totalMinor : null,
      members: ctx.members
        .filter((m) => m.status === "active" || m.status === "not_attending" || m.status === "removed")
        .map((m) => ({
          id: m.id,
          displayName: m.id === ctx.me.id ? "You" : m.displayName,
          status: m.status,
          isGuestOfHonor: m.isGuestOfHonor,
          managedByMe: m.managedByMemberId === ctx.me.id,
        })),
      me: { memberId: ctx.me.id, isOrganizer: ctx.isOrganizer },
      size: ctx.size,
      rounding:
        split && split.rounding.leftoverMinor > 0
          ? { leftoverMinor: split.rounding.leftoverMinor, name: split.rounding.memberId ? name(split.rounding.memberId) : null }
          : null,
      unclaimedOnUploader: unclaimed && !e.lockedAt ? { count: unclaimed, uploaderName: name(e.uploadedByMemberId) } : null,
      gap: validation && !validation.balanced ? { amountMinor: validation.discrepancyMinor, coveredBy: gapBy } : null,
      guestOfHonorItems:
        e.splitMethod === "itemized" && gohWithItems.length
          ? { names: gohWithItems.map(name), policy: cfg.gohPolicy ?? "sharers", fallbackItems: split?.gohFallbackItemIds.length ?? 0 }
          : null,
      coveredBy: (cfg.coveredBy ?? []).map((c) => ({
        memberId: c.memberId,
        name: name(c.memberId),
        coveredById: c.coveredBy,
        coveredByName: name(c.coveredBy),
      })),
    };
  });
}

/** Everything the "add expense" form needs: people, Stops, attendance, ideas, a currency default. */
export interface ExpenseFormContext {
  size: TripSize;
  me: { memberId: string };
  members: { id: string; displayName: string; isGuestOfHonor: boolean }[];
  stops: { id: string; name: string; isDefault: boolean; attending: string[] }[];
  ideas: { id: string; title: string; stopId: string | null }[];
  defaultCurrency: string;
  everyone: string[];
}

export async function getExpenseFormContext(db: Db, claims: Claims, tripId: string): Promise<ExpenseFormContext> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    const stopRows = await tx.select().from(stops).where(eq(stops.tripId, tripId)).orderBy(asc(stops.position));
    const stopList = [];
    for (const s of stopRows) stopList.push({ id: s.id, name: s.name, isDefault: s.isDefault, attending: await attendingIds(tx, ctx, s.id) });
    const ideaRows = await tx
      .select({ id: ideas.id, title: ideas.title, stopId: ideas.stopId, status: ideas.status })
      .from(ideas)
      .where(eq(ideas.tripId, tripId))
      .orderBy(asc(ideas.title));
    const [last] = await tx
      .select({ currency: expenses.currency })
      .from(expenses)
      .where(eq(expenses.tripId, tripId))
      .orderBy(desc(expenses.createdAt))
      .limit(1);
    return {
      size: ctx.size,
      me: { memberId: ctx.me.id },
      members: ctx.members
        .filter((m) => m.status === "active")
        .map((m) => ({ id: m.id, displayName: m.id === ctx.me.id ? "You" : m.displayName, isGuestOfHonor: m.isGuestOfHonor })),
      stops: stopList,
      ideas: ideaRows.filter((i) => i.status !== "dropped").map(({ id, title, stopId }) => ({ id, title, stopId })),
      defaultCurrency: last?.currency ?? "USD",
      everyone: activeIds(ctx),
    };
  });
}

// ---------------------------------------------------------------------------
// Budget check-in (FR-74, FR-T9, D11, D58)
// ---------------------------------------------------------------------------

export interface BudgetState {
  enabled: boolean;
  size: TripSize;
  isOrganizer: boolean;
  rows: BudgetRow[];
}

export async function getBudget(db: Db, claims: Claims, tripId: string): Promise<BudgetState> {
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    return {
      enabled: ctx.trip.budgetCheckIn,
      size: ctx.size,
      isOrganizer: ctx.isOrganizer,
      rows: ctx.trip.budgetCheckIn ? await budgetView(tx, tripId) : [],
    };
  });
}

/** D11: optional; the organizer switches it on (in duo trips the owner, FR-T9 / D57). */
export async function setBudgetCheckIn(db: Db, claims: Claims, tripId: string, on: boolean): Promise<void> {
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    if (!ctx.isOrganizer) throw new ExpenseError("forbidden", "Only organizers can turn this on.");
    await tx.update(trips).set({ budgetCheckIn: on }).where(eq(trips.id, tripId));
  });
}

/** Each member enters a private range (FR-74). The DB decides who may see it (open_to). */
export async function saveBudgetAnswer(
  db: Db,
  claims: Claims,
  input: { tripId: string; currency: string; minMinor: number; maxMinor: number },
): Promise<void> {
  money.assertCurrency(input.currency);
  money.assertMinor(input.minMinor);
  money.assertMinor(input.maxMinor);
  if (input.minMinor < 0 || input.maxMinor < input.minMinor) throw new ExpenseError("invalid", "The top of the range must be at least the bottom.");
  await withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, input.tripId);
    if (ctx.me.status !== "active") throw new ExpenseError("forbidden");
    await tx
      .insert(budgetAnswers)
      .values({ memberId: ctx.me.id, tripId: ctx.tripId, currency: input.currency, minMinor: input.minMinor, maxMinor: input.maxMinor })
      .onConflictDoUpdate({
        target: budgetAnswers.memberId,
        set: { currency: input.currency, minMinor: input.minMinor, maxMinor: input.maxMinor },
      });
  });
}

// ---------------------------------------------------------------------------
// CSV export (FR-126)
// ---------------------------------------------------------------------------

/** Spreadsheet formula injection guard: text cells starting with = + - @ get a leading quote. */
function csvText(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Expenses, refunds, adjustments and payments as CSV. Amounts are exact decimals in each row's currency. */
export async function exportExpensesCsv(db: Db, claims: Claims, tripId: string): Promise<{ filename: string; csv: string }> {
  const o = await getMoneyOverview(db, claims, tripId);
  return withSession(db, claims, async (tx) => {
    const ctx = await loadCtx(tx, claims, tripId);
    const people = ctx.members.filter((m) => m.status === "active" || m.status === "not_attending" || m.status === "removed");
    const ids = o.expenses.map((e) => e.id);
    const shareRows = ids.length ? await tx.select().from(expenseShares).where(inArray(expenseShares.expenseId, ids)) : [];
    const adjRows = await tx.select().from(expenseAdjustments).where(eq(expenseAdjustments.tripId, tripId));
    const payRows = await tx.select().from(payments).where(eq(payments.tripId, tripId)).orderBy(asc(payments.createdAt));
    const header = ["type", "date", "description", "category", "currency", "amount", "paid_by", "split", ...people.map((p) => `share:${p.displayName}`)];
    const lines = [header.map(csvText).join(",")];
    const dec = (n: number, c: string) => money.minorToDecimalString(n, c);
    for (const e of [...o.expenses].reverse()) {
      const shares = shareRows.filter((s) => s.expenseId === e.id);
      lines.push(
        [
          csvText(e.isRefund ? "refund" : "expense"),
          e.spentOn ?? e.createdAt.toISOString().slice(0, 10),
          csvText(e.merchant),
          csvText(CATEGORY_LABEL[e.category]),
          e.currency,
          dec(e.totalMinor, e.currency),
          csvText(people.find((p) => p.id === e.payerId)?.displayName ?? "Former member"),
          e.method,
          ...people.map((p) => {
            const s = shares.find((x) => x.memberId === p.id);
            return s ? dec(s.shareMinor, e.currency) : "";
          }),
        ].join(","),
      );
    }
    const expById = new Map(o.expenses.map((e) => [e.id, e]));
    for (const a of adjRows) {
      const e = expById.get(a.expenseId);
      if (!e) continue;
      lines.push(
        [
          "adjustment",
          a.createdAt.toISOString().slice(0, 10),
          csvText(`${e.merchant}: ${a.reason}`),
          csvText(CATEGORY_LABEL[e.category]),
          e.currency,
          "",
          "",
          "",
          ...people.map((p) => (p.id === a.memberId ? dec(-a.deltaMinor, e.currency) : "")),
        ].join(","),
      );
    }
    for (const p of payRows) {
      const from = people.find((x) => x.id === p.fromMemberId)?.displayName ?? "Former member";
      const to = people.find((x) => x.id === p.toMemberId)?.displayName ?? "Former member";
      lines.push(
        [
          "payment",
          p.createdAt.toISOString().slice(0, 10),
          csvText(`${from} paid ${to}`),
          "",
          p.currency,
          dec(p.amountMinor, p.currency),
          csvText(from),
          "",
          ...people.map(() => ""),
        ].join(","),
      );
    }
    const slug = ctx.trip.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "trip";
    return { filename: `${slug}-expenses.csv`, csv: `${lines.join("\r\n")}\r\n` };
  });
}
