/**
 * The JSON API shared by the native app (apps/mobile) and the web server (apps/web/src/app/api/v1).
 * D75: the native app talks only to these endpoints. Both sides import these schemas, so a change
 * here is a change to both. Privacy rules are unchanged: the server reads as the caller (RLS), and
 * responses carry only what the web app would show that person.
 *
 * Auth: `Authorization: Bearer <token>`. Sign-in is two calls (no cookies): request a code, which
 * returns an opaque `challenge`; verify the code with that challenge to get a long-lived `token`.
 */
import type { z } from "zod";

export const API_VERSION = "v1";

export * from "./shapes";
export type { EndpointDef } from "./define";
import { coreEndpoints } from "./endpoints/core";
import { ideasEndpoints } from "./endpoints/ideas";
import { itineraryEndpoints } from "./endpoints/itinerary";
import { moneyEndpoints } from "./endpoints/money";
import { groupEndpoints } from "./endpoints/group";
import { accountEndpoints } from "./endpoints/account";

// ---------------------------------------------------------------------------
// Endpoints: one file per area under ./endpoints, so areas grow independently
// ---------------------------------------------------------------------------

export const endpoints = {
  ...coreEndpoints,
  ...ideasEndpoints,
  ...itineraryEndpoints,
  ...moneyEndpoints,
  ...groupEndpoints,
  ...accountEndpoints,
} as const;


export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;
export type BodyOf<K extends EndpointName> = Endpoints[K]["body"] extends z.ZodType
  ? z.infer<Endpoints[K]["body"]>
  : Endpoints[K]["body"] extends "multipart"
    ? FormData
    : undefined;
export type QueryOf<K extends EndpointName> = Endpoints[K] extends { query: z.ZodType } ? z.infer<Endpoints[K]["query"]> : undefined;
export type ResponseOf<K extends EndpointName> = z.infer<Endpoints[K]["response"]>;

/** Fill ":param" segments. */
export function pathFor(template: string, params: Record<string, string> = {}): string {
  return template.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    const v = params[k];
    if (!v) throw new Error(`Missing path param ${k}`);
    return encodeURIComponent(v);
  });
}
