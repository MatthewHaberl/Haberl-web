import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, FileText, HardHat } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  loadBookableJobs,
  loadJobRefs,
  loadOutstandingDeductions,
  loadPayslips,
} from '@/lib/staff/server'
import { entryPayR, isEarningKind, isoDate, outstandingOn, payPeriod, totalPay } from '@/lib/staff/pay'
import { expiryState, expiryWording, STAFF_DOC_LABEL } from '@/lib/staff/documents'
import { cn } from '@/lib/utils'
import type { Staff, StaffDocument, StaffPayment, TimeEntry } from '@/types/database'
import { DocumentsPanel, type DocRow } from './DocumentsPanel'
import { PaymentsPanel } from './PaymentsPanel'

export const dynamic = 'force-dynamic'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('staff').select('full_name').eq('id', id).maybeSingle()
  return { title: (data?.full_name as string) ?? 'Staff' }
}

const KIND_LABEL: Record<string, string> = {
  piece: 'Job work',
  bonus: 'Bonus',
  allowance: 'Allowance',
  deduction: 'Deduction',
  advance: 'Advance',
}

type Tab = 'overview' | 'documents'

/**
 * Tabs as links, not state — the page is a server component and each tab loads
 * its own half. A bookmarked ?tab=documents lands where you left it.
 */
function StaffTabs({
  staffId,
  active,
  showDocuments,
  documentCount,
  alertCount,
}: {
  staffId: string
  active: Tab
  showDocuments: boolean
  documentCount: number
  alertCount: number
}) {
  const tabs: { key: Tab; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: `/portal/employee/staff/${staffId}` },
  ]
  if (showDocuments) {
    tabs.push({
      key: 'documents',
      label: 'Documents',
      href: `/portal/employee/staff/${staffId}?tab=documents`,
    })
  }
  return (
    <div className="flex border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            '-mb-px border-b-2 px-5 py-3 text-sm font-medium transition-colors',
            active === t.key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
          {t.key === 'documents' && documentCount > 0 && (
            <span
              className={cn(
                'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                alertCount > 0
                  ? 'bg-warning/15 text-warning'
                  : 'bg-accent text-accent-foreground',
              )}
            >
              {documentCount}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}

/**
 * One person: what they cost, what they've worked, what they've been paid.
 *
 * Scoped to the last 90 days of detail — long enough to answer "was last month
 * right", short enough that the page stays a page. Payslips are the permanent
 * record beyond that.
 */
export default async function StaffMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { role } = await requireSection('staff')
  // The documents table is manager/admin in RLS too. Anyone else granted the
  // staff section sees the person without their paperwork, rather than a tab
  // that loads empty and refuses every upload.
  const canSeeDocuments = role === 'manager' || role === 'admin'
  const { id } = await params
  const { tab } = await searchParams
  const activeTab: Tab = tab === 'documents' && canSeeDocuments ? 'documents' : 'overview'
  const supabase = await createClient()

  const { data: row } = await supabase.from('staff').select('*').eq('id', id).maybeSingle()
  if (!row) notFound()
  const person = row as unknown as Staff

  const since = new Date()
  since.setDate(since.getDate() - 90)
  const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`

  const [entriesRes, paymentsRes, payslips, jobs, docsRes] = await Promise.all([
    supabase
      .from('time_entries')
      .select('*')
      .eq('staff_id', id)
      .gte('work_date', sinceIso)
      .order('work_date', { ascending: false }),
    supabase
      .from('staff_payments')
      .select('*')
      .eq('staff_id', id)
      .gte('pay_date', sinceIso)
      .order('pay_date', { ascending: false }),
    loadPayslips(supabase, { staffId: id, limit: 24 }),
    loadBookableJobs(supabase),
    // The whole file, not a window: paperwork is kept precisely because it is
    // old. RLS keeps this manager/admin even when the section is shared wider.
    canSeeDocuments
      ? supabase
          .from('staff_documents')
          .select('*')
          .eq('staff_id', id)
          .order('expires_on', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const entries = (entriesRes.data ?? []) as unknown as TimeEntry[]
  const payments = (paymentsRes.data ?? []) as unknown as StaffPayment[]
  const rawDocs = (docsRes.data ?? []) as unknown as StaffDocument[]

  // Who filed each document — one lookup for the whole list, not one per row.
  const uploaderIds = [...new Set(rawDocs.map((d) => d.uploaded_by).filter((u): u is string => !!u))]
  const uploaderNames = new Map<string, string>()
  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', uploaderIds)
    for (const pr of profiles ?? []) uploaderNames.set(pr.id as string, (pr.full_name as string) ?? '')
  }
  const today = isoDate(new Date())
  const documents: DocRow[] = rawDocs.map((d) => ({
    id: d.id,
    doc_type: d.doc_type,
    title: d.title,
    doc_number: d.doc_number,
    issued_on: d.issued_on,
    expires_on: d.expires_on,
    notes: d.notes,
    file_name: d.file_name,
    file_size: d.file_size,
    created_at: d.created_at,
    uploadedByName: d.uploaded_by ? (uploaderNames.get(d.uploaded_by) || null) : null,
  }))

  // Anything lapsed or lapsing inside 60 days is surfaced on BOTH tabs — a
  // wireman's card that ran out is a site problem, not a filing problem.
  const expiring = documents
    .map((d) => ({ doc: d, state: expiryState(d.expires_on, today) }))
    .filter((x) => x.state.status === 'expired' || x.state.status === 'soon')
    .sort((a, b) => a.state.days - b.state.days)
  const jobRefs = await loadJobRefs(supabase, entries.map((e) => e.job_id).filter((j): j is string => !!j))

  // Advances older than the 90-day window still owe money, so what is coming
  // off the next slip is read by balance rather than by date.
  const outstanding = await loadOutstandingDeductions(supabase, isoDate(new Date()), {
    staffIds: [id],
  })

  const week = payPeriod('weekly', new Date())
  const weekTotals = totalPay(
    entries.filter((e) => e.work_date >= week.start && e.work_date <= week.end && e.status !== 'running'),
    payments.filter((p) => p.pay_date >= week.start && p.pay_date <= week.end && isEarningKind(p.kind)),
  )
  const unpaid = totalPay(
    entries.filter((e) => !e.payslip_id && e.status !== 'running'),
    [...payments.filter((p) => !p.payslip_id && isEarningKind(p.kind)), ...outstanding],
  )

  return (
    <PageShell width="wide">
      <PageHeader
        title={person.full_name}
        icon={HardHat}
        description={[person.job_title, person.employee_no && `#${person.employee_no}`, person.phone]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/portal/employee/staff">All staff</Link>
            </Button>
            <Button asChild>
              <Link href="/portal/employee/staff/payroll">Run pay</Link>
            </Button>
          </>
        }
      />

      <StaffTabs
        staffId={person.id}
        active={activeTab}
        showDocuments={canSeeDocuments}
        documentCount={documents.length}
        alertCount={expiring.length}
      />

      {expiring.length > 0 && (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {expiring.length === 1 ? 'A document needs attention' : `${expiring.length} documents need attention`}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {expiring.map((x) => (
                <li key={x.doc.id}>
                  {STAFF_DOC_LABEL[x.doc.doc_type]} — {x.doc.title} {expiryWording(x.state)}
                </li>
              ))}
            </ul>
          </div>
          {activeTab !== 'documents' && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/portal/employee/staff/${person.id}?tab=documents`}>Open documents</Link>
            </Button>
          )}
        </div>
      )}

      {activeTab === 'overview' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Cost rate</p>
                <p className="text-xl font-bold text-primary">
                  {person.cost_rate_r > 0 ? `${rand(person.cost_rate_r)}/hr` : 'Not set'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Overtime {person.overtime_multiplier}× · paid by{' '}
                  {person.pay_type === 'piece' ? 'the job' : 'the hour'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">This week</p>
                <p className="text-xl font-bold text-primary">
                  {(weekTotals.normalHours + weekTotals.overtimeHours).toFixed(1)} hr
                </p>
                <p className="text-xs text-muted-foreground">{rand(weekTotals.grossPayR)} gross</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Owed (unpaid)</p>
                <p className="text-xl font-bold text-primary">{rand(unpaid.netPayR)}</p>
                <p className="text-xs text-muted-foreground">
                  {(unpaid.normalHours + unpaid.overtimeHours).toFixed(1)} hr not yet on a payslip
                  {unpaid.outstandingR > 0 && `, after ${rand(unpaid.deductionsR)} recovered`}
                </p>
                {unpaid.carryForwardR > 0 && (
                  <p className="text-xs text-warning">
                    {rand(unpaid.carryForwardR)} of advances carries past this run
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Payslips</p>
                <p className="text-xl font-bold text-primary">{payslips.length}</p>
                <p className="text-xs text-muted-foreground">
                  {person.active ? 'Currently employed' : 'Past staff'}
                </p>
              </CardContent>
            </Card>
          </div>

          <PaymentsPanel
            staffId={person.id}
            staffName={person.full_name}
            jobs={jobs}
            payments={payments.map((p) => ({
              id: p.id,
              pay_date: p.pay_date,
              kind: p.kind,
              description: p.description,
              amount_r: Number(p.amount_r),
              job_id: p.job_id,
              jobRef: p.job_id ? (jobRefs.get(p.job_id) ?? null) : null,
              outstandingR: outstandingOn(p),
              // Settled outright, or a payslip has already recovered part of it —
              // either way deleting it now would rewrite a slip already handed over.
              locked: !!p.payslip_id || Number(p.recovered_r ?? 0) > 0,
            }))}
            kindLabels={KIND_LABEL}
          />

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 text-sm font-semibold">Hours — last 90 days</h2>
              {entries.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hours recorded.{' '}
                  <Link href="/portal/employee/staff/timesheet" className="text-primary hover:underline">
                    Open the timesheet
                  </Link>
                  .
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">Date</th>
                        <th className="pb-2 pr-3 font-medium">Job</th>
                        <th className="pb-2 pr-3 text-right font-medium">Hours</th>
                        <th className="pb-2 pr-3 text-right font-medium">OT</th>
                        <th className="pb-2 pr-3 text-right font-medium">Rate</th>
                        <th className="pb-2 pr-3 text-right font-medium">Cost</th>
                        <th className="pb-2 pr-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3 tabular-nums">{e.work_date}</td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {e.job_id ? (jobRefs.get(e.job_id) ?? 'Job') : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{Number(e.hours).toFixed(1)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {Number(e.overtime_hours) > 0 ? Number(e.overtime_hours).toFixed(1) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                            {rand(Number(e.cost_rate_r))}
                          </td>
                          <td className="py-2 pr-3 text-right font-medium tabular-nums">
                            {rand(entryPayR(e))}
                          </td>
                          <td className="py-2 pr-3">
                            {e.status === 'running' ? (
                              <Badge variant="accent">On the clock</Badge>
                            ) : e.payslip_id ? (
                              <Badge variant="default">Paid</Badge>
                            ) : e.status === 'approved' ? (
                              <Badge variant="success">Approved</Badge>
                            ) : (
                              <Badge variant="warning">Submitted</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Rates are the ones captured on the day. Changing this person&apos;s rate does not
                    reprice hours already worked.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'documents' && (
        <DocumentsPanel
          staffId={person.id}
          staffName={person.full_name}
          documents={documents}
          today={today}
        />
      )}

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-sm font-semibold">Payslips</h2>
          {payslips.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payslips issued for {person.full_name} yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Reference</th>
                    <th className="pb-2 pr-3 font-medium">Period</th>
                    <th className="pb-2 pr-3 text-right font-medium">Hours</th>
                    <th className="pb-2 pr-3 text-right font-medium">Gross</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{p.reference}</td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {p.period_start} → {p.period_end}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {(Number(p.normal_hours) + Number(p.overtime_hours)).toFixed(1)}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">
                        {rand(Number(p.gross_pay_r))}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={p.status === 'paid' ? 'success' : 'default'}>
                          {p.status === 'paid' ? 'Paid' : 'Issued'}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/portal/employee/staff/payslips/${p.id}`}>
                            <FileText className="mr-1.5 h-4 w-4" />
                            Open
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
