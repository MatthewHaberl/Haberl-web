import { createClient, getUser } from '@/lib/supabase/server'
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

  const query = supabase
    .from('quote_requests')
    .select('*, submitter:user_profiles!submitted_by(full_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!isManager) query.eq('submitted_by', user!.id)

  const { data: requests } = await query

  const { count: deletedCount } = isAdmin
    ? await supabase
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null)
    : { count: 0 }

  return (
    <QuotesV2List
      rows={(requests ?? []) as QuoteRow[]}
      isManager={isManager}
      isAdmin={isAdmin}
      deletedCount={deletedCount ?? 0}
    />
  )
}
