/**
 * SMS cost estimates for the daily spend cap (FR-15, NFR-6). Estimates, in micro-dollars
 * (1 cent = 10_000 micros); integers only. Tune from real Twilio invoices.
 */
/** US/CA outbound segment incl. carrier fees (~$0.0083). */
export const SMS_SEGMENT_COST_MICROS = 8_300;
/** One Twilio Verify SMS verification (~$0.05). */
export const VERIFY_COST_MICROS = 50_000;

// GSM-7 basic charset + extension table (extension chars count as 2).
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

/** Number of SMS segments a body will be billed as. */
export function smsSegments(body: string): number {
  let septets = 0;
  let gsm = true;
  for (const ch of body) {
    if (GSM7.includes(ch)) septets += 1;
    else if (GSM7_EXT.includes(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return septets <= 160 ? 1 : Math.ceil(septets / 153);
  // UCS-2: count UTF-16 code units.
  const units = body.length;
  return units <= 70 ? 1 : Math.ceil(units / 67);
}

export function estimateSmsCostMicros(body: string): number {
  return smsSegments(body) * SMS_SEGMENT_COST_MICROS;
}

export const centsToMicros = (cents: number) => cents * 10_000;
