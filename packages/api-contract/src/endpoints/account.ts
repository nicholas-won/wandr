/** Account (name, email, deletion), library boards, joining by link (FR-3, FR-9, §6.12). */
// import { z } from "zod";
import type { EndpointDef } from "../define";

export const accountEndpoints = {} as const satisfies Record<string, EndpointDef>;
