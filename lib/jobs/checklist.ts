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

// ─────────────────────────────────────────────────────────────────────────────
// Per-work-type checklists (W97). Scope-engine jobs run the LITE pipeline
// (deposit → scheduled → installation → coc → follow_up → completed), so their
// stages must stay inside that set — job_tasks.stage has a DB check constraint
// (migration 100) limited to the solar slugs, which the lite set is a subset of.
// ─────────────────────────────────────────────────────────────────────────────

const ELECTRICAL_CHECKLIST: ChecklistItem[] = [
  { description: 'Deposit received & reconciled', stage: 'deposit_pending' },
  { description: 'Date agreed with customer', stage: 'scheduled' },
  { description: 'Materials on hand', stage: 'scheduled' },
  { description: 'Work completed & tested', stage: 'installation' },
  { description: 'COC issued and filed', stage: 'coc' },
  { description: 'Follow-up call', stage: 'follow_up' },
]

const DB_REWIRE_CHECKLIST: ChecklistItem[] = [
  { description: 'Deposit received & reconciled', stage: 'deposit_pending' },
  { description: 'Isolation & outage window agreed with customer', stage: 'scheduled' },
  { description: 'Materials on hand', stage: 'scheduled' },
  { description: 'Board removed / installed', stage: 'installation' },
  { description: 'Circuits labelled & tested', stage: 'installation' },
  { description: 'Earth & bonding verified', stage: 'installation' },
  { description: 'COC issued and filed', stage: 'coc' },
  { description: 'Handover pack sent (quote, COC, circuit chart)', stage: 'follow_up' },
]

const SOLAR_REPAIR_CHECKLIST: ChecklistItem[] = [
  { description: 'Deposit received & reconciled', stage: 'deposit_pending' },
  { description: 'Fault diagnosed — repair scope confirmed with customer', stage: 'scheduled' },
  { description: 'Parts on hand (warranty claim lodged if applicable)', stage: 'scheduled' },
  { description: 'Repair completed — system tested under load', stage: 'installation' },
  { description: 'Monitoring checked — generation & battery behaviour normal', stage: 'installation' },
  { description: 'COC issued and filed (if wiring altered)', stage: 'coc' },
  { description: 'Follow-up call — system performing as expected', stage: 'follow_up' },
]

const COC_CHECKLIST: ChecklistItem[] = [
  { description: 'Inspection booked', stage: 'scheduled' },
  { description: 'Inspection completed', stage: 'installation' },
  { description: 'Remedial list issued to customer', stage: 'installation' },
  { description: 'Remedials completed', stage: 'installation' },
  { description: 'Certificate issued and filed', stage: 'coc' },
]

const INSTALL_UNIT_CHECKLIST: ChecklistItem[] = [
  { description: 'Deposit received & reconciled', stage: 'deposit_pending' },
  { description: 'Equipment on hand', stage: 'scheduled' },
  { description: 'Supply & protection installed', stage: 'installation' },
  { description: 'Unit installed & commissioned', stage: 'installation' },
  { description: 'Customer walkthrough', stage: 'installation' },
  { description: 'COC issued and filed', stage: 'coc' },
]

// Keyed by work_types.code. Unknown scope-engine codes fall back to the
// general electrical list; solar codes get the full install checklist.
const CHECKLISTS: Record<string, ChecklistItem[]> = {
  solar: INSTALL_CHECKLIST,
  backup_inverter: INSTALL_CHECKLIST,
  solar_repair: SOLAR_REPAIR_CHECKLIST,
  electrical: ELECTRICAL_CHECKLIST,
  db_rewire: DB_REWIRE_CHECKLIST,
  coc: COC_CHECKLIST,
  generator: INSTALL_UNIT_CHECKLIST,
  ev_charger: INSTALL_UNIT_CHECKLIST,
}

export function checklistForWorkType(workType: string | null | undefined): ChecklistItem[] {
  if (!workType) return INSTALL_CHECKLIST
  return CHECKLISTS[workType] ?? ELECTRICAL_CHECKLIST
}

/** Rows ready for `insert into job_tasks` — one per checklist item. */
export function checklistRowsFor(jobId: string, workType?: string | null) {
  return checklistForWorkType(workType ?? 'solar').map((item, index) => ({
    job_id: jobId,
    description: item.description,
    stage: item.stage,
    sort_order: index,
  }))
}
