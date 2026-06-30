import { createClient, getUser } from '@/lib/supabase/server'
import { getStaffDirectory } from '@/lib/records/sharing'
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

  return (
    <QuotesV2List
      rows={(requests ?? []) as QuoteRow[]}
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
