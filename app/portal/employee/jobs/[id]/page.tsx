import { createClient, getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, ChevronLeft, FileText, Briefcase } from 'lucide-react'
import { pipelineKindFor, stageMetaFor } from '@/lib/jobs/stages'
import { fetchWorkTypes, workTypeFor } from '@/lib/quotes/work-types'
import type { Job, JobTask, JobMaterial, JobStatusHistory, JobScheduleSlot } from '@/types/database'
import type { Supplier } from '@/types/database'
import { JobActions } from './JobActions'
import { StagePipeline } from './StagePipeline'
import { MaterialsPanel } from './MaterialsPanel'
import { DepositPanel } from './DepositPanel'
import { CreatePoDialog } from './CreatePoDialog'
import { TestimonialPanel, type TestimonialSummary } from './TestimonialPanel'
import { getBaseUrl } from '@/lib/quotes/server'
import { JobLayout3DPanel } from './JobLayout3DPanel'
import { SchedulePanel } from './SchedulePanel'
import { JobCrewPanel } from './JobCrewPanel'
import { InvoicesPanel } from './InvoicesPanel'
import { loadCrews, loadQuotedLabour } from '@/lib/crews/query'
import { loadJobRoster, quotedPeopleFromScope } from '@/lib/jobs/staff'
import { loadJobInvoices, loadJobInvoiceContext } from '@/lib/invoices/query'
import type { JobTimeEntry } from '@/lib/crews/crews'
import type { CableRouteRow } from '@/lib/solar/job-layout-3d'
import { PageShell, PageHeader } from '@/components/layout/page'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const [{ data: jobData, error: jobError }, { data: taskData }, { data: materialData }, { data: historyData }, { data: profile }, { data: slotData }, { data: staffData }, { data: timeData }] = await Promise.all([
    supabase.from('jobs').select('*, site:sites(name, address), assignee:user_profiles!jobs_assigned_to_fkey(full_name)').eq('id', id).single(),
    supabase.from('job_tasks').select('*').eq('job_id', id).order('sort_order').order('id'),
    supabase.from('job_materials').select('*').eq('job_id', id).order('sort_order'),
    supabase.from('job_status_history').select('*, changer:user_profiles!changed_by(full_name)').eq('job_id', id).order('created_at'),
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
    // Booked working days (migration 106) — a job can run across several.
    supabase.from('job_schedule_slots').select('*').eq('job_id', id).order('starts_at'),
    supabase.from('user_profiles').select('id, full_name').in('role', ['field_worker', 'manager', 'admin']).order('full_name'),
    // Hours already booked against this job — the actual half of quoted-vs-actual,
    // and what says which booked days have been confirmed (migration 117).
    supabase
      .from('time_entries')
      .select('id, staff_id, slot_id, work_date, hours, overtime_hours, cost_rate_r, overtime_multiplier, source, payslip_id')
      .eq('job_id', id),
  ])

  if (jobError) {
    console.error('[jobs/detail] load failed', { id, code: jobError.code, message: jobError.message, details: jobError.details })
  }
  if (!jobData) notFound()

  const job = jobData as Job
  const tasks = (taskData as JobTask[]) ?? []
  const materials = (materialData as JobMaterial[]) ?? []
  const history = (historyData as JobStatusHistory[]) ?? []
  const scheduleSlots = (slotData as JobScheduleSlot[]) ?? []
  const staff = ((staffData ?? []) as { id: string; full_name: string | null }[])
    .map((p) => ({ id: p.id, full_name: p.full_name || 'Unnamed' }))
  const site = job.site as { name: string; address: string } | null

  const role = profile?.role ?? 'field_worker'
  const isManager = role === 'manager' || role === 'admin'
  const canAdvance = isManager || job.assigned_to === user.id

  // ── Crews and labour (migration 117) ──────────────────────────────────────
  // The crew is picked once on the job; every booked day inherits it. Hours
  // confirmed off those days are the ACTUAL labour, which is only interesting
  // next to what the quote promised.
  const [crews, roster] = await Promise.all([
    loadCrews(supabase, { includeInactive: true }),
    loadJobRoster(supabase, id),
  ])
  const timeEntries = (timeData ?? []) as unknown as JobTimeEntry[]

  const quotedLabour = job.quote_request_id
    ? await loadQuotedLabour(supabase, job.quote_request_id)
    : null

  // Anyone in the staff directory can be put on a job by hand — including
  // people with no portal login, which is most of the people who swing tools.
  const { data: staffDirectory } = await supabase
    .from('staff')
    .select('id, full_name, job_title')
    .eq('active', true)
    .order('full_name')
  const allStaff = ((staffDirectory ?? []) as { id: string; full_name: string; job_title: string | null }[])
    .map((s) => ({ id: s.id, name: s.full_name, jobTitle: s.job_title }))

  // Does the quote name people this job has not picked up yet? Only then is
  // the "bring across who was quoted" button worth showing.
  let hasQuotedPeople = false
  if (job.quote_request_id) {
    const { data: scopeRow } = await supabase
      .from('quote_requests')
      .select('scope')
      .eq('id', job.quote_request_id)
      .maybeSingle()
    const onRoster = new Set(roster.map((p) => p.staffId))
    hasQuotedPeople = quotedPeopleFromScope(scopeRow?.scope).some((p) => !onRoster.has(p.staffId))
  }

  // Which pipeline this job runs — lite (non-solar) skips procurement,
  // commissioning and handover, and relabels installation (W97). Resolved via
  // the work_types table so data-added types honour their job_pipeline.
  const workTypes = await fetchWorkTypes(supabase)
  const pipeline = pipelineKindFor(job.work_type, workTypes)
  const stageMeta = stageMetaFor(pipeline, job.stage)

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
  let rejectedProofSignedUrl: string | null = null
  if (isManager && (job.deposit_proof_url || job.deposit_proof_rejected_url)) {
    const admin = createAdminClient()
    if (job.deposit_proof_url) {
      try {
        const { data: signed } = await admin.storage
          .from('payment-proofs')
          .createSignedUrl(job.deposit_proof_url, 60 * 60)
        proofSignedUrl = signed?.signedUrl ?? null
      } catch {
        proofSignedUrl = null
      }
    }
    if (job.deposit_proof_rejected_url) {
      try {
        const { data: signed } = await admin.storage
          .from('payment-proofs')
          .createSignedUrl(job.deposit_proof_rejected_url, 60 * 60)
        rejectedProofSignedUrl = signed?.signedUrl ?? null
      } catch {
        rejectedProofSignedUrl = null
      }
    }
  }
  const showDepositPanel =
    job.stage === 'deposit_pending' || !!job.deposit_proof_url || !!job.deposit_confirmed_at || !!job.deposit_proof_rejected_at

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

  // ── Invoicing (migration 133) ─────────────────────────────────────────────
  // Money, so manager/admin only — the same line Finance already draws. The
  // BOM doubles as the pick list for "invoice the parts that are on site", so
  // it is read here rather than by the panel.
  let invoices: Awaited<ReturnType<typeof loadJobInvoices>> = []
  let invoiceContext: Awaited<ReturnType<typeof loadJobInvoiceContext>> = null
  if (isManager) {
    ;[invoices, invoiceContext] = await Promise.all([
      loadJobInvoices(supabase, id),
      loadJobInvoiceContext(supabase, id),
    ])
  }

  // Testimonial (S7). RLS already limits the table to manager/admin, but the
  // fetch is gated too so a field worker's page does no pointless work.
  let testimonial: TestimonialSummary | null = null
  let testimonialVideoUrl: string | null = null
  if (isManager) {
    const { data: t } = await supabase
      .from('job_testimonials')
      .select('*')
      .eq('job_id', id)
      .maybeSingle()
    testimonial = (t as TestimonialSummary) ?? null
    if (testimonial?.video_url) {
      try {
        const { data: signed } = await createAdminClient().storage
          .from('testimonials')
          .createSignedUrl(testimonial.video_url, 60 * 60)
        testimonialVideoUrl = signed?.signedUrl ?? null
      } catch {
        testimonialVideoUrl = null
      }
    }
  }

  return (
    <PageShell width="wide">
      <Button variant="ghost" size="sm" asChild className="self-start -ml-2">
        <Link href="/portal/employee/jobs">
          <ChevronLeft className="h-4 w-4" /> Jobs
        </Link>
      </Button>
      <PageHeader
        icon={Briefcase}
        title={job.title}
        description={site ? (
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />{site.name} — {site.address}
          </span>
        ) : undefined}
        actions={
          <>
            {job.quote_request_id && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/portal/employee/quotes-v2/${job.quote_request_id}`}>
                  <FileText className="h-3.5 w-3.5" /> Quote
                </Link>
              </Button>
            )}
            <Badge variant={job.stage === 'completed' ? 'success' : job.stage === 'cancelled' ? 'destructive' : 'warning'}>
              {stageMeta?.label ?? job.stage}
            </Badge>
          </>
        }
      />

      <StagePipeline
        job={{ id: job.id, stage: job.stage, on_hold_reason: job.on_hold_reason }}
        pipeline={pipeline}
        history={history}
        tasks={tasks}
        canAdvance={canAdvance}
      />

      {showDepositPanel && (
        <DepositPanel
          jobId={job.id}
          depositCents={depositCents}
          proofSignedUrl={proofSignedUrl}
          proofUploadedAt={job.deposit_proof_uploaded_at}
          confirmedAt={job.deposit_confirmed_at}
          rejectedAt={job.deposit_proof_rejected_at}
          rejectedReason={job.deposit_proof_rejected_reason}
          rejectedProofSignedUrl={rejectedProofSignedUrl}
          canConfirm={isManager}
        />
      )}

      {isManager && invoiceContext && (
        <InvoicesPanel
          jobId={job.id}
          invoices={invoices}
          contractCents={invoiceContext.contractCents}
          quoteDepositCents={invoiceContext.quoteDepositCents}
          depositConfirmed={invoiceContext.depositConfirmed}
          quoteNumber={invoiceContext.quoteNumber}
          workLabel={workTypeFor(job.work_type ?? 'solar', workTypes)?.label ?? 'the work'}
          billToName={invoiceContext.billToName}
          billToEmail={invoiceContext.billToEmail}
          materials={materials.map((m) => ({
            id: m.id,
            section: m.section,
            description: m.description,
            qtyPlanned: Number(m.qty_planned) || 0,
            unitSellCents: Number(m.unit_sell_cents) || 0,
          }))}
        />
      )}

      <JobCrewPanel
        jobId={job.id}
        crewId={job.crew_id ?? null}
        crews={crews}
        roster={roster}
        allStaff={allStaff}
        hasQuotedPeople={hasQuotedPeople}
        entries={timeEntries}
        quoted={quotedLabour}
        canEdit={isManager}
      />

      <SchedulePanel
        jobId={job.id}
        initialSlots={scheduleSlots}
        staff={staff}
        defaultAssignee={job.assigned_to}
        crews={crews}
        jobCrewId={job.crew_id ?? null}
        roster={roster}
        loggedSlotIds={[...new Set(timeEntries.map((e) => e.slot_id).filter((id): id is string => !!id))]}
        paidSlotIds={[...new Set(
          timeEntries.filter((e) => e.slot_id && e.payslip_id).map((e) => e.slot_id as string),
        )]}
        canEdit={canAdvance}
        canLogHours={isManager}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        {job.description && (
          <Card className="sm:col-span-2">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{job.description}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <JobActions initialJob={job} initialTasks={tasks} stage={job.stage} pipeline={pipeline} />

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

      {/* Testimonial step of the journey (S7) — request at follow-up, review here. */}
      {isManager && (
        <TestimonialPanel
          jobId={job.id}
          testimonial={testimonial}
          baseUrl={getBaseUrl()}
          videoSignedUrl={testimonialVideoUrl}
        />
      )}
    </PageShell>
  )
}
