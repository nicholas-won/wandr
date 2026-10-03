/**
 * Plumbing for the native app's JSON API (/api/v1, D75): typed responses, `{error, message}`
 * failures, body validation with the contract's zod schemas, and bearer-token auth.
 *
 * - Bearer tokens only. Cookies are never read here, so these routes can't be driven by a
 *   cross-site form post (no CSRF surface) and need no CORS (native apps don't send Origin
 *   preflights). No CORS headers are added.
 * - Every response is `Cache-Control: no-store`.
 */
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { EndpointName, ResponseOf } from "@wandr/api-contract";
import { asService, getDb, users, type Db } from "@wandr/db";
import { getApiUser, type BearerUser } from "@/lib/auth/bearer";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export class ApiFail extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiFail";
  }
}

/** A successful response, typed against the contract. */
export function ok<K extends EndpointName>(_endpoint: K, data: ResponseOf<K>, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function failure(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status, headers: NO_STORE });
}

export const notFound = () => new ApiFail(404, "not_found", "We couldn't find that.");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Path ids must be UUIDs; anything else is simply not found (never a DB error). */
export function uuidParam(v: string): string {
  if (!UUID.test(v)) throw notFound();
  return v;
}

/** Parse and validate a JSON body. */
export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    const text = await request.text();
    json = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new ApiFail(400, "bad_request", "The request body isn't valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiFail(400, "bad_request", first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request.");
  }
  return parsed.data;
}

/** The caller, from `Authorization: Bearer`. 401 when missing, invalid, expired, or the account is gone. */
export async function requireApiUser(request: Request): Promise<{ db: Db; user: BearerUser }> {
  const user = await getApiUser(request);
  if (!user) throw new ApiFail(401, "unauthorized", "Sign in to continue.");
  const db = await getDb();
  const [row] = await asService(db, (tx) => tx.select({ id: users.id }).from(users).where(eq(users.id, user.userId)).limit(1));
  if (!row) throw new ApiFail(401, "unauthorized", "Sign in to continue.");
  return { db, user };
}

/** Wrap a handler: ApiFail → its status; anything else → 500 without internals. */
export function handler<C>(fn: (request: Request, ctx: C) => Promise<Response>) {
  return async (request: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(request, ctx);
    } catch (e) {
      if (e instanceof ApiFail) return failure(e.status, e.code, e.message);
      console.error("[api/v1]", request.method, new URL(request.url).pathname, e);
      return failure(500, "server_error", "Something went wrong. Try again.");
    }
  };
}
