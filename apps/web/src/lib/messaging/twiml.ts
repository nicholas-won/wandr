/** TwiML responses for the inbound SMS webhook. Pure. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A reply message, or an empty response (no reply) when `text` is null. */
export function twiml(text: string | null): string {
  const inner = text ? `<Message>${escapeXml(text)}</Message>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

export function twimlResponse(text: string | null, status = 200): Response {
  return new Response(twiml(text), { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
