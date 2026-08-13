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
  ENCLOSURE_MATERIALS, ENCLOSURE_MOUNTS, dbComponentKind, type AcCombiner,
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

/**
 * One line for the enclosure, then one line per device in wiring order.
 * Catalog lines carry sellOverridden:false so generate re-prices them from the
 * authoritative catalog cost; everything unpriceable lands as a "Quote" line.
 */
export function dbBoardToScopeLines(
  board: AcCombiner,
  catalog: Map<string, EquipmentCatalogItem>,
  markup: number,
  section: string,
): ScopeLine[] {
  const lines: ScopeLine[] = []
  const push = (patch: Partial<ScopeLine>) =>
    lines.push({ ...newScopeLine(section, 'material'), ...patch })
  const catalogLine = (item: EquipmentCatalogItem, qty: number) => {
    // A zero-cost item stays unpriced (unitSellR 0 → "Quote"), matching the
    // catalog-pick path in the scope editor and scopeToBom's no-cost status.
    const cost = item.cost_rands > 0 ? round2(item.cost_rands) : 0
    push({
      catalogId: item.id, sku: item.sku, description: item.description,
      qty, unitCostR: cost, unitSellR: round2(cost * markup),
    })
  }

  const enclosure = board.enclosureCatalogId ? catalog.get(board.enclosureCatalogId) : undefined
  if (enclosure) catalogLine(enclosure, 1)
  else push({ description: dbEnclosureDescription(board), qty: 1 })

  for (const comp of board.components) {
    const qty = Math.max(1, Math.round(comp.qty || 1))
    const item = comp.productId && !isCustomValue(comp.productId)
      ? catalog.get(comp.productId)
      : undefined
    if (item) { catalogLine(item, qty); continue }
    const label = isCustomValue(comp.productId)
      ? comp.productId.slice(CUSTOM_PREFIX.length).trim() || comp.label
      : comp.label
    push({ description: label.trim() || dbComponentKind(comp.kind).label, qty })
  }

  return lines
}
