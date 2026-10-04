/**
 * Phone input helpers for sign-in (D74) and invites (FR-4). The server owns real validation and
 * normalisation (libphonenumber); this keeps the field friendly and sends something sensible.
 * US/Canada only at launch (§7a), so 10 bare digits get +1.
 */

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** "+15551234567" for "(555) 123-4567"; keeps an explicit international "+…" as typed (digits only). */
export function toE164Guess(input: string): string {
  const trimmed = input.trim();
  const d = digitsOnly(trimmed);
  if (trimmed.startsWith("+")) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d;
}

/** Enough digits to try sending a code. */
export function looksLikePhone(input: string): boolean {
  const d = digitsOnly(input);
  return d.length >= 10 && d.length <= 15;
}

/** Pretty-print as the user types: "(555) 123-4567" for US-looking numbers; otherwise unchanged. */
export function formatAsTyped(input: string): string {
  if (input.trim().startsWith("+")) return input;
  const d = digitsOnly(input).slice(0, 11);
  const local = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (local.length <= 3) return local;
  if (local.length <= 6) return `(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 10)}`;
}

/** Keep only digits, max 6, for the code boxes. */
export function sanitizeCode(input: string): string {
  return digitsOnly(input).slice(0, 6);
}
