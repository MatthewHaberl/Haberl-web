/**
 * Guards for unauthenticated POST routes: a per-IP burst limit and HTML
 * escaping for anything that ends up in a notification email. In-memory by
 * design — it blunts scripted abuse without a store; the per-phone/day check
 * against the database is the durable limit.
 */
const ipHits = new Map<string, number[]>()

export function checkIpRateLimit(
  ip: string,
  { max = 5, windowMs = 60_000 }: { max?: number; windowMs?: number } = {},
): boolean {
  const now = Date.now()
  const recent = (ipHits.get(ip) ?? []).filter((timestamp) => now - timestamp < windowMs)
  if (recent.length >= max) return false
  ipHits.set(ip, [...recent, now])
  return true
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
