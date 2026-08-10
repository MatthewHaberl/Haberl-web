import type { JobStage } from '@/types/database'

export interface ChecklistItem {
  description: string
  /** Pipeline stage this task belongs to — drives the stage-focused task list. */
  stage: JobStage
}

// Standard install checklist — the process every accepted quote runs through.
// Order matters: it mirrors the pipeline stages on the job detail page, and the
// array index becomes job_tasks.sort_order (uuid ids sort randomly).
export const INSTALL_CHECKLIST: ChecklistItem[] = [
  { description: 'Deposit invoice sent to customer', stage: 'deposit_pending' },
  { description: 'Deposit received & reconciled', stage: 'deposit_pending' },
  { description: 'Starred equipment ordered from supplier', stage: 'procurement' },
  { description: 'Stock received — checked against picking list', stage: 'procurement' },
  { description: 'Installation date agreed with customer', stage: 'scheduled' },
  { description: 'Body corporate / HOA approval confirmed (if applicable)', stage: 'scheduled' },
  { description: 'Site prep check: roof access, DB space, monitoring signal', stage: 'scheduled' },
  { description: 'Panels & mounting installed', stage: 'installation' },
  { description: 'Inverter & battery mounted and wired', stage: 'installation' },
  { description: 'DB integration, earthing & surge protection complete', stage: 'installation' },
  { description: 'System commissioned — monitoring set up for customer', stage: 'commissioning' },
  { description: 'COC issued and filed', stage: 'coc' },
  { description: 'Handover pack sent (quote, COC, warranties, user guide)', stage: 'handover' },
  { description: 'Follow-up call — 7 days after handover', stage: 'follow_up' },
  // Asked here on purpose: right after the check-in call is when the customer is
  // most pleased with the system and most likely to record something (S7).
  { description: 'Testimonial requested (video if they\'re willing)', stage: 'follow_up' },
]

/** Rows ready for `insert into job_tasks` — one per checklist item. */
export function checklistRowsFor(jobId: string) {
  return INSTALL_CHECKLIST.map((item, index) => ({
    job_id: jobId,
    description: item.description,
    stage: item.stage,
    sort_order: index,
  }))
}
