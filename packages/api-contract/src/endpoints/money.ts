/** Expenses, receipts, splits, balances, payments, adjustments (§6.5). */
// import { z } from "zod";
import type { EndpointDef } from "../define";

export const moneyEndpoints = {} as const satisfies Record<string, EndpointDef>;
