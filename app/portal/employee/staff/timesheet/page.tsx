import type { Metadata } from 'next'
import { CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { loadBookableJobs, loadPeriod, loadStaff } from '@/lib/staff/server'
import { isoDate, payPeriod, weekStart } from '@/lib/staff/pay'
import { TimesheetWeek } from './TimesheetWeek'

export const metadata: Metadata = { title: 'Timesheet' }
export const dynamic = 'force-dynamic'

/**
 * A week of hours for the whole team.
 *
 * The grid on top is a read-only week at a glance; the list below is where
 * hours are actually captured and corrected. Splitting them that way is
 * deliberate — a day can hold several entries against different jobs, which a
 * one-cell-per-day matrix cannot express without lying about the total.
 */
export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  await requireSection('staff')
  const supabase = await createClient()
  const sp = await searchParams

  // ?week=YYYY-MM-DD anchors the view; anything else falls back to this week.
  const anchor =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? new Date(`${sp.week}T00:00:00`) : new Date()
  const safeAnchor = Number.isFinite(anchor.getTime()) ? anchor : new Date()
  const { start, end } = payPeriod('weekly', safeAnchor)

  const [staff, jobs, period] = await Promise.all([
    loadStaff(supabase),
    loadBookableJobs(supabase),
    loadPeriod(supabase, start, end),
  ])

  return (
    <PageShell width="wide">
      <PageHeader
        title="Timesheet"
        icon={CalendarClock}
        description="Hours worked, per person, per day — the input to every payslip and every job's labour cost."
      />
      <TimesheetWeek
        weekStartIso={start}
        weekEndIso={end}
        prevWeek={isoDate(new Date(weekStart(safeAnchor).getTime() - 7 * 86_400_000))}
        nextWeek={isoDate(new Date(weekStart(safeAnchor).getTime() + 7 * 86_400_000))}
        thisWeek={isoDate(weekStart(new Date()))}
        staff={staff.map((s) => ({
          id: s.id,
          full_name: s.full_name,
          cost_rate_r: s.cost_rate_r,
          overtime_multiplier: s.overtime_multiplier,
        }))}
        jobs={jobs}
        entries={period.entries}
      />
    </PageShell>
  )
}
