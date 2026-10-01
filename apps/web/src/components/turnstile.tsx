"use client";

/**
 * Cloudflare Turnstile widget (FR-15, J-16). Renders only when a site key is configured; the
 * widget injects a hidden `cf-turnstile-response` field into the surrounding form.
 */
import Script from "next/script";

export function Turnstile({ siteKey }: { siteKey: string }) {
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile mt-2" data-sitekey={siteKey} data-theme="auto" />
    </>
  );
}
