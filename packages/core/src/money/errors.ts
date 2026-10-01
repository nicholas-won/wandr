/**
 * Errors thrown by the money domain. Every error carries a stable `code` so
 * route handlers can map it to a user-facing message without string matching.
 */
export type MoneyErrorCode =
  | "INVALID_CURRENCY"
  | "CURRENCY_MISMATCH"
  | "INVALID_AMOUNT"
  | "UNSAFE_INTEGER"
  | "PARSE_ERROR"
  | "TOO_MANY_DECIMALS"
  | "INVALID_WEIGHT"
  | "ZERO_TOTAL_WEIGHT"
  | "NO_PARTICIPANTS"
  | "DUPLICATE_MEMBER"
  | "ALL_GUESTS_OF_HONOR"
  | "UNKNOWN_MEMBER"
  | "UNCLAIMED_ITEMS"
  | "RECEIPT_DISCREPANCY"
  | "NEGATIVE_SUBTOTAL"
  | "SHARES_DO_NOT_SUM"
  | "ADJUSTMENT_NOT_BALANCED"
  | "INVALID_PAYMENT"
  | "REFUND_EXCEEDS_ORIGINAL"
  | "INVALID_RATE"
  | "MISSING_RATE"
  | "UNBALANCED_LEDGER";

export class MoneyError extends Error {
  readonly code: MoneyErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: MoneyErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "MoneyError";
    this.code = code;
    this.details = details;
  }
}
