import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText, HardHat } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { loadBookableJobs, loadJobRefs, loadPayslips } from '@/lib/staff/server'
import { entryPayR, payPeriod, totalPay } from '@/lib/staff/pay'
import type { Staff, StaffPayment, TimeEntry } from '@/types/database'
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

/**
 * One person: what they cost, what they've worked, what they've been paid.
 *
 * Scoped to the last 90 days of detail — long enough to answer "was last month
 * right", short enough that the page stays a page. Payslips are the permanent
 * record beyond that.
 */
export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('staff')
  const { id } = await params
  const supabase = await createClient()

  const { data: row } = await supabase.from('staff').select('*').eq('id', id).maybeSingle()
  if (!row) notFound()
  const person = row as unknown as Staff

  const since = new Date()
  since.setDate(since.getDate() - 90)
  const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`

  const [entriesRes, paymentsRes, payslips, jobs] = await Promise.all([
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
  ])

  const entries = (entriesRes.data ?? []) as unknown as TimeEntry[]
  const payments = (paymentsRes.data ?? []) as unknown as StaffPayment[]
  const jobRefs = await loadJobRefs(supabase, entries.map((e) => e.job_id).filter((j): j is string => !!j))

  const week = payPeriod('weekly', new Date())
  const weekTotals = totalPay(
    entries.filter((e) => e.work_date >= week.start && e.work_date <= week.end && e.status !== 'running'),
    payments.filter((p) => p.pay_date >= week.start && p.pay_date <= week.end),
  )
  const unpaid = totalPay(
    entries.filter((e) => !e.payslip_id && e.status !== 'running'),
    payments.filter((p) => !p.payslip_id),
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
            <p className="text-xl font-bold text-primary">{rand(unpaid.grossPayR)}</p>
            <p className="text-xs text-muted-foreground">
              {(unpaid.normalHours + unpaid.overtimeHours).toFixed(1)} hr not yet on a payslip
            </p>
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
          locked: !!p.payslip_id,
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
