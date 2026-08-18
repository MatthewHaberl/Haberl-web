import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { loadStaff } from '@/lib/staff/server'
import { loadCrews } from '@/lib/crews/query'
import { CrewManager } from './CrewManager'

export const metadata: Metadata = { title: 'Crews' }
export const dynamic = 'force-dynamic'

/**
 * The crews: who works together, and what an hour of each team costs.
 *
 * A crew is built once here and then chosen — on a quote, on a job — instead
 * of naming the same four people over and over (migration 117).
 */
export default async function CrewsPage() {
  await requireSection('staff')
  const supabase = await createClient()

  const [crews, staff] = await Promise.all([
    loadCrews(supabase, { includeInactive: true }),
    loadStaff(supabase),
  ])

  // How much work each crew is already on — a retired crew still owns its
  // history, and this is what says so before someone retires one.
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('crew_id')
    .not('crew_id', 'is', null)
    .neq('status', 'completed')
  const openJobs = new Map<string, number>()
  for (const row of (jobRows ?? []) as { crew_id: string }[]) {
    openJobs.set(row.crew_id, (openJobs.get(row.crew_id) ?? 0) + 1)
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title="Crews"
        icon={Users}
        description="Teams you can put on a job once, instead of picking the same people every day."
        actions={
          <Button asChild variant="outline">
            <Link href="/portal/employee/staff">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Staff
            </Link>
          </Button>
        }
      />

      <CrewManager
        crews={crews}
        staff={staff.map((s) => ({
          id: s.id,
          full_name: s.full_name,
          job_title: s.job_title,
          cost_rate_r: s.cost_rate_r,
          pay_type: s.pay_type,
        }))}
        openJobs={Object.fromEntries(openJobs)}
      />
    </PageShell>
  )
}
