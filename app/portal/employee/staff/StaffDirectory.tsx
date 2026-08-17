'use client'

// The team table, plus the add/edit form. Writes go straight through the
// browser Supabase client (RLS: managers and admins only) — the house pattern
// for portal CRUD, same as the calendar's EventDialog.

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { Pencil, Plus, Timer, UserPlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { elapsed, rand, type StaffRow } from './shared'

interface Draft {
  id: string | null
  full_name: string
  job_title: string
  phone: string
  email: string
  employee_no: string
  pay_type: 'hourly' | 'piece'
  cost_rate_r: string
  overtime_multiplier: string
  employed_from: string
  active: boolean
  notes: string
}

function draftFrom(row?: StaffRow): Draft {
  return {
    id: row?.id ?? null,
    full_name: row?.full_name ?? '',
    job_title: row?.job_title ?? '',
    phone: row?.phone ?? '',
    email: row?.email ?? '',
    employee_no: row?.employee_no ?? '',
    pay_type: row?.pay_type ?? 'hourly',
    cost_rate_r: row ? String(row.cost_rate_r) : '',
    overtime_multiplier: row ? String(row.overtime_multiplier) : '1.5',
    employed_from: row?.employed_from ?? '',
    active: row?.active ?? true,
    notes: row?.notes ?? '',
  }
}

const numOrZero = (v: string) => Math.max(0, Number(v) || 0)

export function StaffDirectory({ rows }: { rows: StaffRow[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const visible = rows.filter((r) => showInactive || r.active)
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  async function save() {
    if (!draft) return
    if (!draft.full_name.trim()) {
      setError('A name is required')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      full_name: draft.full_name.trim(),
      job_title: draft.job_title.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      employee_no: draft.employee_no.trim() || null,
      pay_type: draft.pay_type,
      cost_rate_r: numOrZero(draft.cost_rate_r),
      // Floored at 1: an overtime rate below the normal rate is never right,
      // and a stored 0 would pay overtime hours at nothing.
      overtime_multiplier: Math.max(1, Number(draft.overtime_multiplier) || 1),
      employed_from: draft.employed_from || null,
      active: draft.active,
      notes: draft.notes.trim() || null,
    }

    const supabase = createClient()
    const { error: dbError } = draft.id
      ? await supabase.from('staff').update(payload).eq('id', draft.id)
      : await supabase.from('staff').insert(payload)

    setSaving(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    setDraft(null)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">The team</h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Show past staff
            </label>
            <Button type="button" size="sm" onClick={() => setDraft(draftFrom())}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add person
            </Button>
          </div>
        </div>

        {draft && (
          <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary">
                {draft.id ? 'Edit person' : 'New person'}
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Full name" htmlFor="staff-name" required>
                <Input
                  id="staff-name"
                  value={draft.full_name}
                  onChange={(e) => set({ full_name: e.target.value })}
                  placeholder="Sipho Ndlovu"
                />
              </FormField>
              <FormField label="Job title" htmlFor="staff-title">
                <Input
                  id="staff-title"
                  value={draft.job_title}
                  onChange={(e) => set({ job_title: e.target.value })}
                  placeholder="Solar technician"
                />
              </FormField>
              <FormField label="Employee no." htmlFor="staff-no">
                <Input
                  id="staff-no"
                  value={draft.employee_no}
                  onChange={(e) => set({ employee_no: e.target.value })}
                  placeholder="EMP-004"
                />
              </FormField>
              <FormField label="Phone" htmlFor="staff-phone">
                <Input
                  id="staff-phone"
                  value={draft.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                  placeholder="082 123 4567"
                />
              </FormField>
              <FormField label="Email" htmlFor="staff-email">
                <Input
                  id="staff-email"
                  type="email"
                  value={draft.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </FormField>
              <FormField label="Started" htmlFor="staff-from">
                <Input
                  id="staff-from"
                  type="date"
                  value={draft.employed_from}
                  onChange={(e) => set({ employed_from: e.target.value })}
                />
              </FormField>

              <FormField
                label="Paid by"
                htmlFor="staff-paytype"
                hint={draft.pay_type === 'piece' ? 'Pay comes from agreed per-job amounts' : 'Pay comes from hours worked'}
              >
                <Select
                  id="staff-paytype"
                  value={draft.pay_type}
                  onChange={(e) => set({ pay_type: e.target.value as Draft['pay_type'] })}
                >
                  <option value="hourly">The hour</option>
                  <option value="piece">The job (piece work)</option>
                </Select>
              </FormField>
              <FormField
                label="Cost rate"
                htmlFor="staff-rate"
                hint="What an hour of this person costs you — not what a customer is billed."
              >
                <Input
                  id="staff-rate"
                  inputMode="decimal"
                  leadingText="R"
                  trailingText="/hr"
                  value={draft.cost_rate_r}
                  onChange={(e) => set({ cost_rate_r: e.target.value })}
                  placeholder="150"
                />
              </FormField>
              <FormField label="Overtime" htmlFor="staff-ot" hint="Multiplier on the cost rate.">
                <Input
                  id="staff-ot"
                  inputMode="decimal"
                  trailingText="×"
                  value={draft.overtime_multiplier}
                  onChange={(e) => set({ overtime_multiplier: e.target.value })}
                />
              </FormField>

              <FormField label="Notes" htmlFor="staff-notes" className="sm:col-span-2 lg:col-span-3">
                <Textarea
                  id="staff-notes"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                  placeholder="Qualifications, licence, anything worth remembering."
                />
              </FormField>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => set({ active: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Currently employed
              </label>
              <div className="flex items-center gap-2">
                {error && <span className="text-xs text-destructive">{error}</span>}
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add person'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Plus className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="mb-1 font-medium text-foreground">Nobody on the team yet</p>
            <p>Add each person who works for you — with or without a portal login.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Name</th>
                  <th className="pb-2 pr-3 font-medium">Paid by</th>
                  <th className="pb-2 pr-3 text-right font-medium">Cost rate</th>
                  <th className="pb-2 pr-3 text-right font-medium">Hours this week</th>
                  <th className="pb-2 pr-3 text-right font-medium">Wages this week</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/portal/employee/staff/${row.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.full_name}
                      </Link>
                      {row.job_title && (
                        <div className="text-xs text-muted-foreground">{row.job_title}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {row.pay_type === 'piece' ? 'The job' : 'The hour'}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {row.cost_rate_r > 0 ? (
                        `${rand(row.cost_rate_r)}/hr`
                      ) : (
                        <span className="text-warning">not set</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {row.weekHours > 0 ? row.weekHours.toFixed(1) : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums">
                      {row.weekPayR > 0 ? rand(row.weekPayR) : '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.onClockSince ? (
                        <Badge variant="success" className="gap-1">
                          <Timer className="h-3 w-3" />
                          On the clock · {elapsed(row.onClockSince)}
                        </Badge>
                      ) : row.active ? (
                        <Badge variant="outline">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Past staff</Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraft(draftFrom(row))}
                      >
                        <Pencil className="h-4 w-4" />
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
  )
}
