import { createClient, getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Calendar, ChevronLeft, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { STAGE_META } from '@/lib/jobs/stages'
import type { Job, JobTask, JobMaterial, JobStatusHistory } from '@/types/database'
import type { Supplier } from '@/types/database'
import { JobActions } from './JobActions'
import { StagePipeline } from './StagePipeline'
import { MaterialsPanel } from './MaterialsPanel'
import { DepositPanel } from './DepositPanel'
import { CreatePoDialog } from './CreatePoDialog'
import { JobLayout3DPanel } from './JobLayout3DPanel'
import type { CableRouteRow } from '@/lib/solar/job-layout-3d'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const [{ data: jobData, error: jobError }, { data: taskData }, { data: materialData }, { data: historyData }, { data: profile }] = await Promise.all([
    supabase.from('jobs').select('*, site:sites(name, address), assignee:user_profiles!jobs_assigned_to_fkey(full_name)').eq('id', id).single(),
    supabase.from('job_tasks').select('*').eq('job_id', id).order('id'),
    supabase.from('job_materials').select('*').eq('job_id', id).order('sort_order'),
    supabase.from('job_status_history').select('*, changer:user_profiles!changed_by(full_name)').eq('job_id', id).order('created_at'),
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
  ])

  if (jobError) {
    console.error('[jobs/detail] load failed', { id, code: jobError.code, message: jobError.message, details: jobError.details })
  }
  if (!jobData) notFound()

  const job = jobData as Job
  const tasks = (taskData as JobTask[]) ?? []
  const materials = (materialData as JobMaterial[]) ?? []
  const history = (historyData as JobStatusHistory[]) ?? []
  const site = job.site as { name: string; address: string } | null

  const role = profile?.role ?? 'field_worker'
  const isManager = role === 'manager' || role === 'admin'
  const canAdvance = isManager || job.assigned_to === user.id

  const stageMeta = STAGE_META[job.stage]

  // 3D layout: design segments + cable routes from the linked quote
  let quoteDesign: {
    id: string
    design_segments: Array<{ azimuth: number; pitch: number; panelCount: number }> | null
    roof_type: string | null
    storeys: number | null
    design_panel_count: number | null
    design_kwp: number | null
  } | null = null
  let cableRoutes: CableRouteRow[] = []
  if (job.quote_request_id) {
    const [{ data: qd }, { data: cr }] = await Promise.all([
      supabase
        .from('quote_requests')
        .select('id, design_segments, roof_type, storeys, design_panel_count, design_kwp')
        .eq('id', job.quote_request_id)
        .maybeSingle(),
      supabase
        .from('cable_routes')
        .select('id, route_type, label, points, measured_m, vertical_m, final_m, sort_order')
        .eq('quote_request_id', job.quote_request_id)
        .order('sort_order'),
    ])
    quoteDesign = qd ?? null
    cableRoutes = (cr ?? []) as CableRouteRow[]
  }

  // Deposit reconciliation: quote amount + a short-lived signed URL for the
  // proof file (private bucket — service role only)
  let depositCents: number | null = null
  let proofSignedUrl: string | null = null
  if (job.quote_request_id) {
    // deposit_amount not included in quoteDesign select; fetch it separately
    const { data: qDeposit } = await supabase
      .from('quote_requests')
      .select('deposit_amount')
      .eq('id', job.quote_request_id)
      .maybeSingle()
    depositCents = qDeposit?.deposit_amount ?? null
  }
  if (job.deposit_proof_url && isManager) {
    try {
      const admin = createAdminClient()
      const { data: signed } = await admin.storage
        .from('payment-proofs')
        .createSignedUrl(job.deposit_proof_url, 60 * 60)
      proofSignedUrl = signed?.signedUrl ?? null
    } catch {
      proofSignedUrl = null
    }
  }
  const showDepositPanel =
    job.stage === 'deposit_pending' || !!job.deposit_proof_url || !!job.deposit_confirmed_at

  // Procurement: suppliers + POs on this job + which material lines are ordered
  let suppliers: Supplier[] = []
  let existingPos: Array<{ id: string; po_number: string; status: string; supplier_name: string | null }> = []
  let orderedMaterialIds: string[] = []
  if (isManager) {
    const [{ data: supplierRows }, { data: poRows }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('active', true).order('name'),
      supabase
        .from('purchase_orders')
        .select('id, po_number, status, supplier:suppliers(name)')
        .eq('job_id', id)
        .order('created_at'),
    ])
    suppliers = (supplierRows ?? []) as Supplier[]
    existingPos = (poRows ?? []).map((po) => ({
      id: po.id,
      po_number: po.po_number,
      status: po.status,
      supplier_name: (po.supplier as unknown as { name: string } | null)?.name ?? null,
    }))
    if (existingPos.length) {
      const { data: lineRows } = await supabase
        .from('purchase_order_lines')
        .select('job_material_id')
        .in('po_id', existingPos.map((po) => po.id))
      orderedMaterialIds = (lineRows ?? [])
        .map((line) => line.job_material_id)
        .filter((value): value is string => !!value)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/portal/employee/jobs">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">{job.title}</h1>
          {site && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3.5 w-3.5" />{site.name} — {site.address}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {job.quote_request_id && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/portal/employee/quotes/${job.quote_request_id}`}>
                <FileText className="h-3.5 w-3.5" /> Quote
              </Link>
            </Button>
          )}
          <Badge variant={job.stage === 'completed' ? 'success' : job.stage === 'cancelled' ? 'destructive' : 'warning'}>
            {stageMeta?.label ?? job.stage}
          </Badge>
        </div>
      </div>

      <StagePipeline
        job={{ id: job.id, stage: job.stage, on_hold_reason: job.on_hold_reason }}
        history={history}
        canAdvance={canAdvance}
      />

      {showDepositPanel && (
        <DepositPanel
          jobId={job.id}
          depositCents={depositCents}
          proofSignedUrl={proofSignedUrl}
          proofUploadedAt={job.deposit_proof_uploaded_at}
          confirmedAt={job.deposit_confirmed_at}
          canConfirm={isManager}
        />
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {job.scheduled_date && (
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="text-sm font-medium">{formatDate(job.scheduled_date)}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {job.description && (
          <Card className="sm:col-span-2">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{job.description}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <JobActions initialJob={job} initialTasks={tasks} />

      <JobLayout3DPanel
        quoteRequest={quoteDesign}
        cableRoutes={cableRoutes}
        jobId={job.id}
      />

      {isManager && (
        <CreatePoDialog
          jobId={job.id}
          materials={materials}
          suppliers={suppliers}
          existingPos={existingPos}
          orderedMaterialIds={orderedMaterialIds}
        />
      )}

      <MaterialsPanel
        jobTitle={job.title}
        materials={materials}
        showPrices={isManager}
      />
    </div>
  )
}
