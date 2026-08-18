import { createClient, getUser } from '@/lib/supabase/server'
import { getStaffDirectory } from '@/lib/records/sharing'
import { summariseQuoteRow } from '@/lib/quotes/quote-list-summary'
import { QuotesV2List, type QuoteRow } from './QuotesV2List'

// ─────────────────────────────────────────────────────────────────────────────
// QUOTES (NEW) — Phase 1: Customer → Site → Option.
// Each quote_requests row is an Option. The list (client) groups by customer,
// then site (site_label → address → "Site N"), and supports inline renaming +
// add option / add site. Backend untouched; old /quotes tab is the fallback.
// ─────────────────────────────────────────────────────────────────────────────

export default async function QuotesV2Page() {
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const isManager = profile?.role === 'manager' || isAdmin

  // Record-level visibility (migration 072) is enforced by RLS: a non-manager
  // already receives only the quotes they submitted or were shared. No extra
  // submitted_by filter here — that would hide shared quotes.
  const { data: requests } = await supabase
    .from('quote_requests')
    .select('*, submitter:user_profiles!submitted_by(full_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const { count: deletedCount } = isAdmin
    ? await supabase
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null)
    : { count: 0 }

  // Staff directory + share grants for the visible quotes (owner/share UI).
  const { staff, nameById } = await getStaffDirectory(supabase)
  const visibleIds = (requests ?? []).map((r) => r.id as string)
  const { data: grantRows } = visibleIds.length
    ? await supabase.from('record_grants').select('record_id, user_id').eq('section', 'quotes').in('record_id', visibleIds)
    : { data: [] as { record_id: string; user_id: string }[] }
  const sharesByQuote: Record<string, { id: string; full_name: string }[]> = {}
  for (const g of grantRows ?? []) {
    ;(sharesByQuote[g.record_id] ??= []).push({ id: g.user_id, full_name: nameById.get(g.user_id) ?? 'Someone' })
  }

  // The list shows money and shape, so each row is summarised here rather than
  // shipped whole: `scope` and `system_design` are the two biggest columns on
  // the table and the list needs neither — only what they add up to.
  const rows: QuoteRow[] = (requests ?? []).map((r) => ({
    id: r.id,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    customer_email: r.customer_email,
    site_number: r.site_number,
    site_label: r.site_label,
    option_label: r.option_label,
    quote_number: r.quote_number,
    address: r.address,
    system_type: r.system_type,
    work_type: r.work_type,
    monthly_kwh: r.monthly_kwh,
    created_at: r.created_at,
    status: r.status,
    total_amount: r.total_amount,
    submitted_by: r.submitted_by,
    archived_at: r.archived_at,
    submitter: r.submitter,
    summary: summariseQuoteRow(r),
  }))

  return (
    <QuotesV2List
      rows={rows}
      isManager={isManager}
      isAdmin={isAdmin}
      deletedCount={deletedCount ?? 0}
      staff={staff}
      sharesByQuote={sharesByQuote}
      nameById={Object.fromEntries(nameById)}
      currentUserId={user!.id}
    />
  )
}
