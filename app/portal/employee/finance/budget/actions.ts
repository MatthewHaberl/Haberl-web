'use client'

// Thin client wrapper over the budget API. Throws on error so callers can
// surface a message; resolves with the parsed JSON otherwise.
export async function budgetMutate(payload: {
  resource: 'category' | 'plan' | 'commitment' | 'goal' | 'manual'
  op: 'create' | 'update' | 'delete' | 'upsert'
  id?: string
  data?: Record<string, unknown>
}): Promise<{ ok: boolean; row?: unknown }> {
  const res = await fetch('/api/finance/budget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try { const j = await res.json(); if (j?.error) msg = j.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}
