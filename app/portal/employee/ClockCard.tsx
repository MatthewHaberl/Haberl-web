import { createClient, getUser } from '@/lib/supabase/server'
import { loadBookableJobs, loadMyStaff, loadRunningEntry } from '@/lib/staff/server'
import { ClockControls } from './ClockControls'

/**
 * The dashboard's clock-in card — how a field worker captures their own hours.
 *
 * Lives on the dashboard rather than inside the Staff section on purpose: the
 * Staff section holds the wage bill and is manager-only, but everybody needs to
 * clock in. RLS lets a person write their own time_entries without any section
 * grant, so this card is the whole surface they need.
 *
 * Renders nothing for anyone without a staff record (e.g. an admin login that
 * isn't a person on the payroll).
 */
export async function ClockCard() {
  const user = await getUser()
  if (!user) return null

  const supabase = await createClient()
  const person = await loadMyStaff(supabase, user.id)
  if (!person) return null

  const [running, jobs] = await Promise.all([
    loadRunningEntry(supabase, person.id),
    loadBookableJobs(supabase),
  ])

  return (
    <ClockControls
      staffId={person.id}
      costRateR={person.cost_rate_r}
      overtimeMultiplier={person.overtime_multiplier}
      jobs={jobs.slice(0, 60)}
      running={
        running
          ? {
              id: running.id,
              startedAt: running.started_at,
              jobId: running.job_id,
              jobTitle: running.job_id ? (jobs.find((j) => j.id === running.job_id)?.title ?? null) : null,
            }
          : null
      }
    />
  )
}
