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
//   2. EARNINGS FIRST, THEN WHAT WAS ALREADY HANDED OVER. Gross is hours pay
//      plus piece work plus bonuses and allowances. Advances and deductions
//      are then recovered out of that gross — oldest first, and never past
//      zero, because a payslip cannot ask someone for money. An advance
//      bigger than the period leaves a balance, and that balance carries to
//      the next run rather than being written off.
//
//      PAYE/UIF/SDL remain out of scope by Matthew's decision, so `netPayR`
//      is "gross less what you were already given", not a statutory net.
// ─────────────────────────────────────────────────────────────────────────────

export type StaffPayType = 'hourly' | 'piece'
export type TimeEntryStatus = 'running' | 'submitted' | 'approved' | 'paid'
export type TimeEntrySource = 'manual' | 'clock' | 'crew'
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
  /**
   * Advances and deductions only: how much of this row earlier payslips have
   * already recovered. A R2 000 advance against a R1 200 week comes back next
   * week as amount_r 2000, recovered_r 1200 — R800 still to find.
   */
  recovered_r?: number
}

/** Money that adds to gross pay, as opposed to money recovered out of it. */
export function isEarningKind(kind: StaffPaymentKind): boolean {
  return kind === 'piece' || kind === 'bonus' || kind === 'allowance'
}

const round2 = (n: number) => Math.round(n * 100) / 100

const KIND_LABEL: Record<StaffPaymentKind, string> = {
  piece: 'Job work',
  bonus: 'Bonus',
  allowance: 'Allowance',
  deduction: 'Deduction',
  advance: 'Advance',
}

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

// ── Times of day on the card ─────────────────────────────────────────────────
//
// started_at / ended_at are absolute timestamps: the clock writes them, and a
// manager edits them afterwards as plain "07:00" / "16:30". Both directions go
// through SAST explicitly rather than the machine's local zone — Vercel runs in
// UTC and the crew does not, so a browser-local reading would render one time
// on the server and another after hydration.

const SAST = 'Africa/Johannesburg'
/** SA has no daylight saving, so the offset is a constant, not a lookup. */
const SAST_OFFSET = '+02:00'

/** "07:30" from a stored timestamp. Empty string when there is nothing to show. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: SAST,
  })
}

/** A "HH:MM" typed against a work date, back to an absolute timestamp. */
export function clockStamp(workDate: string, hhmm: string, dayOffset = 0): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !/^\d{2}:\d{2}$/.test(hhmm)) return null
  const base = new Date(`${workDate}T${hhmm}:00${SAST_OFFSET}`)
  if (!Number.isFinite(base.getTime())) return null
  return new Date(base.getTime() + dayOffset * 86_400_000).toISOString()
}

/**
 * The two timestamps a start and end time of day mean on a given work date.
 *
 * An end at or before the start is read as the next morning — a night shift,
 * not a negative day. Either side may be blank; a half-filled pair is still
 * worth storing, since a manager often knows when someone arrived long before
 * they know when they left.
 */
export function clockSpan(
  workDate: string,
  startHHMM: string,
  endHHMM: string,
): { startedAt: string | null; endedAt: string | null } {
  const startedAt = clockStamp(workDate, startHHMM)
  let endedAt = clockStamp(workDate, endHHMM)
  if (startedAt && endedAt && new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
    endedAt = clockStamp(workDate, endHHMM, 1)
  }
  return { startedAt, endedAt }
}

/**
 * Hours implied by a start/end pair on a work date, less the unpaid break.
 * Returns null when the pair is incomplete — the caller keeps whatever hours
 * were typed by hand rather than zeroing the day.
 */
export function hoursFromTimes(
  workDate: string,
  startHHMM: string,
  endHHMM: string,
  breakMinutes = 0,
): number | null {
  const { startedAt, endedAt } = clockSpan(workDate, startHHMM, endHHMM)
  if (!startedAt || !endedAt) return null
  return hoursFromClock(startedAt, endedAt, breakMinutes)
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

/**
 * What one advance or deduction gave up to this period, and what it still owes.
 *
 * One of these per outstanding row, whether or not the period could afford it:
 * an allocation with appliedR 0 and the whole balance carried is exactly what a
 * week with no hours looks like against a standing advance.
 */
export interface DeductionAllocation {
  paymentId: string
  kind: 'advance' | 'deduction'
  date: string
  description: string
  /** Balance owing before this period touched it. */
  outstandingBeforeR: number
  /** Recovered on this payslip. */
  appliedR: number
  /** Still owing afterwards — carried to the next run. */
  carriedR: number
}

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
   * Advances and deductions actually recovered on this payslip. Never more
   * than gross — see the header note. PAYE/UIF/SDL are not in this number and
   * are not calculated anywhere yet.
   */
  deductionsR: number
  netPayR: number
  /** Total advance/deduction balance brought into this period. */
  outstandingR: number
  /** The part of that balance this period could not cover. */
  carryForwardR: number
  /** Row-by-row working behind deductionsR, oldest advance first. */
  deductions: DeductionAllocation[]
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
    outstandingR: 0,
    carryForwardR: 0,
    deductions: [],
  }
}

/** What is still owing on an advance or deduction row. */
export function outstandingOn(p: PayableAmount): number {
  if (isEarningKind(p.kind)) return 0
  return round2(Math.max(0, num(p.amount_r) - num(p.recovered_r)))
}

/** Roll a set of entries and payments into one period's pay. */
export function totalPay(entries: PayableEntry[], payments: PayableAmount[] = []): PayTotals {
  const t = emptyTotals()
  const owed: PayableAmount[] = []

  for (const e of entries) {
    t.normalHours += num(e.hours)
    t.overtimeHours += num(e.overtime_hours)
    t.hoursPayR += entryPayR(e)
  }

  for (const p of payments) {
    const amount = num(p.amount_r)
    if (p.kind === 'piece') t.piecePayR += amount
    else if (p.kind === 'bonus' || p.kind === 'allowance') t.otherPayR += amount
    else owed.push(p) // 'deduction' | 'advance' — recovered below, out of gross
  }

  t.normalHours = round2(t.normalHours)
  t.overtimeHours = round2(t.overtimeHours)
  t.hoursPayR = round2(t.hoursPayR)
  t.piecePayR = round2(t.piecePayR)
  t.otherPayR = round2(t.otherPayR)
  t.grossPayR = round2(t.hoursPayR + t.piecePayR + t.otherPayR)

  // Oldest first, so the advance somebody has been carrying longest clears
  // before one taken this morning. Ties break on id purely so two rows dated
  // the same day always allocate in the same order twice running.
  owed.sort((a, b) => a.pay_date.localeCompare(b.pay_date) || a.id.localeCompare(b.id))

  let left = t.grossPayR
  for (const p of owed) {
    const before = outstandingOn(p)
    if (before <= 0) continue
    const applied = round2(Math.min(before, Math.max(0, left)))
    left = round2(left - applied)
    t.outstandingR += before
    t.deductionsR += applied
    t.deductions.push({
      paymentId: p.id,
      kind: p.kind === 'deduction' ? 'deduction' : 'advance',
      date: p.pay_date,
      description: p.description || KIND_LABEL[p.kind],
      outstandingBeforeR: before,
      appliedR: applied,
      carriedR: round2(before - applied),
    })
  }

  t.outstandingR = round2(t.outstandingR)
  t.deductionsR = round2(t.deductionsR)
  t.carryForwardR = round2(t.outstandingR - t.deductionsR)
  t.netPayR = round2(t.grossPayR - t.deductionsR)

  return t
}

// ── Payslip snapshot ─────────────────────────────────────────────────────────

/**
 * One frozen line on a payslip. Written into payslips.lines at finalise so the
 * document never changes, even if the underlying timesheet is later corrected.
 */
export interface PayslipLine {
  kind: 'hours' | 'overtime' | 'piece' | 'bonus' | 'allowance' | 'advance' | 'deduction'
  date: string
  description: string
  /** Hours for time lines, 1 for money lines. */
  qty: number
  unit: 'hr' | 'ea'
  rateR: number
  /** Always positive. 'advance' and 'deduction' lines are subtracted, not added. */
  amountR: number
  jobRef?: string | null
  /**
   * Deduction lines only: the staff_payments row this came off, so reversing
   * the slip can hand the balance back to exactly the right advance.
   */
  paymentId?: string | null
  /** Deduction lines only: what is still owing after this slip took its bite. */
  carriedForwardR?: number
}

export interface PayslipDraft extends PayTotals {
  lines: PayslipLine[]
  entryIds: string[]
  /** Earnings claimed outright by this slip. Advances are claimed via `deductions`. */
  paymentIds: string[]
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

  const earnings = [...payments]
    .filter((p) => isEarningKind(p.kind))
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

  // Then what comes off. Only allocations that actually recovered something
  // print — an advance the period could not touch is carried, not a R0 line.
  for (const d of totals.deductions) {
    if (d.appliedR <= 0) continue
    lines.push({
      kind: d.kind,
      date: d.date,
      description: d.description || KIND_LABEL[d.kind],
      qty: 1,
      unit: 'ea',
      rateR: d.appliedR,
      amountR: d.appliedR,
      paymentId: d.paymentId,
      carriedForwardR: d.carriedR,
    })
  }

  return {
    ...totals,
    lines,
    entryIds: entries.map((e) => e.id),
    paymentIds: earnings.map((p) => p.id),
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
