import type { JobStage } from '@/types/database'

// The pipeline every installation moves through, in order. on_hold / cancelled
// sit outside the linear flow.
export const PIPELINE_STAGES: JobStage[] = [
  'deposit_pending',
  'procurement',
  'scheduled',
  'installation',
  'commissioning',
  'coc',
  'handover',
  'follow_up',
  'completed',
]

export interface StageMeta {
  label: string
  customerLabel: string
  description: string
}

export const STAGE_META: Record<JobStage, StageMeta> = {
  deposit_pending: {
    label: 'Deposit',
    customerLabel: 'Awaiting deposit',
    description: 'Quote accepted — deposit invoice out, waiting for payment.',
  },
  procurement: {
    label: 'Procurement',
    customerLabel: 'Ordering your equipment',
    description: 'Deposit received — equipment on order from suppliers.',
  },
  scheduled: {
    label: 'Scheduled',
    customerLabel: 'Installation booked',
    description: 'Stock secured and installation date agreed with the customer.',
  },
  installation: {
    label: 'Installation',
    customerLabel: 'Installation in progress',
    description: 'Crew on site — panels, inverter, battery and DB work.',
  },
  commissioning: {
    label: 'Commissioning',
    customerLabel: 'System going live',
    description: 'System energized, settings configured, monitoring connected.',
  },
  coc: {
    label: 'COC',
    customerLabel: 'Compliance certification',
    description: 'Certificate of Compliance being issued and filed.',
  },
  handover: {
    label: 'Handover',
    customerLabel: 'Handover',
    description: 'Documentation pack and system walkthrough with the customer.',
  },
  follow_up: {
    label: 'Follow-up',
    customerLabel: 'Aftercare check-in',
    description: 'Post-install check-in — performance verified, questions answered.',
  },
  completed: {
    label: 'Completed',
    customerLabel: 'Complete',
    description: 'Job closed out.',
  },
  on_hold: {
    label: 'On Hold',
    customerLabel: 'On hold',
    description: 'Paused — see the hold reason.',
  },
  cancelled: {
    label: 'Cancelled',
    customerLabel: 'Cancelled',
    description: 'Job cancelled.',
  },
}

export function stageIndex(stage: JobStage) {
  return PIPELINE_STAGES.indexOf(stage)
}

export function nextStage(stage: JobStage): JobStage | null {
  const index = stageIndex(stage)
  if (index === -1 || index >= PIPELINE_STAGES.length - 1) return null
  return PIPELINE_STAGES[index + 1]
}

export function prevStage(stage: JobStage): JobStage | null {
  const index = stageIndex(stage)
  if (index <= 0) return null
  return PIPELINE_STAGES[index - 1]
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-work-type pipelines (W97). The lite pipeline is a SUBSET of the existing
// job_stage enum — no enum DDL, no risk to live jobs. The module-level helpers
// above close over the full solar pipeline and stay for solar-only callers;
// pipeline-aware surfaces use stagesFor()/stageMetaFor() + the *In helpers.
// ─────────────────────────────────────────────────────────────────────────────

export type JobPipelineKind = 'full' | 'lite'

// Repairs/rewires skip procurement (materials are van stock or a single trip),
// commissioning and handover.
const LITE_STAGES: JobStage[] = [
  'deposit_pending',
  'scheduled',
  'installation',
  'coc',
  'follow_up',
  'completed',
]

export function stagesFor(pipeline: JobPipelineKind): JobStage[] {
  return pipeline === 'lite' ? LITE_STAGES : PIPELINE_STAGES
}

/** Which pipeline a job runs, from its work_type ('solar' → full). */
export function pipelineKindFor(workType: string | null | undefined): JobPipelineKind {
  if (!workType || workType === 'solar' || workType === 'backup_inverter') return 'full'
  return 'lite'
}

// 'Installation' reads wrong for a repair — label overrides instead of new
// enum values.
const LITE_META_OVERRIDES: Partial<Record<JobStage, Partial<StageMeta>>> = {
  scheduled: {
    customerLabel: 'Work booked',
    description: 'Materials on hand and a date agreed with the customer.',
  },
  installation: {
    label: 'Work in progress',
    customerLabel: 'Work in progress',
    description: 'Crew on site doing the quoted work.',
  },
  follow_up: {
    description: 'Post-work check-in — everything working, questions answered.',
  },
}

export function stageMetaFor(pipeline: JobPipelineKind, stage: JobStage): StageMeta {
  const base = STAGE_META[stage]
  if (pipeline !== 'lite') return base
  const override = LITE_META_OVERRIDES[stage]
  return override ? { ...base, ...override } : base
}

export function stageIndexIn(stages: JobStage[], stage: JobStage) {
  return stages.indexOf(stage)
}

export function nextStageIn(stages: JobStage[], stage: JobStage): JobStage | null {
  const index = stages.indexOf(stage)
  if (index === -1 || index >= stages.length - 1) return null
  return stages[index + 1]
}

export function prevStageIn(stages: JobStage[], stage: JobStage): JobStage | null {
  const index = stages.indexOf(stage)
  if (index <= 0) return null
  return stages[index - 1]
}
