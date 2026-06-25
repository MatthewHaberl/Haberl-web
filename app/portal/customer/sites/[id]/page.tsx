import { createClient } from '@/lib/supabase/server'
import { getCurrentCustomerId } from '@/lib/customers/current'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { FileText, Calendar, ShieldCheck, Download, Wrench, Sun, Zap } from 'lucide-react'
import { InstallationTracker } from '@/components/jobs/InstallationTracker'
import type { Job, JobStatusHistory } from '@/types/database'

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const customerId = (await getCurrentCustomerId()) ?? '00000000-0000-0000-0000-000000000000'

  const [{ data: site }, { data: documents }, { data: serviceRecords }, { data: jobs }] = await Promise.all([
    supabase.from('sites').select('*').eq('id', id).eq('customer_id', customerId).single(),
    supabase.from('documents').select('*').eq('site_id', id).order('created_at', { ascending: false }),
    supabase.from('service_records').select('*, technician:user_profiles(full_name)').eq('site_id', id).order('date', { ascending: false }).limit(10),
    supabase.from('jobs').select('id, title, stage, scheduled_date').eq('site_id', id).neq('stage', 'completed').neq('stage', 'cancelled').order('created_at', { ascending: false }),
  ])

  if (!site) notFound()

  const activeJobs = (jobs ?? []) as Pick<Job, 'id' | 'title' | 'stage' | 'scheduled_date'>[]
  const jobHistories = new Map<string, JobStatusHistory[]>()
  if (activeJobs.length) {
    const { data: historyRows } = await supabase
      .from('job_status_history')
      .select('*')
      .in('job_id', activeJobs.map((j) => j.id))
      .order('created_at')
    for (const row of (historyRows ?? []) as JobStatusHistory[]) {
      const list = jobHistories.get(row.job_id) ?? []
      list.push(row)
      jobHistories.set(row.job_id, list)
    }
  }

  const docTypeLabel: Record<string, string> = {
    coc: 'COC', sld: 'SLD', warranty: 'Warranty', invoice: 'Invoice', photo: 'Photo', other: 'Document',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">{site.name}</h1>
          <p className="text-muted-foreground mt-0.5">{site.address}</p>
        </div>
        <Badge variant={site.status === 'active' ? 'success' : 'warning'} className="text-sm px-3 py-1">
          {site.status}
        </Badge>
      </div>

      {/* System details */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'System type',   value: site.system_type ?? '—',                icon: Sun },
          { label: 'System size',   value: site.system_size_kw ? `${site.system_size_kw} kW` : '—', icon: Zap },
          { label: 'Install date',  value: site.install_date ? formatDate(site.install_date) : '—', icon: Calendar },
          { label: 'Warranty to',   value: site.warranty_expiry ? formatDate(site.warranty_expiry) : '—', icon: ShieldCheck },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
              <p className="font-semibold text-sm">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active installation progress */}
      {activeJobs.map((job) => (
        <InstallationTracker
          key={job.id}
          job={job}
          history={jobHistories.get(job.id) ?? []}
        />
      ))}

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" /> Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!documents?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No documents uploaded yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {docTypeLabel[doc.type] ?? doc.type} · {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={doc.file_url.startsWith('https://') ? doc.file_url : '#'} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Service history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-accent" /> Service History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!serviceRecords?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No service records yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {serviceRecords.map((record) => (
                <div key={record.id} className="py-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{record.work_performed}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(record.date)}</p>
                  </div>
                  {record.notes && (
                    <p className="text-xs text-muted-foreground">{record.notes}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Technician: {(record.technician as { full_name: string } | null)?.full_name ?? 'Haberl team'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
