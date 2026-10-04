import type { z } from "zod";

/**
 * One endpoint. `body` is a zod schema (JSON), null (no body) or "multipart" (the caller passes a
 * FormData, e.g. a photo upload; the route validates the fields itself). `query` is for GET filters.
 */
export interface EndpointDef {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body: z.ZodType | null | "multipart";
  query?: z.ZodType<Record<string, string | undefined>>;
  response: z.ZodType;
}
