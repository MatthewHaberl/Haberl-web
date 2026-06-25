/**
 * Canonical form of a phone number, used to decide when two contacts are
 * "the same person". Strips spaces and punctuation, and folds SA numbers to
 * the local 0XXXXXXXXX form so +27 / 0027 international prefixes and stray
 * formatting collapse together (e.g. "+27 79 033 6247", "079 033 6247" and
 * "0790336247" all become "0790336247").
 *
 * MUST stay in lock-step with public.normalize_phone() (migration 053) — the
 * DB generated column customers.phone_normalized is what these values are
 * matched against, so the two implementations have to agree exactly.
 *
 * Returns null when there are no digits to key on.
 */
export function normalizePhone(input: unknown): string | null {
  const digits = String(input ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (/^27\d{9}$/.test(digits)) return '0' + digits.slice(2)
  if (/^0027\d{9}$/.test(digits)) return '0' + digits.slice(4)
  if (/^\d{9}$/.test(digits)) return '0' + digits
  return digits
}
