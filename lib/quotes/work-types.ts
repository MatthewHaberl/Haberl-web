// ─────────────────────────────────────────────────────────────────────────────
// Work types — the quote engine discriminator (W97, migration 105).
//
// quote_requests.work_type selects an *engine* for the middle of the quote
// pipeline: 'solar' (design canvas → designToBom) or 'scope' (line-item scope
// builder → scopeToBom). Both emit the same DesignBom shape, so everything
// downstream of the BOM is shared.
//
// The `work_types` table is the source of truth (new types are data, not a
// deploy). DEFAULT_WORK_TYPES mirrors the migration-105 seed so pure code and
// error paths never dead-end on a missing fetch — resolution helpers take an
// optional `rows` argument and fall back to the static seed.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkEngine = 'solar' | 'scope'
export type WorkPipeline = 'full' | 'lite' | 'none'

export interface WorkType {
  code: string
  label: string
  engine: WorkEngine
  job_pipeline: WorkPipeline
  default_sections: string[]
  description: string | null
  sort_order: number
  active: boolean
}

/** Mirror of the migration 105 seed — fallback when the table can't be read. */
export const DEFAULT_WORK_TYPES: WorkType[] = [
  {
    code: 'solar', label: 'Solar PV / hybrid system', engine: 'solar', job_pipeline: 'full',
    default_sections: [],
    description: 'Full solar design on the canvas — panels, inverter, battery, compliance.',
    sort_order: 0, active: true,
  },
  {
    code: 'backup_inverter', label: 'Backup power — inverter + battery', engine: 'solar', job_pipeline: 'full',
    default_sections: [],
    description: 'Inverter + battery with no PV — uses the design canvas with PV toggled off.',
    sort_order: 1, active: true,
  },
  {
    code: 'electrical', label: 'General electrical & repairs', engine: 'scope', job_pipeline: 'lite',
    default_sections: ['Materials', 'Labour', 'Compliance'],
    description: 'Repairs, new circuits, lights, plugs — scoped as line items.',
    sort_order: 2, active: true,
  },
  {
    code: 'db_rewire', label: 'DB board / rewire', engine: 'scope', job_pipeline: 'lite',
    default_sections: ['Distribution board', 'Wiring & containment', 'Accessories', 'Labour', 'Compliance'],
    description: 'Distribution board replacements, upgrades and rewires.',
    sort_order: 3, active: true,
  },
  {
    code: 'coc', label: 'COC & inspection', engine: 'scope', job_pipeline: 'lite',
    default_sections: ['Inspection', 'Remedial work', 'Certificate'],
    description: 'Certificate of Compliance inspections and remedial work.',
    sort_order: 4, active: true,
  },
  {
    code: 'generator', label: 'Generator & changeover', engine: 'scope', job_pipeline: 'lite',
    default_sections: ['Generator & changeover', 'Wiring & containment', 'Labour', 'Compliance'],
    description: 'Generator supply, changeover switches and wiring.',
    sort_order: 5, active: true,
  },
  {
    code: 'ev_charger', label: 'EV charger install', engine: 'scope', job_pipeline: 'lite',
    default_sections: ['Charger', 'Supply & protection', 'Labour', 'Compliance'],
    description: 'EV charge point supply and installation.',
    sort_order: 6, active: true,
  },
]

export function workTypeFor(code: string | null | undefined, rows?: WorkType[]): WorkType | undefined {
  if (!code) return undefined
  return (rows ?? []).find((w) => w.code === code) ?? DEFAULT_WORK_TYPES.find((w) => w.code === code)
}

/**
 * Which engine drives this quote. A missing code resolves to 'solar' — every
 * pre-W97 quote defaults to 'solar' and must keep behaving exactly as today.
 * An UNKNOWN code resolves to 'scope': the solar codes are seeded and static,
 * so an unrecognised code can only be a data-added (or deactivated) scope
 * work type, and solar wording/UI for it would be wrong.
 */
export function engineFor(code: string | null | undefined, rows?: WorkType[]): WorkEngine {
  if (!code) return 'solar'
  return workTypeFor(code, rows)?.engine ?? 'scope'
}

export function pipelineFor(code: string | null | undefined, rows?: WorkType[]): WorkPipeline {
  if (!code) return 'full'
  return workTypeFor(code, rows)?.job_pipeline ?? 'lite'
}

/** Display label; an unknown code shows itself rather than claiming solar. */
export function workTypeLabel(code: string | null | undefined, rows?: WorkType[]): string {
  if (!code) return 'Solar PV / hybrid system'
  return workTypeFor(code, rows)?.label ?? code
}

/** Active work types, display order. Falls back to the static seed on error. */
export async function fetchWorkTypes(supabase: SupabaseClient): Promise<WorkType[]> {
  try {
    const { data, error } = await supabase
      .from('work_types')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error || !data?.length) return DEFAULT_WORK_TYPES
    return data as WorkType[]
  } catch {
    return DEFAULT_WORK_TYPES
  }
}
