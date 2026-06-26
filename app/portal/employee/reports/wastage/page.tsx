import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PackageX, TrendingDown } from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'

function rands(cents: number) {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface MaterialRow {
  job_id: string
  sku: string
  description: string
  qty_planned: number
  qty_loaded: number
  qty_used: number
  qty_returned: number
  unit_cost_cents: number
  job: { id: string; title: string; created_at: string } | null
}

const PERIODS = [
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
] as const

export default async function WastageReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    redirect('/portal/employee')
  }

  const { period: periodParam } = await searchParams
  const period = PERIODS.find((p) => p.key === periodParam) ?? PERIODS[1]

  let query = supabase
    .from('job_materials')
    .select('job_id, sku, description, qty_planned, qty_loaded, qty_used, qty_returned, unit_cost_cents, job:jobs!inner(id, title, created_at)')
    .gt('qty_loaded', 0) // only lines that were actually tracked on site
  if (period.days != null) {
    const since = new Date(Date.now() - period.days * 86_400_000).toISOString()
    query = query.gte('jobs.created_at', since)
  }
  const { data } = await query

  const rows = ((data ?? []) as unknown as MaterialRow[]).map((row) => {
    const variance = Math.max(0, (row.qty_loaded ?? 0) - (row.qty_used ?? 0) - (row.qty_returned ?? 0))
    return {
      ...row,
      variance,
      varianceCostCents: Math.round(variance * (row.unit_cost_cents ?? 0)),
      loadedCostCents: Math.round((row.qty_loaded ?? 0) * (row.unit_cost_cents ?? 0)),
      returnedCostCents: Math.round((row.qty_returned ?? 0) * (row.unit_cost_cents ?? 0)),
    }
  })

  const totals = rows.reduce(
    (acc, row) => ({
      loaded: acc.loaded + row.loadedCostCents,
      lost: acc.lost + row.varianceCostCents,
      returned: acc.returned + row.returnedCostCents,
    }),
    { loaded: 0, lost: 0, returned: 0 },
  )

  // Per job
  const byJob = new Map<string, { title: string; lostCents: number; units: number }>()
  for (const row of rows) {
    if (row.variance <= 0 || !row.job) continue
    const entry = byJob.get(row.job_id) ?? { title: row.job.title, lostCents: 0, units: 0 }
    entry.lostCents += row.varianceCostCents
    entry.units += row.variance
    byJob.set(row.job_id, entry)
  }
  const jobRows = [...byJob.entries()].sort((a, b) => b[1].lostCents - a[1].lostCents)

  // Per SKU (top offenders)
  const bySku = new Map<string, { description: string; jobs: number; units: number; lostCents: number }>()
  for (const row of rows) {
    if (row.variance <= 0) continue
    const key = row.sku || row.description
    const entry = bySku.get(key) ?? { description: row.description, jobs: 0, units: 0, lostCents: 0 }
    entry.jobs += 1
    entry.units += row.variance
    entry.lostCents += row.varianceCostCents
    bySku.set(key, entry)
  }
  const skuRows = [...bySku.entries()].sort((a, b) => b[1].lostCents - a[1].lostCents).slice(0, 15)

  const lossPct = totals.loaded > 0 ? (totals.lost / totals.loaded) * 100 : 0

  return (
    <PageShell width="content">
      <PageHeader
        icon={PackageX}
        title="Wastage Report"
        description="Loaded vs used vs returned across job materials — what left the warehouse and never came back."
        actions={
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/portal/employee/reports/wastage?period=${p.key}`}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  p.key === period.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Loaded (cost)</p>
            <p className="text-lg font-bold text-primary mt-1">{rands(totals.loaded)}</p>
          </CardContent>
        </Card>
        <Card className={totals.lost > 0 ? 'border-destructive/40' : ''}>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Lost on site</p>
            <p className={`text-lg font-bold mt-1 ${totals.lost > 0 ? 'text-destructive' : 'text-primary'}`}>{rands(totals.lost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Returned to stock</p>
            <p className="text-lg font-bold text-primary mt-1">{rands(totals.returned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Loss rate</p>
            <p className="text-lg font-bold text-primary mt-1">{lossPct.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <TrendingDown className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Nothing tracked in this period</p>
            <p className="text-muted-foreground text-sm mt-1 max-w-md mx-auto">
              Wastage comes from the loaded / used / returned quantities your team enters on each
              job&apos;s materials panel during installation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {jobRows.length > 0 && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <PackageX className="h-4 w-4 text-accent" /> Loss by job
                </h2>
                <div className="flex flex-col divide-y divide-border">
                  {jobRows.map(([jobId, entry]) => (
                    <Link
                      key={jobId}
                      href={`/portal/employee/jobs/${jobId}`}
                      className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-muted/40 -mx-2 px-2 rounded transition-colors"
                    >
                      <span className="truncate">{entry.title}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{entry.units} unit{entry.units === 1 ? '' : 's'}</span>
                        <span className="font-semibold text-destructive">{rands(entry.lostCents)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {skuRows.length > 0 && (
            <Card>
              <CardContent className="pt-4 pb-4 overflow-x-auto">
                <h2 className="text-sm font-semibold mb-3">Top offenders (by lost cost)</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="text-left py-2 pr-3">SKU</th>
                      <th className="text-left py-2 pr-3">Description</th>
                      <th className="text-center py-2 px-3">Jobs</th>
                      <th className="text-center py-2 px-3">Units lost</th>
                      <th className="text-right py-2 pl-3">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuRows.map(([sku, entry]) => (
                      <tr key={sku} className="border-b border-border last:border-0">
                        <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{sku}</td>
                        <td className="py-1.5 pr-3">{entry.description}</td>
                        <td className="py-1.5 px-3 text-center">{entry.jobs}</td>
                        <td className="py-1.5 px-3 text-center font-medium">{Math.round(entry.units * 10) / 10}</td>
                        <td className="py-1.5 pl-3 text-right font-semibold text-destructive">{rands(entry.lostCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {jobRows.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                <Badge variant="success" className="mb-2">Clean sheet</Badge>
                <p>Everything loaded was either used or returned — no losses in this period.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  )
}
