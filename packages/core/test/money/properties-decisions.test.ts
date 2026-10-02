/**
 * Property tests for the founder decisions of 2026-10-02: several payers (Q23a), covered-by
 * (Q23b), personal-only (Q23c), leftover pennies to the uploader (Q18), guest-of-honor item
 * policies (Q19), unclaimed → uploader (Q16) and payer-covers-the-gap (Q17).
 * Invariant everywhere: shares sum EXACTLY to the total; balances sum to zero per currency.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocate,
  applyCoveredBy,
  computeBalances,
  scalePayers,
  splitEven,
  splitItemized,
  type GuestOfHonorItemPolicy,
  type LedgerExpense,
  type PayerPart,
} from "../../src/money";

const opts = { numRuns: 300 };
const ids = ["a", "b", "c", "d", "e", "f"] as const;
const membersArb = fc.uniqueArray(fc.constantFrom(...ids), { minLength: 1, maxLength: 6 });
const totalArb = fc.integer({ min: 0, max: 50_000_000 });
const sumBig = (xs: readonly number[]) => xs.reduce((a, b) => a + BigInt(b), 0n);

/** Random payer parts (each >= 1) that sum to `total` exactly. */
function payersArb(total: number) {
  return fc
    .uniqueArray(fc.constantFrom(...ids), { minLength: 1, maxLength: Math.max(1, Math.min(6, total)) })
    .chain((who) =>
      fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: who.length, maxLength: who.length }).map((ws) => {
        const parts = allocate(total, ws);
        return who.map((memberId, i) => ({ memberId, paidMinor: parts[i]! })).filter((p) => p.paidMinor !== 0);
      }),
    );
}

function sumBalances(b: Record<string, Record<string, number>>) {
  return Object.fromEntries(Object.entries(b).map(([c, row]) => [c, sumBig(Object.values(row))]));
}

describe("property: several payers (Q23a)", () => {
  it("each member's balance = what they paid − their share; balances sum to zero", () => {
    fc.assert(
      fc.property(
        totalArb.filter((t) => t > 0),
        membersArb,
        fc.integer({ min: 0, max: 5 }),
        (total, people, tb) => {
          const payers: PayerPart[] = fc.sample(payersArb(total), { numRuns: 1, seed: total })[0]!;
          const split = splitEven({ totalMinor: total, currency: "USD", participantIds: people, tieBreakStart: tb });
          expect(sumBig(split.shares.map((s) => s.shareMinor))).toBe(BigInt(total));
          const e: LedgerExpense = { currency: "USD", totalMinor: total, payerId: payers[0]!.memberId, payers, shares: split.shares };
          const bal = computeBalances({ expenses: [e] });
          expect(sumBalances(bal)).toEqual({ USD: 0n });
          for (const id of ids) {
            const paid = sumBig(payers.filter((p) => p.memberId === id).map((p) => p.paidMinor));
            const share = sumBig(split.shares.filter((s) => s.memberId === id).map((s) => s.shareMinor));
            expect(BigInt(bal.USD?.[id] ?? 0)).toBe(paid - share);
          }
        },
      ),
      opts,
    );
  });

  it("scalePayers always sums to the new total (refunds and corrections)", () => {
    fc.assert(
      fc.property(totalArb.filter((t) => t > 0), fc.integer({ min: -50_000_000, max: 50_000_000 }), fc.constantFrom(...ids), (total, next, lo) => {
        const payers = fc.sample(payersArb(total), { numRuns: 1, seed: next })[0]!;
        const s = scalePayers(payers, next, { leftoverTo: [lo] });
        expect(sumBig(s.map((p) => p.paidMinor))).toBe(BigInt(next));
        for (const p of s) expect(Math.sign(p.paidMinor)).toBe(Math.sign(next));
      }),
      opts,
    );
  });
});

describe("property: covered by (Q23b)", () => {
  it("covers never change the total; shares stay sorted and unique; balances still sum to zero", () => {
    fc.assert(
      fc.property(
        totalArb,
        membersArb,
        fc.array(fc.tuple(fc.constantFrom(...ids), fc.constantFrom(...ids)), { maxLength: 6 }),
        (total, people, pairs) => {
          const split = splitEven({ totalMinor: total, currency: "EUR", participantIds: people });
          // Build an acyclic cover set: only cover "upwards" in id order, one cover per member.
          const seen = new Set<string>();
          const covers = pairs
            .filter(([m, by]) => m < by && !seen.has(m) && (seen.add(m), true))
            .map(([memberId, coveredBy]) => ({ memberId, coveredBy }));
          const r = applyCoveredBy({ currency: split.currency, totalMinor: split.totalMinor, shares: split.shares }, covers);
          expect(sumBig(r.shares.map((s) => s.shareMinor))).toBe(BigInt(total));
          const sorted = [...r.shares].map((s) => s.memberId);
          expect(sorted).toEqual([...new Set(sorted)].sort());
          // Nobody who is covered still holds a non-zero share.
          for (const c of covers) {
            expect(r.shares.find((s) => s.memberId === c.memberId)?.shareMinor ?? 0).toBe(0);
          }
          const bal = computeBalances({ expenses: [{ ...r, payerId: "a" }] });
          if (total > 0) expect(sumBalances(bal)).toEqual({ EUR: 0n });
        },
      ),
      opts,
    );
  });
});

describe("property: personal-only (Q23c)", () => {
  it("adding personal expenses never changes group balances", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(totalArb, membersArb, fc.constantFrom(...ids)), { maxLength: 5 }),
        fc.array(fc.tuple(totalArb, fc.constantFrom(...ids)), { minLength: 1, maxLength: 5 }),
        (shared, personal) => {
          const s: LedgerExpense[] = shared.map(([t, people, payer]) => ({
            currency: "USD",
            totalMinor: t,
            payerId: payer,
            shares: splitEven({ totalMinor: t, currency: "USD", participantIds: people }).shares,
          }));
          const p: LedgerExpense[] = personal.map(([t, who]) => ({
            currency: "USD",
            totalMinor: t,
            payerId: who,
            personal: true,
            shares: [{ memberId: who, shareMinor: t }],
          }));
          expect(computeBalances({ expenses: [...s, ...p] })).toEqual(computeBalances({ expenses: s }));
        },
      ),
      opts,
    );
  });
});

describe("property: leftover pennies to the uploader (Q18)", () => {
  it("only the chosen member gets more than the floor; sum is exact", () => {
    fc.assert(
      fc.property(totalArb, membersArb, fc.constantFrom(...ids), (total, people, uploader) => {
        const s = splitEven({ totalMinor: total, currency: "USD", participantIds: people, leftoverTo: [uploader] });
        expect(sumBig(s.shares.map((x) => x.shareMinor))).toBe(BigInt(total));
        const floor = Math.floor(total / people.length);
        for (const x of s.shares) {
          if (people.includes(uploader) && x.memberId !== uploader) expect(x.shareMinor).toBe(floor);
        }
        expect(s.rounding.leftoverMinor).toBe(total % people.length);
        if (s.rounding.leftoverMinor > 0 && people.includes(uploader)) expect(s.rounding.memberId).toBe(uploader);
      }),
      opts,
    );
  });
});

describe("property: itemized with the new policies (Q16, Q17, Q19)", () => {
  const itemArb = fc.record({
    amount: fc.integer({ min: 0, max: 200_000 }),
    claimers: fc.uniqueArray(fc.constantFrom(...ids, "goh"), { maxLength: 4 }),
    weight: fc.integer({ min: 1, max: 3 }),
  });
  it("shares always sum to the receipt total", () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 50_000 }),
        fc.integer({ min: -20_000, max: 20_000 }),
        fc.constantFrom<GuestOfHonorItemPolicy>("sharers", "even", "proportional"),
        fc.constantFrom(...ids),
        fc.constantFrom(...ids),
        (items, tax, gap, policy, uploader, payer) => {
          const its = items.map((it, i) => ({
            id: `i${i}`,
            amountMinor: it.amount,
            claims: it.claimers.map((m) => ({ memberId: m, weight: it.weight })),
          }));
          const lines = its.reduce((a, b) => a + b.amountMinor, 0) + tax;
          const total = lines + gap;
          try {
            const s = splitItemized({
              totalMinor: total,
              currency: "USD",
              payerId: payer,
              items: its,
              charges: tax ? [{ kind: "tax", amountMinor: tax }] : [],
              guestOfHonorIds: ["goh"],
              guestOfHonorPolicy: policy,
              everyoneElse: [...ids],
              unclaimed: { assignTo: uploader },
              difference: { assignTo: payer },
              leftoverTo: [uploader, payer],
            });
            expect(sumBig(s.shares.map((x) => x.shareMinor))).toBe(BigInt(total));
            expect(s.shares.some((x) => x.memberId === "goh")).toBe(false);
          } catch (e) {
            // Only legitimate refusals: nothing payable left, or negative claimed subtotals.
            expect((e as { code?: string }).code).toMatch(/ALL_GUESTS_OF_HONOR|ZERO_TOTAL_WEIGHT|NEGATIVE_SUBTOTAL/);
          }
        },
      ),
      opts,
    );
  });
});
