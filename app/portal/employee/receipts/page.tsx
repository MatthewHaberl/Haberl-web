import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess, requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Card, CardContent } from '@/components/ui/card'
import { ReceiptText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Metadata } from 'next'
import { CaptureForm } from './CaptureForm'
import { ReceiptList, type ReceiptVM } from './ReceiptList'
import { WhoTabs } from './WhoTabs'

export const metadata: Metadata = { title: 'Receipts' }
export const dynamic = 'force-dynamic'

// A day on site produces a handful of slips; two months of them is plenty of
// scrollback for a phone, and the office has the full list in Finance.
const LIMIT = 120
const THUMB_TTL = 60 * 60

type SP = { who?: string }

function todayISO(): string {
  // en-CA gives YYYY-MM-DD; the portal runs on SAST so "today" is the day the
  // technician is actually having, not UTC's.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date())
}

function startOfWeekISO(): string {
  const parts = todayISO().split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSection('receipts')
  const access = (await getUserAccess())!
  const isManager = access.role === 'manager' || access.role === 'admin'
  const sp = await searchParams
  // A field worker only ever sees their own — RLS says so too, this just keeps
  // the UI honest about it.
  const who = isManager && sp.who === 'all' ? 'all' : 'mine'

  const supabase = await createClient()

  let query = supabase
    .from('fin_documents')
    .select('id, supplier_name, doc_date, total_cents, notes, job_id, paid_by, file_url, file_name, mime_type, created_at, uploaded_by')
    .eq('doc_type', 'receipt')
    .order('doc_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (who === 'mine') query = query.eq('uploaded_by', access.user.id)

  // The job picker: RLS already narrows a field worker to their assigned jobs,
  // and the explicit filter keeps the intent visible at the call site.
  let jobsQuery = supabase
    .from('jobs')
    .select('id, title, scheduled_date, site:sites(name)')
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .limit(100)
  if (!isManager) jobsQuery = jobsQuery.eq('assigned_to', access.user.id)

  const [{ data: rowsRaw }, { data: jobsRaw }] = await Promise.all([query, jobsQuery])

  const rows = (rowsRaw ?? []) as unknown as Array<{
    id: string; supplier_name: string | null; doc_date: string | null
    total_cents: number | null; notes: string | null; job_id: string | null
    paid_by: string; file_url: string; file_name: string | null
    mime_type: string | null; created_at: string; uploaded_by: string | null
  }>

  const jobs = ((jobsRaw ?? []) as unknown as Array<{
    id: string; title: string | null; scheduled_date: string | null
    site: { name: string | null } | { name: string | null }[] | null
  }>).map((j) => {
    const site = Array.isArray(j.site) ? j.site[0] : j.site
    return {
      id: j.id,
      label: [j.title || 'Job', site?.name].filter(Boolean).join(' — '),
      scheduled_date: j.scheduled_date,
    }
  })
  const jobLabel = new Map(jobs.map((j) => [j.id, j.label]))

  // Thumbnails: the bucket is private and carries no storage policies, so the
  // service role signs them — one batch call rather than one round-trip a card.
  const admin = createAdminClient()
  const paths = rows.map((r) => r.file_url)
  const { data: signed } = paths.length
    ? await admin.storage.from('financial-docs').createSignedUrls(paths, THUMB_TTL)
    : { data: [] }
  const thumbs = new Map<string, string>()
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl) thumbs.set(s.path, s.signedUrl)
  }

  // Who took each photo — only worth a query on the manager's "everyone" view.
  const uploaderName = new Map<string, string>()
  if (who === 'all') {
    const ids = [...new Set(rows.map((r) => r.uploaded_by).filter(Boolean) as string[])]
    if (ids.length) {
      const { data: people } = await admin
        .from('user_profiles').select('id, full_name').in('id', ids)
      for (const p of (people ?? []) as Array<{ id: string; full_name: string | null }>) {
        if (p.full_name) uploaderName.set(p.id, p.full_name)
      }
    }
  }

  const receipts: ReceiptVM[] = rows.map((r) => ({
    id: r.id,
    supplier_name: r.supplier_name,
    doc_date: r.doc_date,
    total_cents: r.total_cents,
    notes: r.notes,
    job_id: r.job_id,
    job_label: r.job_id ? jobLabel.get(r.job_id) ?? null : null,
    paid_by: r.paid_by,
    thumb_url: thumbs.get(r.file_url) ?? null,
    file_name: r.file_name,
    created_at: r.created_at,
    uploader_name: r.uploaded_by ? uploaderName.get(r.uploaded_by) ?? null : null,
    mine: r.uploaded_by === access.user.id,
  }))

  const today = todayISO()
  const weekStart = startOfWeekISO()
  const dayOf = (r: ReceiptVM) => r.doc_date ?? r.created_at.slice(0, 10)
  const todays = receipts.filter((r) => dayOf(r) === today)
  const weeks = receipts.filter((r) => dayOf(r) >= weekStart)
  const sum = (list: ReceiptVM[]) => list.reduce((t, r) => t + (r.total_cents ?? 0), 0)
  const missingAmount = receipts.filter((r) => r.total_cents == null).length

  return (
    <PageShell width="content">
      <PageHeader
        title="Receipts"
        icon={ReceiptText}
        description={
          isManager
            ? 'Slips photographed on site. They land in Finance as receipts, ready to allocate.'
            : 'Photograph every slip you pick up during the day — the office takes it from there.'
        }
      />

      <CaptureForm jobs={jobs} defaultDate={today} />

      {isManager && <WhoTabs who={who} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Today" value={formatCurrency(sum(todays))} sub={`${todays.length} receipt${todays.length === 1 ? '' : 's'}`} />
        <Stat label="This week" value={formatCurrency(sum(weeks))} sub={`${weeks.length} receipt${weeks.length === 1 ? '' : 's'}`} />
        <Stat
          label="Still need an amount"
          value={String(missingAmount)}
          sub={missingAmount ? 'Tap a receipt to fill it in' : 'All captured'}
        />
      </div>

      <ReceiptList receipts={receipts} jobs={jobs} showUploader={who === 'all'} />
    </PageShell>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}
