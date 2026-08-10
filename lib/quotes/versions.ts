import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Quote versioning (W56 phase 1).
 *
 * Every send snapshots the whole quote into an append-only `quote_versions` row,
 * so "what did the customer actually see?" always has an answer that doesn't
 * depend on the current state of `quote_requests`.
 *
 * Snapshotting is deliberately BEST-EFFORT on the send path: if the archive
 * write fails, the customer still gets their quote. Losing the evidence of a
 * send is bad; failing to send because the archive hiccuped is worse.
 */

export interface QuoteVersion {
  id: string
  quote_id: string
  version: number
  quote_html: string | null
  total_amount: number | null
  deposit_amount: number | null
  tariff_rate: number | null
  expiry_date: string | null
  sent_at: string
  sent_by: string | null
  amendment_reason: string | null
}

/** Quote columns a snapshot copies. */
export interface SnapshotSource {
  id: string
  quote_html?: string | null
  system_design?: unknown
  /** Scope-engine payload (W97, migration 105) — the non-solar sibling of system_design. */
  scope?: unknown
  bom_snapshot?: unknown
  generated_quote?: unknown
  total_amount?: number | null
  deposit_amount?: number | null
  tariff_rate?: number | null
  expiry_date?: string | null
}

export interface SnapshotResult {
  version: number | null
  /** True when this send created a NEW version (i.e. something changed). */
  created: boolean
  error?: string
}

/** Stable comparison key — two sends with identical content are one version. */
function contentKey(q: Omit<SnapshotSource, 'id'>): string {
  return JSON.stringify([
    q.quote_html ?? '',
    q.total_amount ?? null,
    q.deposit_amount ?? null,
    q.tariff_rate ?? null,
    q.system_design ?? null,
    q.bom_snapshot ?? null,
    q.scope ?? null,
  ])
}

/**
 * Record the quote as sent. Returns the version number in force afterwards.
 *
 * Re-sending an UNCHANGED quote (the "resend to customer" button) does not mint
 * a new version — it is the same document, sent twice. A send after an edit
 * does, and that is exactly the amendment trail Matthew asked for.
 */
export async function snapshotQuoteVersion(
  quote: SnapshotSource,
  opts: { sentBy?: string | null; amendmentReason?: string | null; expiryDate?: string | null } = {},
): Promise<SnapshotResult> {
  try {
    const admin = createAdminClient()

    const { data: latest } = await admin
      .from('quote_versions')
      .select('version, quote_html, total_amount, deposit_amount, tariff_rate, system_design, bom_snapshot, scope')
      .eq('quote_id', quote.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latest && contentKey(latest as Omit<SnapshotSource, 'id'>) === contentKey(quote)) {
      return { version: latest.version, created: false }
    }

    const version = (latest?.version ?? 0) + 1
    const { error } = await admin.from('quote_versions').insert({
      quote_id: quote.id,
      version,
      quote_html: quote.quote_html ?? null,
      system_design: quote.system_design ?? null,
      scope: quote.scope ?? null,
      bom_snapshot: quote.bom_snapshot ?? null,
      generated_quote: quote.generated_quote ?? null,
      total_amount: quote.total_amount ?? null,
      deposit_amount: quote.deposit_amount ?? null,
      tariff_rate: quote.tariff_rate ?? null,
      expiry_date: opts.expiryDate ?? quote.expiry_date ?? null,
      sent_by: opts.sentBy ?? null,
      amendment_reason: version > 1 ? opts.amendmentReason ?? null : null,
    })
    if (error) return { version: latest?.version ?? null, created: false, error: error.message }

    // Pointer + lock stamp on the quote itself, so a list view can show "v3"
    // without joining. Failure here is cosmetic — the version row is the record.
    await admin
      .from('quote_requests')
      .update({ current_version: version, locked_at: new Date().toISOString() })
      .eq('id', quote.id)

    return { version, created: true }
  } catch (e) {
    return { version: null, created: false, error: e instanceof Error ? e.message : 'snapshot failed' }
  }
}

/** Version history for a quote, newest first. */
export async function listQuoteVersions(quoteId: string): Promise<QuoteVersion[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('quote_versions')
      .select('id, quote_id, version, quote_html, total_amount, deposit_amount, tariff_rate, expiry_date, sent_at, sent_by, amendment_reason')
      .eq('quote_id', quoteId)
      .order('version', { ascending: false })
    return (data ?? []) as QuoteVersion[]
  } catch {
    return []
  }
}

export interface VersionDiffRow {
  label: string
  from: string
  to: string
}

/** What changed between two versions, in the terms a customer would argue about. */
export function diffVersions(older: QuoteVersion, newer: QuoteVersion): VersionDiffRow[] {
  const rows: VersionDiffRow[] = []
  const rands = (cents: number | null) =>
    cents == null ? '—' : `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (older.total_amount !== newer.total_amount) {
    rows.push({ label: 'Quote total', from: rands(older.total_amount), to: rands(newer.total_amount) })
  }
  if (older.deposit_amount !== newer.deposit_amount) {
    rows.push({ label: 'Deposit', from: rands(older.deposit_amount), to: rands(newer.deposit_amount) })
  }
  if (older.tariff_rate !== newer.tariff_rate) {
    rows.push({
      label: 'Tariff assumption',
      from: older.tariff_rate != null ? `R${older.tariff_rate}/kWh` : '—',
      to: newer.tariff_rate != null ? `R${newer.tariff_rate}/kWh` : '—',
    })
  }
  if (older.expiry_date !== newer.expiry_date) {
    rows.push({ label: 'Valid until', from: older.expiry_date ?? '—', to: newer.expiry_date ?? '—' })
  }
  // The document changed but no headline number did — worth saying out loud,
  // because "same price, different scope" is exactly the disputed case.
  if (rows.length === 0 && older.quote_html !== newer.quote_html) {
    rows.push({ label: 'Quote document', from: `v${older.version}`, to: `v${newer.version} (wording or line items changed)` })
  }
  return rows
}
