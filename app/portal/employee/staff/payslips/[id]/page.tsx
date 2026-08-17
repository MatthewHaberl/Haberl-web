import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { renderPayslipHtml, type PayslipDocument } from '@/lib/staff/render-payslip'
import type { PayslipLine } from '@/lib/staff/pay'
import type { Payslip, Staff } from '@/types/database'
import { PayslipActions } from './PayslipActions'

export const metadata: Metadata = { title: 'Payslip' }
export const dynamic = 'force-dynamic'

/**
 * One payslip, exactly as it will print.
 *
 * The preview and the printed page come from the SAME renderer — the on-screen
 * document IS the document. Everything shown is read from the slip's frozen
 * `lines` snapshot, never recomputed from the timesheet, so a correction made
 * next week cannot alter a slip already handed over.
 */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('staff')
  const { id } = await params
  const supabase = await createClient()

  const { data: slipRow } = await supabase.from('payslips').select('*').eq('id', id).maybeSingle()
  if (!slipRow) notFound()
  const slip = slipRow as unknown as Payslip

  const [{ data: staffRow }, { data: settings }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, full_name, employee_no, job_title')
      .eq('id', slip.staff_id)
      .maybeSingle(),
    supabase
      .from('company_settings')
      .select('company_name, contact_email, contact_phone')
      .maybeSingle(),
  ])
  const person = (staffRow as unknown as Staff) ?? null

  const doc: PayslipDocument = {
    reference: slip.reference,
    periodStart: slip.period_start,
    periodEnd: slip.period_end,
    issuedAt: slip.created_at.slice(0, 10),
    employeeName: person?.full_name ?? 'Unknown',
    employeeNo: person?.employee_no ?? null,
    jobTitle: person?.job_title ?? null,
    companyName: settings?.company_name ?? 'Haberl Electrical & Solar',
    companyEmail: settings?.contact_email ?? null,
    companyPhone: settings?.contact_phone ?? null,
    lines: (slip.lines ?? []) as PayslipLine[],
    normalHours: Number(slip.normal_hours),
    overtimeHours: Number(slip.overtime_hours),
    hoursPayR: Number(slip.hours_pay_r),
    piecePayR: Number(slip.piece_pay_r),
    otherPayR: Number(slip.other_pay_r),
    grossPayR: Number(slip.gross_pay_r),
    deductionsR: Number(slip.deductions_r),
    netPayR: Number(slip.net_pay_r),
    notes: slip.notes,
  }

  return (
    <PageShell width="content">
      <PageHeader
        title={`Payslip ${slip.reference}`}
        icon={FileText}
        description={`${doc.employeeName} · ${slip.period_start} → ${slip.period_end}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/portal/employee/staff/${slip.staff_id}`}>{doc.employeeName}</Link>
            </Button>
            <PayslipActions
              payslipId={slip.id}
              status={slip.status}
              printHtml={renderPayslipHtml(doc, { autoPrint: true })}
            />
          </>
        }
      />

      {/* The document itself, in an isolated frame so its print stylesheet
          cannot collide with the portal's Tailwind layer. */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <iframe
          title={`Payslip ${slip.reference}`}
          srcDoc={renderPayslipHtml(doc)}
          className="h-[1180px] w-full border-0"
        />
      </div>
    </PageShell>
  )
}
