import { allocateBigDetailed, compareIds } from "./allocate";
import { assertCurrency, assertMinor, toSafeNumber, type CurrencyCode } from "./currency";
import { MoneyError } from "./errors";
import { allocOptions, normalizeMemberIds, roundingOf, splitByWeights, splitEven, type Rounding } from "./split";
import type { MemberId, Share, Split } from "./types";

/**
 * Itemized receipt splitting and validation (FR-61, FR-62, FR-90, E-1..E-7, E-21).
 */

/**
 * Extra lines on a receipt. All are signed contributions to the receipt total:
 * tax / tip / service_charge / fee are >= 0, discount is <= 0 (enter "-5.00").
 */
export type ChargeKind = "tax" | "tip" | "service_charge" | "fee" | "discount";

export interface ReceiptCharge {
  kind: ChargeKind;
  amountMinor: number;
  label?: string;
  /**
   * Tax already included in the item prices (VAT-inclusive receipts, E-4). Shown
   * for information only; NOT added to the total again.
   */
  includedInItems?: boolean;
}

export interface ItemClaim {
  memberId: MemberId;
  /**
   * Relative weight when an item is shared unevenly, a positive integer. Default 1
   * (claimants share equally, E-2). Use units for quantity claims, e.g. "2 of 3
   * margaritas" = weight 2 (E-3).
   */
  weight?: number;
}

export interface ReceiptItem {
  id: string;
  label?: string;
  /** Line amount in minor units. Negative for a line-level discount (E-5); claim it like the item it discounts. */
  amountMinor: number;
  claims: readonly ItemClaim[];
  /** The payer covers this unclaimed item (FR-62 "absorb"). Ignored if the item has claims. */
  absorbed?: boolean;
}

export type ReceiptWarningCode =
  /** A service charge / auto-gratuity line AND a written tip: probably tipped twice (E-4, E-7). */
  | "DOUBLE_GRATUITY"
  /** A service charge / auto-gratuity is on the receipt: show "Tip already included" (E-4). */
  | "GRATUITY_INCLUDED"
  /** Items + charges do not add up to the receipt total (FR-61, E-6). */
  | "DISCREPANCY";

export interface ReceiptWarning {
  code: ReceiptWarningCode;
  message: string;
  amountMinor?: number;
}

export interface ReceiptValidationInput {
  totalMinor: number;
  currency: CurrencyCode;
  items: readonly Pick<ReceiptItem, "amountMinor" | "label">[];
  charges?: readonly ReceiptCharge[];
}

export interface ReceiptValidation {
  itemsMinor: number;
  /** Sum of charges that add to the total (excludes `includedInItems` tax). */
  chargesMinor: number;
  /** items + charges. */
  computedTotalMinor: number;
  /** totalMinor - computedTotalMinor. Positive = the receipt total is higher than its lines ("Unassigned difference", E-6). */
  discrepancyMinor: number;
  balanced: boolean;
  warnings: ReceiptWarning[];
}

const GRATUITY_RE =
  /(gratuit|service\s*(charge|chg|fee)|auto[\s-]*grat|servizio|coperto e servizio|service compris|pourboire|propina|trinkgeld|bedienung|服务费|サービス料|봉사료)/i;

/** True if a receipt line label looks like an automatic gratuity or service charge. */
export function looksLikeGratuity(label: string | undefined): boolean {
  return label !== undefined && GRATUITY_RE.test(label);
}

/**
 * Checks that line items + tax + tip + service charges + fees + discounts add up
 * to the receipt total (FR-61) and flags probable double gratuity (E-4/6/7).
 * The receipt total (what was actually paid) is always the source of truth; this
 * never "fixes" it.
 */
export function validateReceipt(input: ReceiptValidationInput): ReceiptValidation {
  assertCurrency(input.currency);
  assertMinor(input.totalMinor, "totalMinor");
  let items = 0n;
  let gratuityLine = false;
  for (const it of input.items) {
    assertMinor(it.amountMinor, "item amountMinor");
    items += BigInt(it.amountMinor);
    if (looksLikeGratuity(it.label) && it.amountMinor > 0) gratuityLine = true;
  }
  let charges = 0n;
  let tip = 0n;
  for (const c of input.charges ?? []) {
    assertCharge(c);
    if (c.includedInItems) continue;
    charges += BigInt(c.amountMinor);
    if (c.kind === "tip") tip += BigInt(c.amountMinor);
    if (c.amountMinor > 0 && (c.kind === "service_charge" || (c.kind !== "tip" && looksLikeGratuity(c.label)))) {
      gratuityLine = true;
    }
  }
  const computed = items + charges;
  const discrepancy = BigInt(input.totalMinor) - computed;
  const warnings: ReceiptWarning[] = [];
  if (gratuityLine && tip > 0n) {
    warnings.push({
      code: "DOUBLE_GRATUITY",
      message: "This receipt already has a service charge or gratuity, and a tip was added on top. Tipped twice?",
      amountMinor: toSafeNumber(tip),
    });
  } else if (gratuityLine) {
    warnings.push({ code: "GRATUITY_INCLUDED", message: "Tip already included" });
  }
  if (discrepancy !== 0n) {
    warnings.push({
      code: "DISCREPANCY",
      message: "Items, tax and tip don't add up to the total",
      amountMinor: toSafeNumber(discrepancy),
    });
  }
  return {
    itemsMinor: toSafeNumber(items),
    chargesMinor: toSafeNumber(charges),
    computedTotalMinor: toSafeNumber(computed),
    discrepancyMinor: toSafeNumber(discrepancy),
    balanced: discrepancy === 0n,
    warnings,
  };
}

function assertCharge(c: ReceiptCharge): void {
  assertMinor(c.amountMinor, `${c.kind} amountMinor`);
  if (c.kind === "discount" ? c.amountMinor > 0 : c.amountMinor < 0) {
    throw new MoneyError(
      "INVALID_AMOUNT",
      c.kind === "discount" ? "Discounts must be entered as negative amounts" : `${c.kind} cannot be negative`,
      { kind: c.kind, amountMinor: c.amountMinor },
    );
  }
}

/** How to handle items nobody claimed (FR-62, E-1 / DN-17). */
export type UnclaimedPolicy =
  /** Refuse to split until every item is claimed or marked absorbed (default). */
  | "error"
  /** The payer covers every unclaimed item (FR-62 "absorb"). */
  | "absorb"
  /**
   * One person carries every unclaimed item until someone claims it. Q16 (founder decision):
   * the app passes the UPLOADER here and flags the items for the organizer.
   */
  | { assignTo: MemberId }
  /** Split unclaimed items evenly among these people. */
  | { splitEvenlyAmong: readonly MemberId[] };

/** How to handle a gap between the lines and the receipt total (E-6). */
export type DifferencePolicy =
  /** Refuse to split while the receipt doesn't balance (default). */
  | "error"
  /** One person takes the whole difference. Q17: the app passes the payer. */
  | { assignTo: MemberId }
  /** Split the difference evenly among these people. */
  | { splitEvenlyAmong: readonly MemberId[] }
  /** Split the difference by integer weights (Q17 with several payers: in proportion to what each paid). */
  | { proportionalTo: readonly { memberId: MemberId; weight: number }[] };

/**
 * Q19 (founder decision): what happens to a guest of honor's items on an itemized receipt.
 * - "sharers" (default): only the people who shared that item with them pick it up, by
 *   their claim weights. An item only the guest of honor claimed has no sharers; it falls
 *   back to "even" (reported in `gohFallbackItemIds`).
 * - "even": their portion of each item is split evenly among everyone else on the receipt.
 * - "proportional": spread over everyone else in proportion to their own item subtotals.
 */
export type GuestOfHonorItemPolicy = "sharers" | "even" | "proportional";

export interface ItemizedSplitInput {
  totalMinor: number;
  currency: CurrencyCode;
  payerId: MemberId;
  items: readonly ReceiptItem[];
  charges?: readonly ReceiptCharge[];
  /** FR-90: guests of honor pay nothing; their items are covered per `guestOfHonorPolicy` (Q19). */
  guestOfHonorIds?: readonly MemberId[];
  /** Q19. Default "sharers". */
  guestOfHonorPolicy?: GuestOfHonorItemPolicy;
  /**
   * "Everyone else" for the "even" guest-of-honor policy (guests of honor are dropped from it).
   * Default: every non-guest-of-honor claimant on the receipt.
   */
  everyoneElse?: readonly MemberId[];
  unclaimed?: UnclaimedPolicy;
  difference?: DifferencePolicy;
  tieBreakStart?: number;
  /** Q18: who takes every leftover penny, in order of preference (the app passes [uploader, payer]). */
  leftoverTo?: readonly MemberId[];
}

export interface ItemizedBreakdown {
  memberId: MemberId;
  /** This member's portion of the item lines (after guest-of-honor redistribution). */
  itemsMinor: number;
  /** Their proportional slice of tax, tip, service charges, fees and discounts. */
  chargesMinor: number;
  /** Their portion of any assigned/split "unassigned difference" (E-6). */
  differenceMinor: number;
  shareMinor: number;
}

export interface ItemizedSplit extends Split {
  breakdown: ItemizedBreakdown[];
  validation: ReceiptValidation;
  /** Items that had no claims and were covered by the payer, the assignee, or split evenly. */
  unclaimedItemIds: string[];
  excludedGuestOfHonorIds: MemberId[];
  /** Q19: items only a guest of honor claimed, so "sharers" fell back to "even". */
  gohFallbackItemIds: string[];
  /** Q18: leftover pennies from the proportional pass (and the difference split) and who took them. */
  rounding: Rounding;
}

/**
 * Itemized split (FR-62).
 *
 * Method: each member's exact item subtotal is computed as a rational (shared
 * items divided by claim weight, no rounding). The balanced part of the receipt
 * (items + charges) is then allocated across members in ONE largest-remainder
 * pass, weighted by those exact subtotals. That makes tax, tip, service charges,
 * fees and bill-level discounts proportional to each person's item subtotal
 * (FR-62, E-4, E-5) with a single rounding step, so shares sum exactly to the
 * total. Guests of honor are dropped from the weights, which spreads their items
 * (and the charges on them) proportionally over everyone else.
 *
 * Errors: RECEIPT_DISCREPANCY, UNCLAIMED_ITEMS, NEGATIVE_SUBTOTAL,
 * ALL_GUESTS_OF_HONOR, DUPLICATE_MEMBER, INVALID_WEIGHT.
 */
export function splitItemized(input: ItemizedSplitInput): ItemizedSplit {
  assertCurrency(input.currency);
  normalizeMemberIds([input.payerId], "payer");
  const validation = validateReceipt(input);
  const differencePolicy = input.difference ?? "error";
  if (!validation.balanced && differencePolicy === "error") {
    throw new MoneyError(
      "RECEIPT_DISCREPANCY",
      "Items, tax and tip don't add up to the total; assign or split the difference first",
      { discrepancyMinor: validation.discrepancyMinor },
    );
  }
  const goh = new Set(input.guestOfHonorIds ?? []);
  const unclaimedPolicy = input.unclaimed ?? "error";

  // Resolve each item's claimants.
  const resolved: { id: string; amount: bigint; claims: { memberId: MemberId; weight: bigint }[] }[] = [];
  const unclaimedIds: string[] = [];
  const blocking: string[] = [];
  const itemIds = new Set<string>();
  for (const item of input.items) {
    if (itemIds.has(item.id)) {
      throw new MoneyError("DUPLICATE_MEMBER", `Duplicate item id ${item.id}`, { itemId: item.id });
    }
    itemIds.add(item.id);
    let claims: { memberId: MemberId; weight: bigint }[];
    if (item.claims.length > 0) {
      normalizeMemberIds(item.claims.map((c) => c.memberId), `claims on item ${item.id}`);
      claims = item.claims.map((c) => {
        const w = c.weight ?? 1;
        if (!Number.isSafeInteger(w) || w <= 0) {
          throw new MoneyError("INVALID_WEIGHT", "Claim weights must be positive integers", {
            itemId: item.id,
            weight: w,
          });
        }
        return { memberId: c.memberId, weight: BigInt(w) };
      });
    } else if (item.amountMinor === 0) {
      claims = [];
    } else if (item.absorbed || unclaimedPolicy === "absorb") {
      unclaimedIds.push(item.id);
      claims = [{ memberId: input.payerId, weight: 1n }];
    } else if (unclaimedPolicy !== "error" && "assignTo" in unclaimedPolicy) {
      unclaimedIds.push(item.id);
      normalizeMemberIds([unclaimedPolicy.assignTo], "unclaimed assignee");
      claims = [{ memberId: unclaimedPolicy.assignTo, weight: 1n }];
    } else if (unclaimedPolicy !== "error") {
      unclaimedIds.push(item.id);
      const among = normalizeMemberIds(unclaimedPolicy.splitEvenlyAmong, "unclaimed split");
      if (among.length === 0) throw new MoneyError("NO_PARTICIPANTS", "No one to split unclaimed items with");
      claims = among.map((memberId) => ({ memberId, weight: 1n }));
    } else {
      blocking.push(item.id);
      continue;
    }
    resolved.push({ id: item.id, amount: BigInt(item.amountMinor), claims });
  }
  if (blocking.length > 0) {
    throw new MoneyError("UNCLAIMED_ITEMS", "Some items haven't been claimed; assign them or have the payer absorb them", {
      itemIds: blocking,
    });
  }

  // Q19: move guests of honor's item portions to sharers / everyone else before weighting.
  const gohPolicy = input.guestOfHonorPolicy ?? "sharers";
  const gohFallback: string[] = [];
  if (goh.size > 0 && gohPolicy !== "proportional") {
    const poolSrc = input.everyoneElse ?? resolved.flatMap((r) => r.claims.map((c) => c.memberId));
    const pool = [...new Set(poolSrc)].filter((m) => !goh.has(m)).sort(compareIds);
    for (const r of resolved) {
      const gw = r.claims.filter((c) => goh.has(c.memberId)).reduce((a, c) => a + c.weight, 0n);
      if (gw === 0n) continue;
      const others = r.claims.filter((c) => !goh.has(c.memberId));
      if (gohPolicy === "sharers" && others.length > 0) {
        r.claims = others;
        continue;
      }
      if (pool.length === 0) continue; // nobody to spread over: falls through to "proportional"
      if (gohPolicy === "sharers") gohFallback.push(r.id);
      // Even: each of the k people in the pool gets gw/k of the item's weight; scale others by k.
      const k = BigInt(pool.length);
      const m = new Map<MemberId, bigint>();
      for (const c of others) m.set(c.memberId, (m.get(c.memberId) ?? 0n) + c.weight * k);
      for (const e of pool) m.set(e, (m.get(e) ?? 0n) + gw);
      r.claims = [...m.keys()].sort(compareIds).map((memberId) => ({ memberId, weight: m.get(memberId)! }));
    }
  }

  // Exact subtotals scaled by L = lcm of every item's total claim weight.
  let L = 1n;
  for (const r of resolved) {
    const W = r.claims.reduce((a, c) => a + c.weight, 0n);
    if (W > 0n) L = lcm(L, W);
  }
  const scaled = new Map<MemberId, bigint>();
  for (const r of resolved) {
    const W = r.claims.reduce((a, c) => a + c.weight, 0n);
    if (W === 0n) continue;
    for (const c of r.claims) {
      scaled.set(c.memberId, (scaled.get(c.memberId) ?? 0n) + (r.amount * c.weight * L) / W);
    }
  }
  for (const [memberId, v] of scaled) {
    if (v < 0n) {
      throw new MoneyError("NEGATIVE_SUBTOTAL", "A member's claimed items add up to less than zero", { memberId });
    }
  }

  const allMembers = [...scaled.keys()].sort(compareIds);
  const excluded = allMembers.filter((m) => goh.has(m));
  const payers = allMembers.filter((m) => !goh.has(m));
  const payerWeights = payers.map((m) => scaled.get(m)!);
  if (payers.length === 0 || payerWeights.every((w) => w === 0n)) {
    if (allMembers.length > 0 && excluded.length > 0) {
      throw new MoneyError(
        "ALL_GUESTS_OF_HONOR",
        "Only guests of honor claimed items, so there's no one to spread their share across",
      );
    }
  }

  const opts = allocOptions(payers, payerWeights, input);
  const sub = {
    ...(input.tieBreakStart === undefined ? {} : { tieBreakStart: input.tieBreakStart }),
    ...(input.leftoverTo ? { leftoverTo: input.leftoverTo } : {}),
  };
  const balancedPart = BigInt(validation.computedTotalMinor);
  const itemsTotal = BigInt(validation.itemsMinor);
  let baseParts: bigint[] = [];
  let itemParts: bigint[] = [];
  let rounding: Rounding = { leftoverMinor: 0, memberId: null };
  if (payers.length > 0) {
    const base = allocateBigDetailed(balancedPart, payerWeights, opts);
    baseParts = base.parts;
    itemParts = allocateBigDetailed(itemsTotal, payerWeights, opts).parts;
    rounding = roundingOf(base, payers);
  } else if (balancedPart !== 0n) {
    throw new MoneyError("ZERO_TOTAL_WEIGHT", "Nothing was claimed, so charges can't be split proportionally");
  }

  const rows = new Map<MemberId, { items: bigint; charges: bigint; diff: bigint }>();
  payers.forEach((m, i) => {
    rows.set(m, { items: itemParts[i]!, charges: baseParts[i]! - itemParts[i]!, diff: 0n });
  });

  let excludedGoh = excluded;
  if (!validation.balanced && differencePolicy !== "error") {
    const D = validation.discrepancyMinor;
    let diffShares: Share[];
    if ("assignTo" in differencePolicy) {
      normalizeMemberIds([differencePolicy.assignTo], "difference assignee");
      if (goh.has(differencePolicy.assignTo)) {
        throw new MoneyError("ALL_GUESTS_OF_HONOR", "The difference can't be assigned to a guest of honor");
      }
      diffShares = [{ memberId: differencePolicy.assignTo, shareMinor: D }];
    } else if ("proportionalTo" in differencePolicy) {
      const ws = differencePolicy.proportionalTo.filter((w) => !goh.has(w.memberId));
      if (ws.length === 0) throw new MoneyError("ALL_GUESTS_OF_HONOR", "The difference can't go only to guests of honor");
      const sp = splitByWeights({ totalMinor: D, currency: input.currency, weights: ws, ...sub });
      diffShares = sp.shares;
      rounding = mergeRounding(rounding, sp.rounding);
    } else {
      const ev = splitEven({
        totalMinor: D,
        currency: input.currency,
        participantIds: differencePolicy.splitEvenlyAmong,
        guestOfHonorIds: [...goh],
        ...sub,
      });
      diffShares = ev.shares;
      rounding = mergeRounding(rounding, ev.rounding);
      excludedGoh = [...new Set([...excludedGoh, ...ev.excludedGuestOfHonorIds])].sort(compareIds);
    }
    for (const s of diffShares) {
      const row = rows.get(s.memberId) ?? { items: 0n, charges: 0n, diff: 0n };
      row.diff += BigInt(s.shareMinor);
      rows.set(s.memberId, row);
    }
  }

  const breakdown: ItemizedBreakdown[] = [...rows.keys()].sort(compareIds).map((memberId) => {
    const r = rows.get(memberId)!;
    return {
      memberId,
      itemsMinor: toSafeNumber(r.items),
      chargesMinor: toSafeNumber(r.charges),
      differenceMinor: toSafeNumber(r.diff),
      shareMinor: toSafeNumber(r.items + r.charges + r.diff),
    };
  });

  return {
    currency: input.currency,
    totalMinor: input.totalMinor,
    shares: breakdown.map((b) => ({ memberId: b.memberId, shareMinor: b.shareMinor })),
    breakdown,
    validation,
    unclaimedItemIds: unclaimedIds,
    excludedGuestOfHonorIds: excludedGoh,
    gohFallbackItemIds: gohFallback,
    rounding,
  };
}

function mergeRounding(a: Rounding, b: Rounding): Rounding {
  return { leftoverMinor: a.leftoverMinor + b.leftoverMinor, memberId: a.memberId ?? b.memberId };
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b;
}
