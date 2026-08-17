// Shared wire format for the design canvas's copy of the equipment catalog.
//
// The canvas needs the whole active catalog in memory (~15k rows) so every picker,
// the BOM and the faceplate can resolve a catalog id without a round-trip. Sending
// that as ordinary `select('*')` JSON costs ~7MB, most of it repeated key names and
// `specs` blobs the canvas never reads. Two savings, both applied here:
//
//   1. Only the columns the canvas actually uses are sent (see CATALOG_FIELDS).
//   2. Rows travel as positional arrays, not objects — the field names are sent once.
//
// Net effect: ~7MB -> ~3.7MB uncompressed, ~0.7MB over the wire once gzipped.
//
// Bump CATALOG_PAYLOAD_VERSION whenever CATALOG_FIELDS changes: it forms part of the
// version string, so every browser holding an older-shaped cache refetches instead of
// decoding rows against the wrong column order.

import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

export const CATALOG_PAYLOAD_VERSION = 1

/** Columns shipped to the canvas, in wire order. */
export const CATALOG_FIELDS = [
  'id',
  'category',
  'brand',
  'sku',
  'description',
  'watts_ac',
  'watts_dc',
  'kwh',
  'phase',
  'cost_rands',
  'isc_amps',
  'voc_volts',
  'sort_order',
  'notes',
  'supplier',
  'pack_size',
  'pack_unit',
  'width_mm',
  'height_mm',
  'frame_mm',
  'pending',
  'datasheet_url',
  // Panels only — see pruneSpecs(). lib/solar/compliance.ts reads vmp/imp/temp-coeff
  // off panel specs for the string check; nothing else on the canvas touches specs.
  'specs',
] as const

export type CatalogField = (typeof CATALOG_FIELDS)[number]

/** Column list for a PostgREST `.select()`. */
export const CATALOG_SELECT = CATALOG_FIELDS.join(', ')

export interface CatalogPayload {
  /** Identity of this catalog snapshot; a cache holding the same string is current. */
  version: string
  fields: readonly string[]
  rows: unknown[][]
}

/**
 * `specs` is 2.7MB of the catalog and is only read for panels. Keep it there, drop it
 * everywhere else rather than shipping blobs no caller opens.
 */
function pruneSpecs(row: Record<string, unknown>): unknown {
  return row.category === 'panel' ? (row.specs ?? null) : null
}

export function encodeCatalog(rows: Record<string, unknown>[], version: string): CatalogPayload {
  return {
    version,
    fields: CATALOG_FIELDS,
    rows: rows.map((row) =>
      CATALOG_FIELDS.map((field) => (field === 'specs' ? pruneSpecs(row) : (row[field] ?? null))),
    ),
  }
}

/**
 * Rebuild catalog items from a payload. Tolerates a payload whose `fields` differ from
 * the current CATALOG_FIELDS (an older cached copy) by mapping through the payload's
 * own field list — unknown columns are simply absent, which every reader already
 * handles since they are optional on EquipmentCatalogItem.
 */
export function decodeCatalog(payload: CatalogPayload): EquipmentCatalogItem[] {
  const fields = payload.fields ?? CATALOG_FIELDS
  return (payload.rows ?? []).map((row) => {
    const item: Record<string, unknown> = {}
    for (let i = 0; i < fields.length; i++) item[fields[i]] = row[i]
    // Only active rows are ever shipped; readers that gate on `active` still work.
    item.active = true
    return item as unknown as EquipmentCatalogItem
  })
}
