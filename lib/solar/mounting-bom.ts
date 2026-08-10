// ─────────────────────────────────────────────────────────────────────────────
// Per-row mounting / racking BOM (W55).
//
// A string is an electrical thing; a ROW is a physical thing. A 10-panel east
// string is often one row of 6 and one row of 4 — sometimes on two different
// roof surfaces, which need completely different mounting hardware. Until now
// the BOM had no way to say that, so mounting was quoted by eye.
//
// This is a pure rules engine: rows in, Lumax part numbers and quantities out.
// Two families of roof, because the hardware genuinely differs:
//
//   SHORT-RAIL (IBR, corrugated, Klip-Lok, standing seam)
//     Feet sit directly on the sheet, one pair per panel join:
//       feet   = (N + 1) x 2          (a shared foot between adjacent panels)
//       clamps = 4 end + 2(N - 1) mid  (bolt straight onto the feet, no rail)
//     Penetrating roofs take 4 tek screws per foot; Klip-Lok / standing seam
//     take a non-penetrating clamp instead — no holes in the sheet at all.
//
//   CONTINUOUS-RAIL (tile, slate, timber, concrete/ballast)
//     Two rails run the length of the row, carried on hooks:
//       rail length = N x panel width (+ end overhang)
//       rails       = 2 per row, sized up from the stock lengths
//       splices     = 2 per rail when the run exceeds one stock rail (6.2 m)
//       hooks       = ~2 per panel, i.e. 2N, with a minimum of 4
//
// Quantities are validated against Lumax's own pre-packaged kits (catalogue
// p56–57) in the tests, which is what stops this drifting into invention.
//
// Every part is emitted with a Lumax SKU. Those SKUs seed into the catalog at
// cost 0 ("to price") — the same pattern earthing already uses — so a mounting
// line shows as a "Quote" item until Matthew loads Lumax pricing.
// ─────────────────────────────────────────────────────────────────────────────

import type { PanelGroup } from './system-design'

/** How a roof is fixed — decides which family of hardware applies. */
export type MountingRoofType =
  | 'tile'
  | 'ibr'
  | 'corrugated'
  | 'kliplok'
  | 'standing_seam'
  | 'slate'
  | 'timber'
  | 'concrete_ballast'

export type PanelOrientation = 'portrait' | 'landscape'

export interface MountingRoofMeta {
  value: MountingRoofType
  label: string
  family: 'short_rail' | 'continuous_rail'
  /** Fastener that lands in the roof structure (null = non-penetrating). */
  fastener: 'tek' | 'woodscrew' | 'hook' | null
  hint: string
}

export const MOUNTING_ROOF_TYPES: MountingRoofMeta[] = [
  { value: 'ibr', label: 'IBR (crest-fix)', family: 'short_rail', fastener: 'tek', hint: 'Self-piercing screws through the crest' },
  { value: 'corrugated', label: 'Corrugated', family: 'short_rail', fastener: 'tek', hint: 'Self-piercing screws through the crest' },
  { value: 'kliplok', label: 'Klip-Lok / Saflok', family: 'short_rail', fastener: null, hint: 'Non-penetrating clamp onto the rib' },
  { value: 'standing_seam', label: 'Standing seam', family: 'short_rail', fastener: null, hint: 'Non-penetrating seam clamp' },
  { value: 'tile', label: 'Tile', family: 'continuous_rail', fastener: 'hook', hint: 'Roof hooks under the tile onto the batten' },
  { value: 'slate', label: 'Slate', family: 'continuous_rail', fastener: 'hook', hint: 'Slate hooks onto the batten' },
  { value: 'timber', label: 'Wood / timber', family: 'continuous_rail', fastener: 'woodscrew', hint: 'Coach screws into the rafter' },
  { value: 'concrete_ballast', label: 'Concrete (flat, ballast)', family: 'continuous_rail', fastener: null, hint: 'Ballasted A-frame, no penetration' },
]

export function roofMeta(type: MountingRoofType): MountingRoofMeta {
  return MOUNTING_ROOF_TYPES.find((r) => r.value === type) ?? MOUNTING_ROOF_TYPES[0]
}

/** One physical run of panels on one roof surface. */
export interface MountingRow {
  id: string
  /** Panels in this row. */
  panelCount: number
  roofType: MountingRoofType
  orientation: PanelOrientation
  /** Per-row override of the panel's own dimensions, in mm. */
  panelWidthMm?: number | null
  panelHeightMm?: number | null
}

/** Panel physical size. Defaults are a 1134 x 1762 x 30 mm module. */
export interface PanelDimensions {
  widthMm: number
  heightMm: number
  frameMm: number
}

export const DEFAULT_PANEL_DIMENSIONS: PanelDimensions = { widthMm: 1134, heightMm: 1762, frameMm: 30 }

// ── Lumax part numbers ───────────────────────────────────────────────────────
// Placeholders in the catalog until Lumax pricing is loaded (cost 0 = "Quote").

export const LUMAX_SKUS = {
  footShort: 'LM-SR-FOOT',
  midClamp: 'LM-MC-30-35',
  endClamp: 'LM-EC-30-35',
  tekScrew: 'FS-S-SP-25X5.5-C4',
  klipLokClamp: 'LM-KS-700',
  standingSeamClamp: 'LM-SSG',
  roofHookTile: 'LMK-RH-S-S',
  roofHookSlate: 'LMK-RH-SL',
  woodScrew: 'FS-CS-10X100',
  ballastFoot: 'LM-BF-15',
  railSplice: 'LM-R42-SPLICE',
  earthClip: 'LM-EC-BOND',
  earthLug: 'LM-EL-6',
} as const

/** Stock rail lengths (mm) — a run longer than the longest needs splicing. */
export const RAIL_LENGTHS_MM = [2150, 3150, 4150, 5150, 6200] as const
export const MAX_RAIL_MM = RAIL_LENGTHS_MM[RAIL_LENGTHS_MM.length - 1]

/** Lumax rail SKU for a stock length, e.g. 5150 → LM-R42-5150. */
export function railSku(lengthMm: number): string {
  return `LM-R42-${lengthMm}`
}

export interface MountingBomLine {
  sku: string
  description: string
  qty: number
  /** Which row it belongs to, for the itemised view. */
  rowLabel: string
}

export interface RowMounting {
  rowLabel: string
  roofType: MountingRoofType
  panelCount: number
  /** Span the row occupies along the rail, in mm. */
  runLengthMm: number
  lines: MountingBomLine[]
  /** Anything the designer should look at before ordering. */
  warnings: string[]
}

/**
 * The width one panel occupies along the row. Portrait = the module's short
 * side; landscape = its long side. Frame-to-frame clamp gaps are ~20 mm and are
 * folded into the end overhang rather than modelled per join.
 */
export function panelRunWidthMm(dims: PanelDimensions, orientation: PanelOrientation): number {
  return orientation === 'portrait' ? dims.widthMm : dims.heightMm
}

/** Smallest stock rail that covers a run; null when it needs more than one. */
export function railForRun(runMm: number): number | null {
  return RAIL_LENGTHS_MM.find((l) => l >= runMm) ?? null
}

/**
 * Rails needed for one run of one rail line, plus splices.
 * A run longer than a single stock rail is made up of the longest rails
 * available; each joint takes a splice.
 */
export function railPlanFor(runMm: number): { lengths: number[]; splices: number } {
  if (runMm <= 0) return { lengths: [], splices: 0 }
  const single = railForRun(runMm)
  if (single) return { lengths: [single], splices: 0 }

  const lengths: number[] = []
  let remaining = runMm
  while (remaining > MAX_RAIL_MM) {
    lengths.push(MAX_RAIL_MM)
    remaining -= MAX_RAIL_MM
  }
  lengths.push(railForRun(remaining) ?? MAX_RAIL_MM)
  return { lengths, splices: lengths.length - 1 }
}

/** Mounting hardware for one row. */
export function mountingForRow(
  row: MountingRow,
  dims: PanelDimensions,
  rowLabel: string,
): RowMounting {
  const n = Math.max(0, Math.round(row.panelCount))
  const meta = roofMeta(row.roofType)
  const lines: MountingBomLine[] = []
  const warnings: string[] = []
  const add = (sku: string, description: string, qty: number) => {
    if (qty > 0) lines.push({ sku, description, qty, rowLabel })
  }

  const effective: PanelDimensions = {
    widthMm: row.panelWidthMm || dims.widthMm,
    heightMm: row.panelHeightMm || dims.heightMm,
    frameMm: dims.frameMm,
  }
  const panelWidth = panelRunWidthMm(effective, row.orientation)
  const runLengthMm = n > 0 ? Math.round(n * panelWidth) : 0

  if (n === 0) return { rowLabel, roofType: row.roofType, panelCount: 0, runLengthMm: 0, lines, warnings }

  if (meta.family === 'short_rail') {
    // Feet: a shared foot between adjacent panels, two rails' worth.
    const feet = (n + 1) * 2
    // Clamps bolt straight onto the feet — 4 ends, 2 mid per interior join.
    const endClamps = 4
    const midClamps = 2 * (n - 1)

    if (meta.fastener === 'tek') {
      add(LUMAX_SKUS.footShort, 'Short-rail mounting foot', feet)
      add(LUMAX_SKUS.tekScrew, 'Self-piercing tek screw 25×5.5 (C4)', feet * 4)
    } else if (row.roofType === 'kliplok') {
      // The clamp IS the foot — no separate foot, no screws, no holes.
      add(LUMAX_SKUS.klipLokClamp, 'Klip-Lok clamp (non-penetrating)', feet)
    } else {
      add(LUMAX_SKUS.standingSeamClamp, 'Standing-seam clamp (non-penetrating)', feet)
    }

    add(LUMAX_SKUS.endClamp, `End clamp (${effective.frameMm} mm frame)`, endClamps)
    add(LUMAX_SKUS.midClamp, `Mid clamp (${effective.frameMm} mm frame)`, midClamps)
  } else {
    // Continuous rail: two rails carried on hooks.
    const plan = railPlanFor(runLengthMm)
    for (const length of new Set(plan.lengths)) {
      const count = plan.lengths.filter((l) => l === length).length
      // Two rail lines per row.
      add(railSku(length), `Mounting rail ${length} mm`, count * 2)
    }
    if (plan.splices > 0) {
      add(LUMAX_SKUS.railSplice, 'Rail splice', plan.splices * 2)
    }

    const hooks = Math.max(4, 2 * n)
    if (row.roofType === 'tile') add(LUMAX_SKUS.roofHookTile, 'Tile roof hook (adjustable)', hooks)
    else if (row.roofType === 'slate') add(LUMAX_SKUS.roofHookSlate, 'Slate roof hook', hooks)
    else if (row.roofType === 'timber') {
      add(LUMAX_SKUS.roofHookTile, 'Rafter bracket', hooks)
      add(LUMAX_SKUS.woodScrew, 'Coach screw 10×100', hooks * 2)
    } else {
      add(LUMAX_SKUS.ballastFoot, 'Ballasted A-frame foot', hooks)
      warnings.push(`${rowLabel}: ballast mass isn't calculated — confirm the wind-load ballast with Lumax before ordering.`)
    }

    add(LUMAX_SKUS.endClamp, `End clamp (${effective.frameMm} mm frame)`, 4)
    add(LUMAX_SKUS.midClamp, `Mid clamp (${effective.frameMm} mm frame)`, 2 * (n - 1))
  }

  // Array earthing: bond every rail/foot line, one lug per row to the earth bar.
  add(LUMAX_SKUS.earthClip, 'Earth bonding clip', Math.max(2, n))
  add(LUMAX_SKUS.earthLug, 'Earth lug 6 mm²', 1)

  if (runLengthMm > MAX_RAIL_MM * 2) {
    warnings.push(`${rowLabel}: ${(runLengthMm / 1000).toFixed(1)} m run — check the roof actually has an unbroken span that long.`)
  }

  return { rowLabel, roofType: row.roofType, panelCount: n, runLengthMm, lines, warnings }
}

export interface MountingBom {
  rows: RowMounting[]
  /** Every line summed by SKU — what actually gets ordered. */
  consolidated: Array<{ sku: string; description: string; qty: number }>
  warnings: string[]
}

/**
 * Mounting BOM for a panel group. When the group has no explicit rows, the whole
 * group is treated as ONE row on its own roof type — so an untouched design
 * still gets sane mounting hardware instead of nothing.
 */
export function mountingForGroup(
  group: Pick<PanelGroup, 'label' | 'panelCount' | 'strings' | 'roofType'> & { rows?: MountingRow[] | null },
  dims: PanelDimensions = DEFAULT_PANEL_DIMENSIONS,
): MountingBom {
  const strings = Math.max(1, Math.round(group.strings ?? 1))
  const rows = group.rows?.length
    ? group.rows
    : [{
        id: 'auto',
        panelCount: group.panelCount,
        roofType: roofTypeFromLabel(group.roofType),
        orientation: 'portrait' as PanelOrientation,
      }]

  const out: RowMounting[] = []
  for (const [i, row] of rows.entries()) {
    const label = `${group.label || 'String'} — row ${i + 1}`
    const result = mountingForRow(row, dims, label)
    // Identical parallel strings each need their own hardware.
    if (strings > 1) {
      for (const line of result.lines) line.qty *= strings
    }
    out.push(result)
  }

  return {
    rows: out,
    consolidated: consolidateMounting(out),
    warnings: out.flatMap((r) => r.warnings),
  }
}

/** Sum identical SKUs across rows — what goes on the order. */
export function consolidateMounting(rows: RowMounting[]): Array<{ sku: string; description: string; qty: number }> {
  const map = new Map<string, { sku: string; description: string; qty: number }>()
  for (const row of rows) {
    for (const line of row.lines) {
      const existing = map.get(line.sku)
      if (existing) existing.qty += line.qty
      else map.set(line.sku, { sku: line.sku, description: line.description, qty: line.qty })
    }
  }
  return [...map.values()]
}

/**
 * Map the free-text roofType the design already carries onto a mounting family.
 * Existing designs have strings like "IBR / corrugated steel" from ROOF_TYPES.
 */
export function roofTypeFromLabel(label: string | null | undefined): MountingRoofType {
  const t = (label ?? '').toLowerCase()
  if (t.includes('klip') || t.includes('saflok')) return 'kliplok'
  if (t.includes('standing') || t.includes('seam')) return 'standing_seam'
  if (t.includes('slate')) return 'slate'
  if (t.includes('tile')) return 'tile'
  if (t.includes('timber') || t.includes('wood')) return 'timber'
  if (t.includes('concrete') || t.includes('flat') || t.includes('ground')) return 'concrete_ballast'
  if (t.includes('corrugat')) return 'corrugated'
  return 'ibr'
}

/** Panel dimensions off a catalog row, falling back to the standard module. */
export function panelDimensionsFrom(
  item: { width_mm?: number | null; height_mm?: number | null; frame_mm?: number | null } | null | undefined,
): PanelDimensions {
  return {
    widthMm: item?.width_mm || DEFAULT_PANEL_DIMENSIONS.widthMm,
    heightMm: item?.height_mm || DEFAULT_PANEL_DIMENSIONS.heightMm,
    frameMm: item?.frame_mm || DEFAULT_PANEL_DIMENSIONS.frameMm,
  }
}
