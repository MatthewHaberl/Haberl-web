// ─────────────────────────────────────────────────────────────────────────────
// Section presets — a saved section (its name and the items under it), droppable
// into any scope quote.
//
// The same handful of sections get retyped on every quote: a COC inspection, a
// standard 12-way board swap, the fixed set of consumables that goes with a
// rewire. A preset is that section captured once — the same idea as the DB
// builder's reusable boards (db_assemblies), one level up: not a board, a whole
// heading with its lines.
//
// What a preset stores is the SHAPE of the section, not a price list:
//   - catalog lines keep their catalogId, so generate re-reads today's cost from
//     the catalog exactly as it does for a hand-added line;
//   - free-text lines carry the cost that was typed, because nothing else knows it;
//   - a sell price is only kept where someone deliberately overrode it. Everything
//     else re-derives from cost x the CURRENT house markup on insert, so a preset
//     saved at 15% doesn't quietly quote last year's margin.
//
// Pure module — no Supabase, no React. Storage lives in the panel that uses it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  newScopeLineId,
  type QuoteScope, type ScopeLine, type ScopeLineKind, type ScopeLineUnit,
} from './scope'

const round2 = (n: number) => Math.round(n * 100) / 100

const KINDS: ScopeLineKind[] = ['material', 'labour', 'fee']
const UNITS: ScopeLineUnit[] = ['ea', 'm', 'hr', 'job']

/** One line inside a preset — a ScopeLine without its id, section or package. */
export interface ScopePresetLine {
  kind: ScopeLineKind
  catalogId: string | null
  sku: string
  description: string
  qty: number
  unit: ScopeLineUnit
  unitCostR: number
  unitSellR: number
  sellOverridden: boolean
  optional: boolean
  note: string | null
}

export interface ScopePresetPayload {
  version: 1
  /** Section name this preset inserts as — the one it was saved from. */
  section: string
  lines: ScopePresetLine[]
}

/** A stored preset row (quote_section_presets), as the builder reads it. */
export interface ScopeSectionPreset {
  id: string
  name: string
  payload: ScopePresetPayload
  /** Null when the row predates the column or the creator was deleted. */
  created_by?: string | null
}

/** Capture one section of a scope — its lines in scope order — as a preset payload. */
export function sectionToPreset(
  scope: QuoteScope,
  packageId: string | null,
  section: string,
): ScopePresetPayload {
  return {
    version: 1,
    section,
    lines: scope.lines
      .filter((l) => l.packageId === packageId && l.section === section)
      .map((l) => ({
        kind: l.kind,
        catalogId: l.catalogId,
        sku: l.sku,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        unitCostR: l.unitCostR,
        unitSellR: l.unitSellR,
        sellOverridden: l.sellOverridden,
        optional: l.optional,
        note: l.note,
      })),
  }
}

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

/**
 * Read a stored payload back. Same discipline as parseScope: anything unreadable
 * returns null rather than a half-built preset, and a single bad line is dropped
 * rather than taking the preset down with it.
 */
export function parsePresetPayload(raw: unknown): ScopePresetPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.lines)) return null

  const lines: ScopePresetLine[] = []
  for (const item of r.lines) {
    if (!item || typeof item !== 'object') continue
    const l = item as Record<string, unknown>
    const kind = KINDS.includes(l.kind as ScopeLineKind) ? (l.kind as ScopeLineKind) : 'material'
    lines.push({
      kind,
      catalogId: typeof l.catalogId === 'string' ? l.catalogId : null,
      sku: str(l.sku),
      description: str(l.description),
      qty: num(l.qty, 1),
      unit: UNITS.includes(l.unit as ScopeLineUnit)
        ? (l.unit as ScopeLineUnit)
        : (kind === 'labour' ? 'hr' : 'ea'),
      unitCostR: num(l.unitCostR, 0),
      unitSellR: num(l.unitSellR, 0),
      sellOverridden: l.sellOverridden === true,
      optional: l.optional === true,
      note: typeof l.note === 'string' && l.note.length > 0 ? l.note : null,
    })
  }

  return { version: 1, section: str(r.section).trim(), lines }
}

/**
 * Turn a preset into scope lines for one section of one package.
 *
 * Fresh ids on every line, so inserting the same preset twice is two independent
 * sets of items — the second is not an alias of the first. An overridden sell
 * price is the one number carried through verbatim: someone decided it, and a
 * preset is exactly how you keep that decision.
 */
export function presetToScopeLines(
  payload: ScopePresetPayload,
  section: string,
  packageId: string | null,
  markup: number,
): ScopeLine[] {
  return payload.lines.map((l) => ({
    id: newScopeLineId(),
    section,
    packageId,
    kind: l.kind,
    catalogId: l.catalogId,
    sku: l.sku,
    description: l.description,
    qty: l.qty,
    unit: l.unit,
    unitCostR: l.unitCostR,
    unitSellR: l.sellOverridden ? l.unitSellR : round2(l.unitCostR * markup),
    sellOverridden: l.sellOverridden,
    optional: l.optional,
    note: l.note,
  }))
}

/**
 * The section name a preset should land under, given what the quote already has.
 *
 * A preset whose section name is already on the quote would otherwise merge into
 * it silently. Numbering the copy keeps the two apart — the same "two 12-way
 * boards is two boards" rule the packages model runs on.
 */
export function presetSectionName(
  payload: ScopePresetPayload,
  taken: string[],
  /** Used when the preset carries no section name of its own — its own name. */
  fallback = 'Section',
): string {
  const base = payload.section.trim() || fallback.trim() || 'Section'
  const used = new Set(taken.map((n) => n.trim().toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base} ${i}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  return `${base} ${newScopeLineId().slice(0, 4)}`
}
