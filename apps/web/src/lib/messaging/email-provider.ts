/** Email transport: Resend in production, console in dev (FR-14 codes, FR-85 fallback). */
import { APP_NAME } from "@wandr/core/config";
import { env } from "@/lib/env";

export type EmailMessage = { to: string; subject: string; text: string };
export type EmailResult = { id: string | null };

export interface EmailProvider {
  readonly name: "resend" | "console";
  send(msg: EmailMessage): Promise<EmailResult>;
}

export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    async send(msg) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
      });
      if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { id?: string };
      return { id: data.id ?? null };
    },
  };
}

export const consoleEmailProvider: EmailProvider = {
  name: "console",
  async send(msg) {
    console.info(`[email:dev] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}`);
    return { id: null };
  },
};

export function getEmailProvider(): EmailProvider {
  const e = env();
  if (e.RESEND_API_KEY) {
    return resendProvider(e.RESEND_API_KEY, e.EMAIL_FROM ?? `${APP_NAME} <no-reply@example.com>`);
  }
  return consoleEmailProvider;
}
