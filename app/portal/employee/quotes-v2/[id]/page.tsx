import { notFound, redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import { DesignWorkspace } from './DesignWorkspace'

// Peek the next quote number for display only (atomic rpc consumes it at save).
async function getNextQuoteNumber(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const year = new Date().getFullYear()
  const [{ data: seq }, { data: settings }] = await Promise.all([
    supabase.from('quote_sequences').select('next_number').eq('year', year).maybeSingle(),
    supabase.from('company_settings').select('quote_prefix').eq('id', true).maybeSingle(),
  ])
  const prefix = settings?.quote_prefix ?? 'QUO'
  const next = seq?.next_number ?? 1
  return `${prefix}-${year}-${String(next).padStart(3, '0')}`
}

export default async function QuoteV2DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user!.id).single()

  const role = profile?.role ?? 'field_worker'
  const isAdmin = role === 'admin'
  const isManager = role === 'manager' || isAdmin

  const { data: req } = await supabase
    .from('quote_requests')
    .select('*, submitter:user_profiles!submitted_by(full_name)')
    .eq('id', id)
    .single()

  if (!req) notFound()
  if (req.deleted_at) redirect(isAdmin ? '/portal/employee/quotes-v2/deleted' : '/portal/employee/quotes-v2')
  if (!isManager && req.submitted_by !== user!.id) redirect('/portal/employee/quotes-v2')

  const photoUrls    = (req.photo_urls ?? []) as string[]
  const nextQuoteNum = isAdmin ? await getNextQuoteNumber(supabase) : ''

  const { data: linkedJob } = await supabase
    .from('jobs').select('id').eq('quote_request_id', id).maybeSingle()

  return (
    <DesignWorkspace
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req={req as Record<string, any>}
      isAdmin={isAdmin}
      photoUrls={photoUrls}
      nextQuoteNum={nextQuoteNum}
      linkedJobId={linkedJob?.id ?? null}
    />
  )
}
