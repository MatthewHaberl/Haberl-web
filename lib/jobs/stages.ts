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
