'use client'

// Money that isn't hours: piece work agreed per job, bonuses, allowances — and
// advances, which are RECORDED here but not deducted from any payslip yet. The
// row is honest about that rather than implying a net-pay effect it doesn't have.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { StaffPaymentKind } from '@/lib/staff/pay'
import { rand } from '../shared'

interface PaymentRow {
  id: string
  pay_date: string
  kind: StaffPaymentKind
  description: string
  amount_r: number
  job_id: string | null
  jobRef: string | null
  /** Already claimed by a payslip — locked against edits. */
  locked: boolean
}

const KINDS: { value: StaffPaymentKind; label: string; hint: string }[] = [
  { value: 'piece', label: 'Job work', hint: 'An agreed amount for finishing a job.' },
  { value: 'bonus', label: 'Bonus', hint: 'Added to gross pay.' },
  { value: 'allowance', label: 'Allowance', hint: 'Travel, tools, phone — added to gross pay.' },
  { value: 'advance', label: 'Advance', hint: 'Recorded only. Not deducted from a payslip yet.' },
  { value: 'deduction', label: 'Deduction', hint: 'Recorded only. Not subtracted from a payslip yet.' },
]

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PaymentsPanel({
  staffId,
  staffName,
  jobs,
  payments,
  kindLabels,
}: {
  staffId: string
  staffName: string
  jobs: { id: string; title: string }[]
  payments: PaymentRow[]
  kindLabels: Record<string, string>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    pay_date: today(),
    kind: 'piece' as StaffPaymentKind,
    description: '',
    amount_r: '',
    job_id: '',
  })

  const isEarning = form.kind === 'piece' || form.kind === 'bonus' || form.kind === 'allowance'

  async function add() {
    const amount = Math.max(0, Number(form.amount_r) || 0)
    if (amount <= 0) {
      setError('Enter an amount')
      return
    }
    setBusy(true)
    setError(null)

    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const { error: dbError } = await supabase.from('staff_payments').insert({
      staff_id: staffId,
      job_id: form.job_id || null,
      pay_date: form.pay_date,
      kind: form.kind,
      description: form.description.trim(),
      amount_r: amount,
      created_by: auth.user?.id ?? null,
    })

    setBusy(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    setForm({ ...form, description: '', amount_r: '', job_id: '' })
    router.refresh()
  }

  async function remove(row: PaymentRow) {
    if (row.locked) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('staff_payments').delete().eq('id', row.id)
    setBusy(false)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Job work &amp; other pay</h2>
            <p className="text-xs text-muted-foreground">
              Amounts agreed per job, plus bonuses and allowances — added to {staffName}&apos;s gross pay.
            </p>
          </div>
          <Button type="button" size="sm" variant={open ? 'outline' : 'default'} onClick={() => setOpen(!open)}>
            <Plus className="mr-2 h-4 w-4" />
            {open ? 'Close' : 'Add'}
          </Button>
        </div>

        {open && (
          <div className="mb-6 grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <FormField label="Date" htmlFor="pay-date">
              <Input
                id="pay-date"
                type="date"
                value={form.pay_date}
                onChange={(e) => setForm({ ...form, pay_date: e.target.value })}
              />
            </FormField>
            <FormField
              label="Type"
              htmlFor="pay-kind"
              hint={KINDS.find((k) => k.value === form.kind)?.hint}
              className="lg:col-span-2"
            >
              <Select
                id="pay-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as StaffPaymentKind })}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Amount" htmlFor="pay-amount">
              <Input
                id="pay-amount"
                inputMode="decimal"
                leadingText="R"
                value={form.amount_r}
                onChange={(e) => setForm({ ...form, amount_r: e.target.value })}
                placeholder="1500"
              />
            </FormField>
            <FormField label="Job" htmlFor="pay-job" className="lg:col-span-2">
              <Select
                id="pay-job"
                value={form.job_id}
                onChange={(e) => setForm({ ...form, job_id: e.target.value })}
              >
                <option value="">No job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Description" htmlFor="pay-desc" className="lg:col-span-5">
              <Input
                id="pay-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this is for"
              />
            </FormField>
            <div className="flex items-end justify-end gap-2 lg:col-span-1">
              <Button type="button" onClick={add} disabled={busy} className="w-full">
                {busy ? 'Saving…' : 'Add'}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive lg:col-span-6">{error}</p>}
            {!isEarning && (
              <p className="text-xs text-warning lg:col-span-6">
                Advances and deductions are stored for your records only — payslips currently show
                gross pay and will not subtract this.
              </p>
            )}
          </div>
        )}

        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing recorded in the last 90 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Description</th>
                  <th className="pb-2 pr-3 font-medium">Job</th>
                  <th className="pb-2 pr-3 text-right font-medium">Amount</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const counts = p.kind === 'piece' || p.kind === 'bonus' || p.kind === 'allowance'
                  return (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 tabular-nums">{p.pay_date}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={counts ? 'success' : 'outline'}>
                          {kindLabels[p.kind] ?? p.kind}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{p.description || '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{p.jobRef ?? '—'}</td>
                      <td
                        className={`py-2 pr-3 text-right font-medium tabular-nums ${
                          counts ? '' : 'text-muted-foreground'
                        }`}
                      >
                        {rand(p.amount_r)}
                      </td>
                      <td className="py-2 text-right">
                        {p.locked ? (
                          <span title="On a payslip">
                            <Lock className="ml-auto h-4 w-4 text-muted-foreground" />
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(p)}
                            disabled={busy}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
