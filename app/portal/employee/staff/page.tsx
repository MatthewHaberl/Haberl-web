import Link from 'next/link'
import type { Metadata } from 'next'
import { CalendarClock, HardHat, Receipt, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { loadStaff, loadPeriod, totalsByStaff } from '@/lib/staff/server'
import { payPeriod } from '@/lib/staff/pay'
import { StaffDirectory } from './StaffDirectory'
import type { StaffRow } from './shared'

export const metadata: Metadata = { title: 'Staff' }
export const dynamic = 'force-dynamic'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-6">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-primary">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The team, and what this week has cost in wages so far.
 *
 * Deliberately opens on the CURRENT week rather than a date picker: the
 * question this page answers most days is "what am I paying out on Friday",
 * and anything older is a payslip, not a live number.
 */
export default async function StaffPage() {
  await requireSection('staff')
  const supabase = await createClient()

  const staff = await loadStaff(supabase, { includeInactive: true })
  const active = staff.filter((s) => s.active)

  const week = payPeriod('weekly', new Date())
  const period = await loadPeriod(supabase, week.start, week.end, {
    staffIds: active.map((s) => s.id),
  })
  const totals = totalsByStaff(period, active.map((s) => s.id))

  // Who is on the clock right now — the one thing worth surfacing above the fold.
  const { data: runningRows } = await supabase
    .from('time_entries')
    .select('staff_id, started_at, job_id')
    .eq('status', 'running')
  const running = new Map(
    (runningRows ?? []).map((r) => [r.staff_id as string, r.started_at as string | null]),
  )

  const rows: StaffRow[] = staff.map((s) => {
    const t = totals.get(s.id)
    return {
      ...s,
      weekHours: (t?.normalHours ?? 0) + (t?.overtimeHours ?? 0),
      weekPayR: t?.grossPayR ?? 0,
      onClockSince: running.get(s.id) ?? null,
    }
  })

  const weekWage = rows.reduce((sum, r) => sum + r.weekPayR, 0)
  const weekHours = rows.reduce((sum, r) => sum + r.weekHours, 0)
  const unrated = active.filter((s) => s.pay_type === 'hourly' && s.cost_rate_r <= 0).length

  return (
    <PageShell width="wide">
      <PageHeader
        title="Staff"
        icon={HardHat}
        description="The team, the hours they work, and what those hours cost."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/portal/employee/staff/timesheet">
                <CalendarClock className="mr-2 h-4 w-4" />
                Timesheet
              </Link>
            </Button>
            <Button asChild>
              <Link href="/portal/employee/staff/payroll">
                <Wallet className="mr-2 h-4 w-4" />
                Run pay
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="On the team" value={String(active.length)} sub={`${staff.length - active.length} inactive`} icon={HardHat} />
        <Stat label="Hours this week" value={weekHours.toFixed(1)} sub={`${week.start} → ${week.end}`} icon={CalendarClock} />
        <Stat label="Wages this week" value={rand(weekWage)} sub="Gross, unpaid + paid" icon={Wallet} />
        <Stat
          label="On the clock"
          value={String(running.size)}
          sub={running.size ? 'Timers still running' : 'Nobody clocked in'}
          icon={Receipt}
        />
      </div>

      {unrated > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-6 text-sm">
            <span className="font-medium text-warning">
              {unrated} {unrated === 1 ? 'person has' : 'people have'} no hourly rate set.
            </span>{' '}
            <span className="text-muted-foreground">
              Their hours are recorded but cost R0 — set a rate below so job costing and payslips are real.
            </span>
          </CardContent>
        </Card>
      )}

      <StaffDirectory rows={rows} />
    </PageShell>
  )
}
