import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addToEvenSplit,
  adjustmentsForCorrection,
  allocate,
  assertValidSplit,
  computeBalances,
  minorToDecimalString,
  parseMajorToMinor,
  redistributeShare,
  refundFromOriginal,
  simplifyDebts,
  splitEven,
  splitItemized,
  type ItemizedSplitInput,
  type LedgerExpense,
  type Payment,
  type Split,
} from "../../src/money";

const NUM_RUNS = 300;
const opts = { numRuns: NUM_RUNS };

const memberIdArb = fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h");
const membersArb = fc.uniqueArray(memberIdArb, { minLength: 1, maxLength: 8 });
const currencyArb = fc.constantFrom("USD", "EUR", "JPY", "KWD");
const amountArb = fc.oneof(
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
);
const posAmountArb = fc.oneof(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }));

const sumBig = (xs: readonly number[]) => xs.reduce((a, b) => a + BigInt(b), 0n);
const stripEven = (s: ReturnType<typeof splitEven>): Split => ({ currency: s.currency, totalMinor: s.totalMinor, shares: s.shares });

describe("property: allocate", () => {
  const weightsArb = fc
    .array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 12 })
    .filter((w) => w.some((x) => x > 0));

  it("parts sum to the total, zero weights get zero, each part is within 1 of exact", () => {
    fc.assert(
      fc.property(amountArb, weightsArb, fc.integer({ min: -20, max: 20 }), (total, weights, start) => {
        const parts = allocate(total, weights, { tieBreakStart: start });
        expect(sumBig(parts)).toBe(BigInt(total));
        const W = BigInt(weights.reduce((a, b) => a + b, 0));
        parts.forEach((p, i) => {
          if (weights[i] === 0) expect(p).toBe(0);
          const diff = BigInt(p) * W - BigInt(total) * BigInt(weights[i]!);
          expect(diff < W && diff > -W).toBe(true);
        });
      }),
      opts,
    );
  });

  it("non-negative totals never produce negative parts; negatives are symmetric", () => {
    fc.assert(
      fc.property(posAmountArb, weightsArb, (total, weights) => {
        const parts = allocate(total, weights);
        for (const p of parts) expect(p).toBeGreaterThanOrEqual(0);
        expect(allocate(-total, weights)).toEqual(parts.map((p) => (p === 0 ? 0 : -p)));
      }),
      opts,
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(amountArb, weightsArb, (total, weights) => {
        expect(allocate(total, weights)).toEqual(allocate(total, [...weights]));
      }),
      opts,
    );
  });
});

describe("property: splitEven", () => {
  it("sums exactly, shares differ by at most 1, independent of input order", () => {
    fc.assert(
      fc.property(amountArb, currencyArb, membersArb, (total, currency, members) => {
        const s = splitEven({ totalMinor: total, currency, participantIds: members });
        assertValidSplit(s);
        const vals = s.shares.map((x) => x.shareMinor);
        expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
        if (total >= 0) for (const v of vals) expect(v).toBeGreaterThanOrEqual(0);
        const reversed = splitEven({ totalMinor: total, currency, participantIds: [...members].reverse() });
        expect(reversed).toEqual(s);
      }),
      opts,
    );
  });

  it("guests of honor always pay 0 and the rest still sum to the total", () => {
    fc.assert(
      fc.property(posAmountArb, membersArb, fc.array(memberIdArb, { maxLength: 4 }), (total, members, goh) => {
        const payers = members.filter((m) => !goh.includes(m));
        fc.pre(payers.length > 0);
        const s = splitEven({ totalMinor: total, currency: "USD", participantIds: members, guestOfHonorIds: goh });
        assertValidSplit(s);
        expect(s.shares.map((x) => x.memberId)).toEqual([...payers].sort());
      }),
      opts,
    );
  });
});

const itemsArb = fc.array(
  fc.record({
    amountMinor: fc.integer({ min: 0, max: 500_000 }),
    claims: fc.uniqueArray(fc.record({ memberId: memberIdArb, weight: fc.integer({ min: 1, max: 5 }) }), {
      selector: (c) => c.memberId,
      minLength: 1,
      maxLength: 5,
    }),
  }),
  { minLength: 1, maxLength: 10 },
);

const receiptArb = fc
  .record({
    currency: currencyArb,
    items: itemsArb,
    tax: fc.integer({ min: 0, max: 50_000 }),
    tip: fc.integer({ min: 0, max: 50_000 }),
    discount: fc.integer({ min: 0, max: 1_000 }),
    goh: fc.array(memberIdArb, { maxLength: 2 }),
  })
  .map(({ currency, items, tax, tip, discount, goh }) => {
    const itemsTotal = items.reduce((a, i) => a + i.amountMinor, 0);
    const disc = Math.min(discount, itemsTotal);
    const input: ItemizedSplitInput = {
      currency,
      payerId: "a",
      totalMinor: itemsTotal + tax + tip - disc,
      items: items.map((i, idx) => ({ id: `i${idx}`, ...i })),
      charges: [
        { kind: "tax", amountMinor: tax },
        { kind: "tip", amountMinor: tip },
        { kind: "discount", amountMinor: -disc },
      ],
      guestOfHonorIds: goh,
    };
    return input;
  });

const payingWeight = (input: ItemizedSplitInput) => {
  const goh = new Set(input.guestOfHonorIds);
  return input.items.some((i) => i.amountMinor > 0 && i.claims.some((c) => !goh.has(c.memberId)));
};

describe("property: splitItemized", () => {
  it("shares sum exactly to the total, never negative, guests of honor excluded", () => {
    fc.assert(
      fc.property(receiptArb, (input) => {
        fc.pre(payingWeight(input));
        const s = splitItemized(input);
        assertValidSplit(s);
        for (const sh of s.shares) {
          expect(sh.shareMinor).toBeGreaterThanOrEqual(0);
          expect(input.guestOfHonorIds).not.toContain(sh.memberId);
        }
        for (const b of s.breakdown) expect(b.itemsMinor + b.chargesMinor + b.differenceMinor).toBe(b.shareMinor);
      }),
      opts,
    );
  });

  it("is deterministic and independent of item and claim order", () => {
    fc.assert(
      fc.property(receiptArb, (input) => {
        fc.pre(payingWeight(input));
        const a = splitItemized(input);
        const shuffled: ItemizedSplitInput = {
          ...input,
          items: [...input.items].reverse().map((i) => ({ ...i, claims: [...i.claims].reverse() })),
        };
        const b = splitItemized(shuffled);
        expect(b.shares).toEqual(a.shares);
        expect(splitItemized(input)).toEqual(a);
      }),
      opts,
    );
  });
});

const evenExpenseArb: fc.Arbitrary<LedgerExpense> = fc
  .record({ total: fc.integer({ min: 0, max: 10_000_000 }), currency: currencyArb, payer: memberIdArb, members: membersArb })
  .map(({ total, currency, payer, members }) => ({ payerId: payer, ...stripEven(splitEven({ totalMinor: total, currency, participantIds: members })) }));

const paymentArb: fc.Arbitrary<Payment> = fc
  .record({ from: memberIdArb, to: memberIdArb, currency: currencyArb, amount: fc.integer({ min: 1, max: 1_000_000 }) })
  .filter((p) => p.from !== p.to)
  .map((p) => ({ fromMemberId: p.from, toMemberId: p.to, currency: p.currency, amountMinor: p.amount }));

describe("property: ledger", () => {
  it("balances sum to zero per currency", () => {
    fc.assert(
      fc.property(fc.array(evenExpenseArb, { maxLength: 15 }), fc.array(paymentArb, { maxLength: 10 }), (expenses, payments) => {
        const bal = computeBalances({ expenses, payments });
        for (const row of Object.values(bal)) expect(sumBig(Object.values(row))).toBe(0n);
      }),
      opts,
    );
  });

  it("simplification preserves net balances, is deterministic and bounded", () => {
    fc.assert(
      fc.property(fc.array(evenExpenseArb, { maxLength: 15 }), fc.array(paymentArb, { maxLength: 10 }), (expenses, payments) => {
        const bal = computeBalances({ expenses, payments });
        for (const [currency, row] of Object.entries(bal)) {
          const transfers = simplifyDebts(row, currency);
          expect(simplifyDebts(row, currency)).toEqual(transfers);
          const nonZero = Object.values(row).filter((v) => v !== 0).length;
          expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
          // Recording the suggested transfers as payments settles everyone.
          const after = computeBalances({
            expenses,
            payments: [...payments, ...transfers.map((t) => ({ ...t }))],
          })[currency]!;
          for (const v of Object.values(after)) expect(v).toBe(0);
          for (const t of transfers) {
            expect(t.amountMinor).toBeGreaterThan(0);
            expect(row[t.fromMemberId]!).toBeLessThan(0);
            expect(row[t.toMemberId]!).toBeGreaterThan(0);
          }
        }
      }),
      opts,
    );
  });

  it("original + correction adjustments == corrected expense", () => {
    fc.assert(
      fc.property(evenExpenseArb, evenExpenseArb, (before, after0) => {
        const after = { ...after0, currency: before.currency };
        const adj = adjustmentsForCorrection(before, after);
        expect(sumBig(adj.map((a) => a.deltaMinor))).toBe(0n);
        const viaAdj = computeBalances({ expenses: [before], adjustments: adj })[before.currency]!;
        const direct = computeBalances({ expenses: [after] })[before.currency]!;
        for (const id of new Set([...Object.keys(viaAdj), ...Object.keys(direct)])) {
          expect(viaAdj[id] ?? 0).toBe(direct[id] ?? 0);
        }
      }),
      opts,
    );
  });
});

describe("property: refunds, drop-outs, late joiners", () => {
  it("refunds sum to -refund, never exceed the original share, and a full refund negates", () => {
    fc.assert(
      fc.property(
        evenExpenseArb
          .filter((e) => e.totalMinor > 0)
          .chain((e) => fc.tuple(fc.constant(e), fc.integer({ min: 1, max: e.totalMinor }))),
        ([e, amount]) => {
        const original: Split = { currency: e.currency, totalMinor: e.totalMinor, shares: [...e.shares] };
        const r = refundFromOriginal(original, amount);
        assertValidSplit(r);
        r.shares.forEach((s, i) => {
          expect(s.shareMinor).toBeLessThanOrEqual(0);
          expect(-s.shareMinor).toBeLessThanOrEqual(original.shares[i]!.shareMinor);
        });
        const full = refundFromOriginal(original, e.totalMinor);
        expect(full.shares.map((s) => s.shareMinor)).toEqual(original.shares.map((s) => (s.shareMinor === 0 ? 0 : -s.shareMinor)));
        },
      ),
      opts,
    );
  });

  it("redistributing a drop-out's share keeps the total and removes them", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), membersArb, (total, members) => {
        fc.pre(members.length >= 2);
        const s = stripEven(splitEven({ totalMinor: total, currency: "USD", participantIds: members }));
        const out = redistributeShare(s, members[0]!);
        assertValidSplit(out);
        expect(out.shares.map((x) => x.memberId)).not.toContain(members[0]);
      }),
      opts,
    );
  });

  it("adding a late joiner to an even split never raises anyone's share", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), membersArb, memberIdArb, (total, members, joiner) => {
        fc.pre(!members.includes(joiner));
        const s = stripEven(splitEven({ totalMinor: total, currency: "USD", participantIds: members }));
        const out = addToEvenSplit(s, [joiner]);
        assertValidSplit(out);
        const before = Object.fromEntries(s.shares.map((x) => [x.memberId, x.shareMinor]));
        for (const sh of out.shares) if (sh.memberId in before) expect(sh.shareMinor).toBeLessThanOrEqual(before[sh.memberId]!);
      }),
      opts,
    );
  });
});

describe("property: currency parsing", () => {
  it("decimal string round-trips through parseMajorToMinor for every safe integer", () => {
    fc.assert(
      fc.property(amountArb, fc.constantFrom("USD", "JPY", "KWD", "CLF"), (n, c) => {
        expect(parseMajorToMinor(minorToDecimalString(n, c), c)).toBe(n);
      }),
      opts,
    );
  });
});
