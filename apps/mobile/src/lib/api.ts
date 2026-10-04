/**
 * The one API client (D75): the native app talks only to /api/v1 through the shared contract.
 * In mock mode the same client runs against an in-memory server, so responses are still validated.
 */
import { ApiRequestError, createApiClient } from "@wandr/api-contract/client";
import { API_MOCK, API_URL } from "./env";
import { createMockFetch } from "./mock/server";
import { tokenStore } from "./token-store";

let onUnauthorized: (() => void) | null = null;
/** The session provider registers this so a 401 anywhere signs the person out cleanly. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

const call = createApiClient({
  baseUrl: API_MOCK ? "http://mock.wandr.local" : API_URL,
  getToken: () => tokenStore.get(),
  fetchImpl: API_MOCK ? createMockFetch({ latencyMs: 250 }) : undefined,
});

export const api: typeof call = async (name, args) => {
  try {
    return await call(name, args);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401 && name !== "verifyCode") onUnauthorized?.();
    throw e;
  }
};

/** A friendly message for any error (server messages are already written for people). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof TypeError) return "Can't reach the server. Check your connection and try again.";
  // Anything else is a bug (e.g. a response that doesn't match the contract): log it so it shows
  // in Metro, and show the detail on dev builds.
  console.error("[wandr] unexpected error", e);
  if (__DEV__ && e instanceof Error) return `Something went wrong: ${e.message}`;
  return "Something went wrong. Try again.";
}

export { ApiRequestError };
