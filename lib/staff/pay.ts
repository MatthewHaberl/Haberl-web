// ─────────────────────────────────────────────────────────────────────────────
// Staff pay — the arithmetic behind timesheets and payslips (migration 112).
//
// Pure module: no Supabase, no React. Same discipline as lib/quotes/scope.ts,
// so the numbers can be unit-tested without a database and reused on both
// server and client.
//
// Two rules govern everything here:
//
//   1. RATES ARE SNAPSHOTTED. Every time_entry carries the cost_rate_r and
//      overtime_multiplier it was captured at. Nothing in this module reads a
//      rate off the staff record when pricing an entry — giving someone a
//      raise must not silently reprice work already done.
//
//   2. PAY IS GROSS. gross = hours pay + piece work + other earnings.
//      Deductions (PAYE/UIF/SDL) are modelled but always zero today, so
//      net == gross. When the statutory pass lands, only `deductionsR` needs
//      to start returning a number.
// ─────────────────────────────────────────────────────────────────────────────

export type StaffPayType = 'hourly' | 'piece'
export type TimeEntryStatus = 'running' | 'submitted' | 'approved' | 'paid'
export type TimeEntrySource = 'manual' | 'clock'
export type TimeEntryCategory = 'work' | 'travel' | 'workshop' | 'standby' | 'other'
export type StaffPaymentKind = 'piece' | 'bonus' | 'allowance' | 'deduction' | 'advance'
export type PayslipStatus = 'draft' | 'finalised' | 'paid'

/** The subset of a time_entries row the pay maths needs. */
export interface PayableEntry {
  id: string
  work_date: string
  job_id?: string | null
  hours: number
  overtime_hours: number
  cost_rate_r: number
  overtime_multiplier: number
  category?: TimeEntryCategory
  status?: TimeEntryStatus
  notes?: string | null
}

/** The subset of a staff_payments row the pay maths needs. */
export interface PayableAmount {
  id: string
  pay_date: string
  kind: StaffPaymentKind
  description: string
  amount_r: number
  job_id?: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Finite, non-negative number or the fallback — same guard style as scope.ts. */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback
}

/**
 * Overtime multiplier, floored at 1.
 *
 * num() would accept a stored 0 as a legitimate value and pay the overtime
 * hours at R0 — silently free labour. An overtime rate below the normal rate
 * is never correct, so anything under 1 reads as 1.
 */
function multiplier(v: unknown): number {
  const n = num(v, 1)
  return n >= 1 ? n : 1
}

// ── Hours ────────────────────────────────────────────────────────────────────

/**
 * Clock in → clock out → hours on the card, less unpaid break.
 *
 * Rounded to 2dp of an hour (36 seconds). A clock that ran shorter than its
 * break returns 0 rather than a negative day.
 */
export function hoursFromClock(
  startedAt: string | Date,
  endedAt: string | Date,
  breakMinutes = 0,
): number {
  const start = new Date(startedAt).getTime()
  const end = new Date(endedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  const worked = (end - start) / 3_600_000 - num(breakMinutes) / 60
  return worked > 0 ? round2(worked) : 0
}

/**
 * Split a day's hours into normal and overtime at a daily threshold.
 *
 * BCEA ordinary time is 9 hours/day on a five-day week, but Matthew's crew
 * works a variable week — so the threshold is a parameter, not a constant, and
 * callers that don't want an automatic split simply pass Infinity.
 */
export function splitOvertime(hours: number, dailyThreshold = 9): { normal: number; overtime: number } {
  const h = num(hours)
  if (!Number.isFinite(dailyThreshold) || h <= dailyThreshold) return { normal: round2(h), overtime: 0 }
  return { normal: round2(dailyThreshold), overtime: round2(h - dailyThreshold) }
}

// ── What one entry is worth ──────────────────────────────────────────────────

/**
 * What a single timesheet entry costs in wages.
 *
 * Uses the entry's own snapshotted rate — see rule 1 in the header.
 */
export function entryPayR(entry: PayableEntry): number {
  const rate = num(entry.cost_rate_r)
  return round2(num(entry.hours) * rate + num(entry.overtime_hours) * rate * multiplier(entry.overtime_multiplier))
}

/** Total hours (normal + overtime) on an entry — for "hours worked" readouts. */
export function entryHours(entry: PayableEntry): number {
  return round2(num(entry.hours) + num(entry.overtime_hours))
}

// ── Period totals ────────────────────────────────────────────────────────────

export interface PayTotals {
  normalHours: number
  overtimeHours: number
  /** Wages from hours worked. */
  hoursPayR: number
  /** Agreed per-job amounts (kind 'piece'). */
  piecePayR: number
  /** Bonuses and allowances. */
  otherPayR: number
  grossPayR: number
  /**
   * Always 0 today. Advances and deductions are recorded (so the history is
   * there) but not subtracted until the statutory pass — subtracting them now
   * would produce a "net pay" that isn't a legal net.
   */
  deductionsR: number
  netPayR: number
  /** Recorded-but-not-yet-applied advances/deductions, surfaced as a note. */
  pendingDeductionsR: number
}

export function emptyTotals(): PayTotals {
  return {
    normalHours: 0,
    overtimeHours: 0,
    hoursPayR: 0,
    piecePayR: 0,
    otherPayR: 0,
    grossPayR: 0,
    deductionsR: 0,
    netPayR: 0,
    pendingDeductionsR: 0,
  }
}

/** Roll a set of entries and payments into one period's pay. */
export function totalPay(entries: PayableEntry[], payments: PayableAmount[] = []): PayTotals {
  const t = emptyTotals()

  for (const e of entries) {
    t.normalHours += num(e.hours)
    t.overtimeHours += num(e.overtime_hours)
    t.hoursPayR += entryPayR(e)
  }

  for (const p of payments) {
    const amount = num(p.amount_r)
    if (p.kind === 'piece') t.piecePayR += amount
    else if (p.kind === 'bonus' || p.kind === 'allowance') t.otherPayR += amount
    else t.pendingDeductionsR += amount // 'deduction' | 'advance' — recorded, not applied
  }

  t.normalHours = round2(t.normalHours)
  t.overtimeHours = round2(t.overtimeHours)
  t.hoursPayR = round2(t.hoursPayR)
  t.piecePayR = round2(t.piecePayR)
  t.otherPayR = round2(t.otherPayR)
  t.pendingDeductionsR = round2(t.pendingDeductionsR)
  t.grossPayR = round2(t.hoursPayR + t.piecePayR + t.otherPayR)
  t.deductionsR = 0
  t.netPayR = round2(t.grossPayR - t.deductionsR)

  return t
}

// ── Payslip snapshot ─────────────────────────────────────────────────────────

/**
 * One frozen line on a payslip. Written into payslips.lines at finalise so the
 * document never changes, even if the underlying timesheet is later corrected.
 */
export interface PayslipLine {
  kind: 'hours' | 'overtime' | 'piece' | 'bonus' | 'allowance'
  date: string
  description: string
  /** Hours for time lines, 1 for money lines. */
  qty: number
  unit: 'hr' | 'ea'
  rateR: number
  amountR: number
  jobRef?: string | null
}

export interface PayslipDraft extends PayTotals {
  lines: PayslipLine[]
  entryIds: string[]
  paymentIds: string[]
}

const KIND_LABEL: Record<StaffPaymentKind, string> = {
  piece: 'Job work',
  bonus: 'Bonus',
  allowance: 'Allowance',
  deduction: 'Deduction',
  advance: 'Advance',
}

const CATEGORY_LABEL: Record<TimeEntryCategory, string> = {
  work: 'Hours worked',
  travel: 'Travel',
  workshop: 'Workshop',
  standby: 'Standby',
  other: 'Other',
}

/**
 * Build the full payslip picture for one person over one period: the totals
 * plus a line for every timesheet entry and payment that fed them, so the slip
 * shows its own working. `jobRefs` maps job_id → a human title.
 */
export function buildPayslipDraft(
  entries: PayableEntry[],
  payments: PayableAmount[] = [],
  jobRefs: Map<string, string> = new Map(),
): PayslipDraft {
  const totals = totalPay(entries, payments)
  const lines: PayslipLine[] = []

  const byDate = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date))
  for (const e of byDate) {
    const rate = num(e.cost_rate_r)
    const job = e.job_id ? jobRefs.get(e.job_id) ?? null : null
    if (num(e.hours) > 0) {
      lines.push({
        kind: 'hours',
        date: e.work_date,
        description: CATEGORY_LABEL[e.category ?? 'work'],
        qty: round2(num(e.hours)),
        unit: 'hr',
        rateR: rate,
        amountR: round2(num(e.hours) * rate),
        jobRef: job,
      })
    }
    if (num(e.overtime_hours) > 0) {
      const otRate = round2(rate * multiplier(e.overtime_multiplier))
      lines.push({
        kind: 'overtime',
        date: e.work_date,
        description: `Overtime (${multiplier(e.overtime_multiplier)}×)`,
        qty: round2(num(e.overtime_hours)),
        unit: 'hr',
        rateR: otRate,
        amountR: round2(num(e.overtime_hours) * otRate),
        jobRef: job,
      })
    }
  }

  // Advances/deductions are deliberately absent: they are not applied yet, and
  // printing them on a slip that doesn't subtract them would misrepresent pay.
  const earnings = [...payments]
    .filter((p) => p.kind === 'piece' || p.kind === 'bonus' || p.kind === 'allowance')
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date))
  for (const p of earnings) {
    lines.push({
      kind: p.kind as 'piece' | 'bonus' | 'allowance',
      date: p.pay_date,
      description: p.description || KIND_LABEL[p.kind],
      qty: 1,
      unit: 'ea',
      rateR: round2(num(p.amount_r)),
      amountR: round2(num(p.amount_r)),
      jobRef: p.job_id ? jobRefs.get(p.job_id) ?? null : null,
    })
  }

  return {
    ...totals,
    lines,
    entryIds: entries.map((e) => e.id),
    paymentIds: payments.map((p) => p.id),
  }
}

// ── References ───────────────────────────────────────────────────────────────

/**
 * Payslip reference: PS-YYYYMM-NNN, scoped to the period's month.
 * `sequence` is the count of slips already issued that month, plus one.
 */
export function payslipReference(periodEnd: string, sequence: number): string {
  const d = new Date(periodEnd)
  const stamp = Number.isFinite(d.getTime())
    ? `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    : '000000'
  return `PS-${stamp}-${String(Math.max(1, Math.trunc(sequence))).padStart(3, '0')}`
}

// ── Pay-period helpers ───────────────────────────────────────────────────────

export type PayPeriodType = 'weekly' | 'fortnightly' | 'monthly'

/** Local YYYY-MM-DD — never toISOString(), which shifts a SAST morning back a day. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday of the week containing `d` (SA weeks run Mon–Sun). */
export function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (out.getDay() + 6) % 7 // Mon = 0
  out.setDate(out.getDate() - dow)
  return out
}

/** The pay period containing `on`, as inclusive ISO dates. */
export function payPeriod(type: PayPeriodType, on: Date): { start: string; end: string } {
  if (type === 'monthly') {
    const start = new Date(on.getFullYear(), on.getMonth(), 1)
    const end = new Date(on.getFullYear(), on.getMonth() + 1, 0)
    return { start: isoDate(start), end: isoDate(end) }
  }
  const start = weekStart(on)
  const end = new Date(start)
  end.setDate(end.getDate() + (type === 'fortnightly' ? 13 : 6))
  return { start: isoDate(start), end: isoDate(end) }
}

/** The seven (or fourteen) dates in a period — the timesheet grid's columns. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = []
  const from = new Date(`${start}T00:00:00`)
  const to = new Date(`${end}T00:00:00`)
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return out
  for (let d = new Date(from); d <= to && out.length < 62; d.setDate(d.getDate() + 1)) {
    out.push(isoDate(d))
  }
  return out
}
