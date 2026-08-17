'use client'

// The pay run. Each row is one person's unpaid hours and money for the period;
// ticking them and pressing Issue calls create_payslip() once per person.
//
// The RPC is the transaction boundary (migration 113) — the slip, its entries
// and its payments are claimed together or not at all. Issuing person-by-person
// means a mid-run failure leaves earlier slips valid and the rest untouched,
// which is recoverable; a half-written slip would not be.

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, FileText, Receipt, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { payslipReference, type PayPeriodType, type PayslipDraft } from '@/lib/staff/pay'
import { rand } from '../shared'

export interface PayrollCandidate {
  staffId: string
  name: string
  jobTitle: string | null
  payType: 'hourly' | 'piece'
  draft: PayslipDraft
}

interface RecentSlip {
  id: string
  reference: string
  staffId: string
  staffName: string
  periodStart: string
  periodEnd: string
  grossPayR: number
  deductionsR: number
  netPayR: number
  status: string
}

export function PayrollRun({
  periodType,
  periodStart,
  periodEnd,
  anchor,
  candidates,
  startSequence,
  recent,
}: {
  periodType: PayPeriodType
  periodStart: string
  periodEnd: string
  anchor: string
  candidates: PayrollCandidate[]
  startSequence: number
  recent: RecentSlip[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.filter((c) => c.draft.grossPayR > 0).map((c) => c.staffId)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const chosen = candidates.filter((c) => selected.has(c.staffId))
  // What actually leaves the bank account: gross less the advances these slips
  // recover. The gross is still on every row for anyone reconciling wages.
  const runTotal = chosen.reduce((sum, c) => sum + c.draft.netPayR, 0)
  const runDeductions = chosen.reduce((sum, c) => sum + c.draft.deductionsR, 0)

  function toggle(staffId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(staffId)) next.delete(staffId)
      else next.add(staffId)
      return next
    })
  }

  async function issue() {
    if (!chosen.length) return
    setBusy(true)
    setError(null)
    setDone(null)

    const supabase = createClient()
    let sequence = startSequence
    let issued = 0

    for (const c of chosen) {
      const { draft } = c
      const { error: rpcError } = await supabase.rpc('create_payslip', {
        p_staff_id: c.staffId,
        p_reference: payslipReference(periodEnd, sequence),
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_normal_hours: draft.normalHours,
        p_overtime_hours: draft.overtimeHours,
        p_hours_pay_r: draft.hoursPayR,
        p_piece_pay_r: draft.piecePayR,
        p_other_pay_r: draft.otherPayR,
        p_gross_pay_r: draft.grossPayR,
        p_lines: draft.lines,
        p_entry_ids: draft.entryIds,
        p_payment_ids: draft.paymentIds,
        p_deductions_r: draft.deductionsR,
        // Only what this slip could afford off each advance — the rest stays
        // unclaimed and turns up on the next run.
        p_recoveries: draft.deductions
          .filter((d) => d.appliedR > 0)
          .map((d) => ({ paymentId: d.paymentId, amountR: d.appliedR })),
      })

      if (rpcError) {
        setBusy(false)
        setError(
          issued > 0
            ? `${issued} payslip${issued === 1 ? '' : 's'} issued, then ${c.name} failed: ${rpcError.message}`
            : `${c.name}: ${rpcError.message}`,
        )
        router.refresh()
        return
      }
      sequence += 1
      issued += 1
    }

    setBusy(false)
    setDone(`${issued} payslip${issued === 1 ? '' : 's'} issued.`)
    router.refresh()
  }

  const periodLink = (type: string, on: string) =>
    `/portal/employee/staff/payroll?period=${type}${on ? `&on=${on}` : ''}`

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Pay period" htmlFor="pr-type">
              <Select
                id="pr-type"
                value={periodType}
                onChange={(e) => router.push(periodLink(e.target.value, anchor))}
              >
                <option value="weekly">Weekly (Mon–Sun)</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </FormField>
            <FormField label="Any date in the period" htmlFor="pr-on">
              <Input
                id="pr-on"
                type="date"
                value={anchor}
                onChange={(e) => router.push(periodLink(periodType, e.target.value))}
              />
            </FormField>
            <div className="sm:col-span-2 flex items-end">
              <div className="text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Paying for</p>
                <p className="font-semibold tabular-nums">
                  {periodStart} → {periodEnd}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Unpaid this period</h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                Run total{' '}
                <span className="font-semibold text-foreground tabular-nums">{rand(runTotal)}</span>
                {runDeductions > 0 && (
                  <span className="ml-1 text-xs">after {rand(runDeductions)} recovered</span>
                )}
              </span>
              <Button type="button" onClick={issue} disabled={busy || chosen.length === 0}>
                <Receipt className="mr-2 h-4 w-4" />
                {busy ? 'Issuing…' : `Issue ${chosen.length} payslip${chosen.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {done && (
            <div className="mb-4 rounded-md border border-success/40 bg-success/5 p-3 text-sm text-success">
              {done}
            </div>
          )}

          {candidates.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Wallet className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="mb-1 font-medium text-foreground">Nothing to pay in this period</p>
              <p>
                Either the hours aren&apos;t captured yet, or this period has already been paid.{' '}
                <Link href="/portal/employee/staff/timesheet" className="text-primary hover:underline">
                  Open the timesheet
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Pay</th>
                    <th className="pb-2 pr-3 font-medium">Person</th>
                    <th className="pb-2 pr-3 text-right font-medium">Hours</th>
                    <th className="pb-2 pr-3 text-right font-medium">OT</th>
                    <th className="pb-2 pr-3 text-right font-medium">Hours pay</th>
                    <th className="pb-2 pr-3 text-right font-medium">Job work</th>
                    <th className="pb-2 pr-3 text-right font-medium">Other</th>
                    <th className="pb-2 pr-3 text-right font-medium">Gross</th>
                    <th className="pb-2 pr-3 text-right font-medium">Advances</th>
                    <th className="pb-2 pr-3 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.staffId} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={selected.has(c.staffId)}
                          onChange={() => toggle(c.staffId)}
                          disabled={c.draft.grossPayR <= 0}
                          aria-label={`Pay ${c.name}`}
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/portal/employee/staff/${c.staffId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.name}
                        </Link>
                        {c.jobTitle && (
                          <div className="text-xs text-muted-foreground">{c.jobTitle}</div>
                        )}
                        {c.draft.carryForwardR > 0 && (
                          <div className="text-xs text-warning">
                            {rand(c.draft.carryForwardR)} still owing after this slip — carried to
                            the next run
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {c.draft.normalHours.toFixed(1)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {c.draft.overtimeHours > 0 ? c.draft.overtimeHours.toFixed(1) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{rand(c.draft.hoursPayR)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {c.draft.piecePayR > 0 ? rand(c.draft.piecePayR) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {c.draft.otherPayR > 0 ? rand(c.draft.otherPayR) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {c.draft.grossPayR > 0 ? (
                          rand(c.draft.grossPayR)
                        ) : (
                          <span className="text-warning" title="Hours are recorded but the rate is R0">
                            R0.00
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {c.draft.deductionsR > 0 ? (
                          <span className="text-destructive">−{rand(c.draft.deductionsR)}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                        {rand(c.draft.netPayR)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Net is what you pay out: gross earnings less any advances and deductions still
                owing, oldest first. Never below zero — a balance too big for the period carries to
                the next run. PAYE, UIF and SDL are not calculated.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-sm font-semibold">Payslips issued</h2>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payslips yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Reference</th>
                    <th className="pb-2 pr-3 font-medium">Person</th>
                    <th className="pb-2 pr-3 font-medium">Period</th>
                    <th className="pb-2 pr-3 text-right font-medium">Gross</th>
                    <th className="pb-2 pr-3 text-right font-medium">Net</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{p.reference}</td>
                      <td className="py-2 pr-3 font-medium">{p.staffName}</td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {p.periodStart} → {p.periodEnd}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{rand(p.grossPayR)}</td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">
                        {rand(p.netPayR)}
                        {p.deductionsR > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            after −{rand(p.deductionsR)}
                          </span>
                        )}
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
    </>
  )
}
