import { MoneyError } from "../../src/money";

/** Returns the MoneyError code thrown by `fn`, "no-throw", or a marker for other errors. */
export function errCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof MoneyError ? e.code : `non-money:${String(e)}`;
  }
  return "no-throw";
}

export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export const shareMap = (shares: readonly { memberId: string; shareMinor: number }[]) =>
  Object.fromEntries(shares.map((s) => [s.memberId, s.shareMinor]));
