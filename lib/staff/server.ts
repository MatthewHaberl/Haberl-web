// ─────────────────────────────────────────────────────────────────────────────
// Staff data loading — the Supabase half of the staff/pay feature.
//
// The arithmetic lives in ./pay (pure, tested). This module only fetches and
// shapes; it never decides what anything is worth. Every query goes through the
// caller's RLS-scoped client, so a field worker calling these sees only their
// own rows — the section guard is the outer fence, RLS is the inner one.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Payslip, Staff, StaffPayment, TimeEntry } from '@/types/database'
import { totalPay, type PayTotals } from './pay'

/** Columns the list views need — everything except the audit trail. */
const STAFF_COLUMNS =
  'id, user_id, full_name, employee_no, job_title, phone, email, pay_type, ' +
  'cost_rate_r, overtime_multiplier, employed_from, employed_to, active, notes, created_at, updated_at'

const ENTRY_COLUMNS =
  'id, staff_id, job_id, work_date, started_at, ended_at, break_minutes, hours, overtime_hours, ' +
  'category, notes, cost_rate_r, overtime_multiplier, source, status, approved_at, payslip_id'

const PAYMENT_COLUMNS = 'id, staff_id, job_id, pay_date, kind, description, amount_r, payslip_id'

export async function loadStaff(
  supabase: SupabaseClient,
  opts: { includeInactive?: boolean } = {},
): Promise<Staff[]> {
  let q = supabase.from('staff').select(STAFF_COLUMNS).order('full_name')
  if (!opts.includeInactive) q = q.eq('active', true)
  const { data } = await q
  return (data ?? []) as unknown as Staff[]
}

/** The caller's own staff record, if they have one. Drives the clock widget. */
export async function loadMyStaff(supabase: SupabaseClient, userId: string): Promise<Staff | null> {
  const { data } = await supabase
    .from('staff')
    .select(STAFF_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as unknown as Staff) ?? null
}

/** The entry currently on the clock for this person, if any. */
export async function loadRunningEntry(
  supabase: SupabaseClient,
  staffId: string,
): Promise<TimeEntry | null> {
  const { data } = await supabase
    .from('time_entries')
    .select(ENTRY_COLUMNS)
    .eq('staff_id', staffId)
    .eq('status', 'running')
    .maybeSingle()
  return (data as unknown as TimeEntry) ?? null
}

export interface PeriodData {
  entries: TimeEntry[]
  payments: StaffPayment[]
}

/**
 * Every timesheet entry and payment inside an inclusive date window.
 *
 * `unpaidOnly` is what a pay run wants: rows not already claimed by a payslip.
 * Running clocks are always excluded — an open timer has no final hours yet,
 * and paying one would bank a half-finished day.
 */
export async function loadPeriod(
  supabase: SupabaseClient,
  start: string,
  end: string,
  opts: { staffIds?: string[]; unpaidOnly?: boolean } = {},
): Promise<PeriodData> {
  let entryQ = supabase
    .from('time_entries')
    .select(ENTRY_COLUMNS)
    .gte('work_date', start)
    .lte('work_date', end)
    .neq('status', 'running')
    .order('work_date')

  let paymentQ = supabase
    .from('staff_payments')
    .select(PAYMENT_COLUMNS)
    .gte('pay_date', start)
    .lte('pay_date', end)
    .order('pay_date')

  if (opts.staffIds?.length) {
    entryQ = entryQ.in('staff_id', opts.staffIds)
    paymentQ = paymentQ.in('staff_id', opts.staffIds)
  }
  if (opts.unpaidOnly) {
    entryQ = entryQ.is('payslip_id', null)
    paymentQ = paymentQ.is('payslip_id', null)
  }

  const [entries, payments] = await Promise.all([entryQ, paymentQ])
  return {
    entries: (entries.data ?? []) as unknown as TimeEntry[],
    payments: (payments.data ?? []) as unknown as StaffPayment[],
  }
}

/** Pay totals for one period, keyed by staff id. */
export function totalsByStaff(data: PeriodData, staffIds: string[]): Map<string, PayTotals> {
  const out = new Map<string, PayTotals>()
  for (const id of staffIds) {
    out.set(
      id,
      totalPay(
        data.entries.filter((e) => e.staff_id === id),
        data.payments.filter((p) => p.staff_id === id),
      ),
    )
  }
  return out
}

/** job_id → a human label, for timesheet pickers and payslip line references. */
export async function loadJobRefs(
  supabase: SupabaseClient,
  jobIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(jobIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const { data } = await supabase.from('jobs').select('id, title').in('id', ids)
  return new Map((data ?? []).map((j) => [j.id as string, (j.title as string) || 'Job']))
}

/** Jobs a timesheet can be booked against — open work, newest first. */
export async function loadBookableJobs(
  supabase: SupabaseClient,
): Promise<{ id: string; title: string }[]> {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_date')
    .neq('status', 'cancelled')
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .limit(200)
  return (data ?? []).map((j) => ({ id: j.id as string, title: (j.title as string) || 'Untitled job' }))
}

export async function loadPayslips(
  supabase: SupabaseClient,
  opts: { staffId?: string; limit?: number } = {},
): Promise<Payslip[]> {
  let q = supabase
    .from('payslips')
    .select('*')
    .order('period_end', { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.staffId) q = q.eq('staff_id', opts.staffId)
  const { data } = await q
  return (data ?? []) as unknown as Payslip[]
}

/**
 * Next payslip sequence for the month a period ends in — payslipReference()
 * turns it into PS-YYYYMM-NNN.
 */
export async function nextPayslipSequence(
  supabase: SupabaseClient,
  periodEnd: string,
): Promise<number> {
  const d = new Date(periodEnd)
  const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const monthEndIso = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`

  const { count } = await supabase
    .from('payslips')
    .select('id', { count: 'exact', head: true })
    .gte('period_end', monthStart)
    .lte('period_end', monthEndIso)

  return (count ?? 0) + 1
}
