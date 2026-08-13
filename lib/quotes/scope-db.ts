// ─────────────────────────────────────────────────────────────────────────────
// dbBoardToScopeLines — bridge from the DB builder into the scope engine.
//
// The scope builder reuses the solar studio's board model (AcCombiner: an
// enclosure + the devices inside it, lib/solar/system-design.ts) so boards,
// templates and saved assemblies (db_assemblies) are shared between the two
// engines. This module turns a finished board into plain ScopeLines for one
// section, following the same pricing rules as designToBom's AC-board walk:
// a device with a costed catalog product prices at cost × markup, anything
// else becomes an unpriced "Quote" line. Never invent prices.
//
// Pure module — no Supabase, no React (same discipline as scope-bom.ts).
// ─────────────────────────────────────────────────────────────────────────────

import {
  ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, dbComponentKind, defaultAcCombiner,
  defaultDbComponent, parseEnclosureSpec, DB_SUPPLY_ID,
  type AcCombiner, type DbComponent, type DbComponentKind,
} from '@/lib/solar/system-design'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { newScopeLine, type ScopeLine } from './scope'

// Defensive mirror of ProductPicker's custom sentinel (same as design-bom.ts):
// a `custom:<label>` value is a placeholder typed while designing — surface the
// label as an unpriced line, never the raw marker.
const CUSTOM_PREFIX = 'custom:'
const isCustomValue = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.startsWith(CUSTOM_PREFIX)

const round2 = (n: number) => Math.round(n * 100) / 100

/** Shopping description for a board with no catalog enclosure picked. */
export function dbEnclosureDescription(board: AcCombiner): string {
  const material = ENCLOSURE_MATERIALS.find((m) => m.value === board.material)?.label ?? board.material
  const mount = ENCLOSURE_MOUNTS.find((m) => m.value === board.mount)?.label ?? board.mount
  const code = board.productCode.trim()
  return `DB enclosure — ${board.ways}-way, ${material}, ${mount} mount${code ? ` (${code})` : ''}`
}

/** Key standing for the enclosure line in a source/preserve map (component ids
 *  cover everything else on the board). */
export const DB_ENCLOSURE_KEY = 'enclosure'

/**
 * One line for the enclosure, then one line per device in wiring order.
 * Catalog lines carry sellOverridden:false so generate re-prices them from the
 * authoritative catalog cost; everything unpriceable lands as a "Quote" line.
 *
 * `preserve` (from scopeLinesToDbBoard) re-uses the scope line each part was
 * built from — same line id, so re-running the builder EDITS the section's
 * lines in place instead of appending a second copy of the board, and the
 * hand-set bits of a line (optional flag, note, a typed price) survive the
 * round trip. A price typed against a catalog product is kept only while that
 * product is unchanged; swap the product and the price re-derives from the new
 * one. A price typed on a free-text line is always kept — the board has no
 * product to price it from, so re-deriving would just wipe it.
 */
export function dbBoardToScopeLines(
  board: AcCombiner,
  catalog: Map<string, EquipmentCatalogItem>,
  markup: number,
  section: string,
  opts: { preserve?: Map<string, ScopeLine> } = {},
): ScopeLine[] {
  const lines: ScopeLine[] = []
  const push = (key: string, patch: Partial<ScopeLine>) => {
    const line: ScopeLine = { ...newScopeLine(section, 'material'), ...patch }
    const prev = opts.preserve?.get(key)
    if (prev) {
      line.id = prev.id
      line.optional = prev.optional
      line.note = prev.note
      const sameProduct = prev.catalogId === line.catalogId
      if (prev.sellOverridden && prev.unitSellR > 0 && sameProduct) {
        line.unitSellR = prev.unitSellR
        line.sellOverridden = true
      } else if (sameProduct && !line.catalogId && prev.unitSellR > 0) {
        // Free-text line: the price was typed straight in (the editor leaves
        // sellOverridden false for these). The board can't re-derive it, so
        // carry it across rather than resetting the line to "Quote".
        line.unitCostR = prev.unitCostR
        line.unitSellR = prev.unitSellR
      }
    }
    lines.push(line)
  }
  const catalogLine = (key: string, item: EquipmentCatalogItem, qty: number) => {
    // A zero-cost item stays unpriced (unitSellR 0 → "Quote"), matching the
    // catalog-pick path in the scope editor and scopeToBom's no-cost status.
    const cost = item.cost_rands > 0 ? round2(item.cost_rands) : 0
    push(key, {
      catalogId: item.id, sku: item.sku, description: item.description,
      qty, unitCostR: cost, unitSellR: round2(cost * markup),
    })
  }

  const enclosure = board.enclosureCatalogId ? catalog.get(board.enclosureCatalogId) : undefined
  if (enclosure) catalogLine(DB_ENCLOSURE_KEY, enclosure, 1)
  else push(DB_ENCLOSURE_KEY, { description: dbEnclosureDescription(board), qty: 1 })

  for (const comp of board.components) {
    const qty = Math.max(1, Math.round(comp.qty || 1))
    const item = comp.productId && !isCustomValue(comp.productId)
      ? catalog.get(comp.productId)
      : undefined
    if (item) { catalogLine(comp.id, item, qty); continue }
    const label = isCustomValue(comp.productId)
      ? comp.productId.slice(CUSTOM_PREFIX.length).trim() || comp.label
      : comp.label
    push(comp.id, { description: label.trim() || dbComponentKind(comp.kind).label, qty })
  }

  return lines
}

// ── Reading a board back OUT of the section's lines ───────────────────────────
// The board itself isn't persisted — the scope lines are the single source of
// truth, so reopening the builder rebuilds the board from what's actually on the
// quote (nothing can go stale, and lines edited by hand are respected).

/** Description written by dbEnclosureDescription, e.g.
 *  "DB enclosure — 12-way, Plastic, Surface mount (CHINT-DB-12W-S-PL)". */
const ENCLOSURE_DESC_RE = /^DB enclosure\s*—\s*(\d+)-way,\s*([^,]+),\s*(.+?)\s+mount(?:\s*\((.+)\))?$/i

/** Keyword → device kind, most specific first (RCBO before breaker, etc.). */
const KIND_HINTS: Array<[RegExp, DbComponentKind]> = [
  [/\brcbo\b/i, 'rcbo'],
  [/\brccb\b|earth\s*leakage|\bel\s*unit\b/i, 'rccb'],
  [/\bspd\b|surge/i, 'spd'],
  [/change\s*over|changeover|\bcos\b/i, 'changeover'],
  [/main\s*(switch|isolator)/i, 'mainSwitch'],
  [/isolator|switch[-\s]?disconnector/i, 'isolator'],
  [/contactor/i, 'contactor'],
  [/timer|time\s*switch/i, 'timer'],
  [/kwh\s*meter|energy\s*meter|\bmeter\b/i, 'meter'],
  [/indicator|pilot\s*light|neon/i, 'indicator'],
  [/bus\s*bar|busbar|neutral\s*bar|earth\s*bar/i, 'busbar'],
  [/breaker|\bmcb\b|\bmccb\b/i, 'breaker'],
]

/** Catalog category → device kind, used when the wording gives nothing away. */
const KIND_BY_CATEGORY: Partial<Record<EquipmentCatalogItem['category'], DbComponentKind>> = {
  breaker: 'breaker',
  rccb: 'rccb',
  spd: 'spd',
  isolator: 'isolator',
}

function inferKind(description: string, item: EquipmentCatalogItem | undefined): DbComponentKind {
  for (const [re, kind] of KIND_HINTS) if (re.test(description)) return kind
  return (item && KIND_BY_CATEGORY[item.category]) ?? 'custom'
}

export interface DbBoardFromScope {
  board: AcCombiner
  /** DB_ENCLOSURE_KEY / component id → the scope line it was built from. Feed
   *  back to dbBoardToScopeLines as `preserve` so the rebuild edits in place. */
  sources: Map<string, ScopeLine>
}

/**
 * Rebuild a board from the lines already sitting in a scope section, so the
 * builder opens on the parts that were picked before rather than a blank board.
 *
 * Only per-item material lines are taken: labour, fees and anything sold by the
 * metre or hour (cable, trunking, a day on site) isn't a device inside a DB, so
 * it stays in the section untouched. The first enclosure — a catalog item in the
 * `enclosure` category, or a line matching our own generated wording — becomes
 * the board's enclosure; every other line becomes a device with its product
 * pre-selected.
 *
 * Wiring is not carried on a scope line, so it's inferred (main device off the
 * incoming supply, the rest off that device) — the shape these boards nearly
 * always take, and adjustable in the builder.
 */
export function scopeLinesToDbBoard(
  lines: ScopeLine[],
  catalog: Map<string, EquipmentCatalogItem>,
): DbBoardFromScope {
  const board = defaultAcCombiner()
  const sources = new Map<string, ScopeLine>()
  const usable = lines.filter((l) => l.kind === 'material' && l.unit === 'ea')
  if (usable.length === 0) return { board, sources }

  const enclosureIdx = usable.findIndex((l) => {
    const item = l.catalogId ? catalog.get(l.catalogId) : undefined
    if (item) return item.category === 'enclosure'
    return ENCLOSURE_DESC_RE.test(l.description.trim())
  })

  if (enclosureIdx >= 0) {
    const line = usable[enclosureIdx]
    sources.set(DB_ENCLOSURE_KEY, line)
    const item = line.catalogId ? catalog.get(line.catalogId) : undefined
    if (item) {
      const spec = parseEnclosureSpec(item.notes)
      board.enclosureCatalogId = item.id
      board.productCode = item.sku
      board.productCodeLocked = true
      if (spec) {
        board.material = spec.material
        board.mount = spec.mount
        board.ways = spec.ways
        board.rows = spec.rows
        board.ipRating = spec.ip
      }
    } else {
      // A manual enclosure line — read its config back out of our own wording.
      const m = ENCLOSURE_DESC_RE.exec(line.description.trim())
      if (m) {
        board.ways = Number(m[1]) || board.ways
        const material = ENCLOSURE_MATERIALS.find((x) => x.label.toLowerCase() === m[2].trim().toLowerCase())
        const mount = ENCLOSURE_MOUNTS.find((x) => x.label.toLowerCase() === m[3].trim().toLowerCase())
        if (material) board.material = material.value
        if (mount) board.mount = mount.value
        if (m[4]) { board.productCode = m[4].trim(); board.productCodeLocked = true }
      }
    }
  }

  const components: DbComponent[] = []
  usable.forEach((line, i) => {
    if (i === enclosureIdx) return
    const item = line.catalogId ? catalog.get(line.catalogId) : undefined
    const description = (line.description || item?.description || '').trim()
    const comp = defaultDbComponent(inferKind(description, item))
    comp.label = description || comp.label
    comp.productId = line.catalogId
    comp.qty = Math.max(1, Math.round(line.qty || 1))
    components.push(comp)
    sources.set(comp.id, line)
  })

  if (components.length > 0) {
    // Inferred feed: the first main-ish device takes the incoming supply and the
    // rest hang off it (the default board shape) — corrected in the builder.
    const mainIdx = Math.max(0, components.findIndex((c) =>
      c.kind === 'mainSwitch' || c.kind === 'breaker' || c.kind === 'changeover'))
    const main = components[mainIdx]
    main.fedFrom = [DB_SUPPLY_ID]
    if (main.kind === 'changeover') main.fedFrom = [DB_SUPPLY_ID, '']
    components.forEach((c, i) => {
      if (i === mainIdx) return
      const inputs = dbComponentKind(c.kind).inputs
      c.fedFrom = Array.from({ length: inputs }, (_, k) => (k === 0 ? main.id : ''))
    })
    board.components = components
  }

  return { board, sources }
}
