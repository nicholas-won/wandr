/**
 * Trip-text transport: Twilio Messaging Service (two-way number) in production, console in dev.
 * Sign-in codes do NOT go through here; they use Twilio Verify from a separate sender (FR-85).
 */
import { env } from "@/lib/env";
import { twilioPost, type TwilioCreds } from "./twilio-rest";

export type SmsMessage = { to: string; body: string };
export type SmsResult = { id: string | null };

export interface SmsProvider {
  readonly name: "twilio" | "console";
  send(msg: SmsMessage): Promise<SmsResult>;
}

export function twilioMessagingProvider(creds: TwilioCreds, messagingServiceSid: string): SmsProvider {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  return {
    name: "twilio",
    async send({ to, body }) {
      const r = await twilioPost<{ sid?: string; message?: string; code?: number }>(creds, url, {
        To: to,
        MessagingServiceSid: messagingServiceSid,
        Body: body,
      });
      if (!r.ok) throw new Error(`Twilio send failed (${r.status} ${r.data.code ?? ""}): ${r.data.message ?? ""}`);
      return { id: r.data.sid ?? null };
    },
  };
}

export const consoleSmsProvider: SmsProvider = {
  name: "console",
  async send({ to, body }) {
    console.info(`[sms:dev] to=${to}\n${body}`);
    return { id: null };
  },
};

export function getSmsProvider(): SmsProvider {
  const e = env();
  if (e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_MESSAGING_SERVICE_SID) {
    return twilioMessagingProvider(
      { accountSid: e.TWILIO_ACCOUNT_SID, authToken: e.TWILIO_AUTH_TOKEN },
      e.TWILIO_MESSAGING_SERVICE_SID,
    );
  }
  return consoleSmsProvider;
}
