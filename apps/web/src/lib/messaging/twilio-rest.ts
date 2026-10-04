/** Minimal Twilio REST client over fetch (no SDK). */
export type TwilioCreds = { accountSid: string; authToken: string };

export async function twilioPost<T>(
  creds: TwilioCreds,
  url: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: T }> {
  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
