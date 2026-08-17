import type { Metadata } from 'next'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import {
  loadJobRefs,
  loadOutstandingDeductions,
  loadPayslips,
  loadPeriod,
  loadStaff,
  nextPayslipSequence,
} from '@/lib/staff/server'
import { buildPayslipDraft, isEarningKind, payPeriod, type PayPeriodType } from '@/lib/staff/pay'
import { PayrollRun, type PayrollCandidate } from './PayrollRun'

export const metadata: Metadata = { title: 'Run pay' }
export const dynamic = 'force-dynamic'

const PERIOD_TYPES: PayPeriodType[] = ['weekly', 'fortnightly', 'monthly']

/**
 * A pay run: pick a period, review what each person is owed, issue payslips.
 *
 * Only UNPAID rows are candidates (loadPeriod(unpaidOnly)), so re-opening a
 * period that's already been paid shows nothing left to pay rather than
 * offering to pay it twice.
 *
 * Earnings come from the period window; advances and deductions do NOT. They
 * are pulled by outstanding balance instead, so an advance too big for the
 * week it was given in keeps coming back until it is paid off.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; on?: string }>
}) {
  await requireSection('staff')
  const supabase = await createClient()
  const sp = await searchParams

  const periodType = (PERIOD_TYPES as string[]).includes(sp.period ?? '')
    ? (sp.period as PayPeriodType)
    : 'weekly'
  const anchorRaw = sp.on && /^\d{4}-\d{2}-\d{2}$/.test(sp.on) ? new Date(`${sp.on}T00:00:00`) : new Date()
  const anchor = Number.isFinite(anchorRaw.getTime()) ? anchorRaw : new Date()
  const { start, end } = payPeriod(periodType, anchor)

  const staff = await loadStaff(supabase)
  const staffIds = staff.map((s) => s.id)
  const [period, outstanding] = await Promise.all([
    loadPeriod(supabase, start, end, { staffIds, unpaidOnly: true }),
    loadOutstandingDeductions(supabase, end, { staffIds }),
  ])
  const earnings = period.payments.filter((p) => isEarningKind(p.kind))

  const jobRefs = await loadJobRefs(supabase, [
    ...period.entries.map((e) => e.job_id).filter((id): id is string => !!id),
    ...earnings.map((p) => p.job_id).filter((id): id is string => !!id),
  ])

  const candidates: PayrollCandidate[] = staff
    .map((person) => {
      const draft = buildPayslipDraft(
        period.entries.filter((e) => e.staff_id === person.id),
        [
          ...earnings.filter((p) => p.staff_id === person.id),
          ...outstanding.filter((p) => p.staff_id === person.id),
        ],
        jobRefs,
      )
      return {
        staffId: person.id,
        name: person.full_name,
        jobTitle: person.job_title,
        payType: person.pay_type,
        draft,
      }
    })
    // Somebody with no unpaid hours and no unpaid money is not part of this
    // run — but a standing advance keeps them on it, so the balance stays
    // visible even in a week they did not work.
    .filter((c) => c.draft.grossPayR > 0 || c.draft.entryIds.length > 0 || c.draft.outstandingR > 0)

  const [sequence, recent] = await Promise.all([
    nextPayslipSequence(supabase, end),
    loadPayslips(supabase, { limit: 20 }),
  ])

  return (
    <PageShell width="wide">
      <PageHeader
        title="Run pay"
        icon={Wallet}
        description="Turn approved hours and agreed job amounts into payslips."
        actions={
          <Button asChild variant="outline">
            <Link href="/portal/employee/staff">Back to staff</Link>
          </Button>
        }
      />
      <PayrollRun
        periodType={periodType}
        periodStart={start}
        periodEnd={end}
        anchor={sp.on ?? ''}
        candidates={candidates}
        startSequence={sequence}
        recent={recent.map((p) => ({
          id: p.id,
          reference: p.reference,
          staffId: p.staff_id,
          staffName: staff.find((s) => s.id === p.staff_id)?.full_name ?? 'Unknown',
          periodStart: p.period_start,
          periodEnd: p.period_end,
          grossPayR: Number(p.gross_pay_r),
          deductionsR: Number(p.deductions_r),
          netPayR: Number(p.net_pay_r),
          status: p.status,
        }))}
      />
    </PageShell>
  )
}
