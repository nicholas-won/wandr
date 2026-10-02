/**
 * Error monitoring (§7a Sentry). Off unless SENTRY_DSN is set, so local dev needs nothing.
 * No PII: phone numbers and emails must never be attached to events (NFR-3).
 */
import type { Instrumentation } from "next";

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1, // PII is off by default; keep it that way
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
