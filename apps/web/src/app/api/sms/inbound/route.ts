/**
 * Twilio inbound SMS webhook (FR-82, FR-83, FR-85). Replies with TwiML.
 * Signature-verified in production (X-Twilio-Signature).
 */
import type { NextRequest } from "next/server";
import { e164OrNull } from "@/lib/auth/phone";
import { appUrl, env, isProd } from "@/lib/env";
import { handleInboundSms } from "@/lib/messaging/inbound";
import { verifyTwilioSignature } from "@/lib/messaging/twilio-signature";
import { twimlResponse } from "@/lib/messaging/twiml";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params: [string, string][] = [];
  for (const [k, v] of form.entries()) if (typeof v === "string") params.push([k, v]);

  const authToken = env().TWILIO_AUTH_TOKEN;
  if (isProd() || authToken) {
    const url = env().TWILIO_INBOUND_URL ?? `${appUrl()}${request.nextUrl.pathname}${request.nextUrl.search}`;
    if (!authToken || !verifyTwilioSignature(authToken, request.headers.get("x-twilio-signature"), url, params)) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const get = (k: string) => params.find(([key]) => key === k)?.[1] ?? "";
  const from = e164OrNull(get("From"));
  if (!from) return twimlResponse(null);

  const numMedia = Math.min(Number.parseInt(get("NumMedia") || "0", 10) || 0, 10);
  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const u = get(`MediaUrl${i}`);
    if (u) mediaUrls.push(u);
  }

  try {
    const reply = await handleInboundSms({ from, body: get("Body").slice(0, 1600), mediaUrls });
    return twimlResponse(reply);
  } catch (err) {
    console.error("[sms] inbound handling failed", err);
    // Empty 200 so Twilio doesn't retry into a loop; the person can resend.
    return twimlResponse(null);
  }
}
