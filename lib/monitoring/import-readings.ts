/**
 * CSV importer for per-minute history exported from a brand portal
 * (Sunsynk "Operational Data" / Victron VRM "data download" → Save As CSV).
 * This is the only route to sub-5-minute resolution, since the brand APIs
 * downsample. Headers vary between portals and firmware, so we fuzzy-map
 * columns to our reading fields and report exactly what we matched.
 *
 * No spreadsheet dependency: callers save the .xlsx as .csv first. Times with
 * no timezone are read as SAST (UTC+02:00), matching Haberl's fleet.
 */
import type { NormalisedReading } from './types'

type Field = keyof Pick<
  NormalisedReading,
  'pv_power_w' | 'battery_power_w' | 'grid_power_w' | 'load_power_w'
  | 'battery_soc_pct' | 'battery_voltage_v' | 'grid_frequency_hz' | 'inverter_temp_c'
>

/** Header substrings (lowercased) that map to each field, first match wins. */
const FIELD_ALIASES: Array<[Field, string[]]> = [
  ['battery_soc_pct',   ['soc', 'state of charge']],
  ['battery_voltage_v', ['battery voltage', 'batt voltage', 'vbat', 'bat voltage']],
  ['battery_power_w',   ['battery power', 'batt power', 'battery(w)', 'battery w', 'bat power']],
  ['pv_power_w',        ['pv power', 'solar', 'generation', 'pv(w)', 'pv w', 'pv1', 'pv ']],
  ['grid_power_w',      ['grid power', 'grid(w)', 'grid w', 'grid ']],
  ['load_power_w',      ['load power', 'consumption', 'load(w)', 'load w', 'load ']],
  ['grid_frequency_hz', ['frequency', 'grid freq', 'hz']],
  ['inverter_temp_c',   ['temperature', 'temp', 'inverter temp', 'dc temp']],
]

const TIME_ALIASES = ['update time', 'timestamp', 'datetime', 'date/time', 'time', 'date']

export interface ImportResult {
  rows: Array<NormalisedReading & { reading_source: 'import' }>
  headers: string[]
  mapping: Partial<Record<Field | 'time', string>>
  unmapped: string[]
  skipped: number
}

/** RFC-4180-ish CSV split: handles quoted fields and embedded commas/quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = '', row: string[] = [], inQuotes = false
  const src = text.replace(/^﻿/, '')  // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v.trim() !== '')) rows.push(row) }
  return rows
}

function toNumber(raw: string, kw: boolean): number | null {
  const n = parseFloat(raw.replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(n)) return null
  return kw ? Math.round(n * 1000) : n
}

/** Parse a portal time cell to ISO. No-offset strings are read as SAST (+02:00). */
function toIso(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const hasTz = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(v)
  const candidate = hasTz ? v : `${v.replace(' ', 'T')}+02:00`
  const d = new Date(candidate)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function parseReadingsCsv(text: string): ImportResult {
  const table = parseCsv(text)
  if (table.length < 2) {
    return { rows: [], headers: table[0] ?? [], mapping: {}, unmapped: [], skipped: 0 }
  }
  const headers = table[0].map((h) => h.trim())
  const lower = headers.map((h) => h.toLowerCase())

  // Resolve column indices.
  const mapping: Partial<Record<Field | 'time', string>> = {}
  const colForField: Partial<Record<Field, number>> = {}
  const used = new Set<number>()

  let timeIdx = -1
  for (const alias of TIME_ALIASES) {
    const idx = lower.findIndex((h, i) => !used.has(i) && h.includes(alias))
    if (idx !== -1) { timeIdx = idx; used.add(idx); mapping.time = headers[idx]; break }
  }

  for (const [field, aliases] of FIELD_ALIASES) {
    const idx = lower.findIndex((h, i) => !used.has(i) && aliases.some((a) => h.includes(a)))
    if (idx !== -1) { colForField[field] = idx; used.add(idx); mapping[field] = headers[idx] }
  }

  const kwForField: Partial<Record<Field, boolean>> = {}
  for (const field of Object.keys(colForField) as Field[]) {
    kwForField[field] = /kw/i.test(headers[colForField[field]!])
  }

  const unmapped = headers.filter((_, i) => !used.has(i))
  const rows: ImportResult['rows'] = []
  let skipped = 0

  if (timeIdx === -1) return { rows, headers, mapping, unmapped, skipped: table.length - 1 }

  for (let r = 1; r < table.length; r++) {
    const cells = table[r]
    const iso = toIso(cells[timeIdx] ?? '')
    if (!iso) { skipped++; continue }

    const reading: NormalisedReading & { reading_source: 'import' } = {
      recorded_at: iso,
      pv_power_w: null, battery_power_w: null, grid_power_w: null, load_power_w: null,
      battery_soc_pct: null, battery_voltage_v: null, grid_frequency_hz: null, inverter_temp_c: null,
      pv_strings: [], fault_codes: [], device_state: 'unknown', raw_payload: { source: 'csv-import' },
      reading_source: 'import',
    }
    for (const field of Object.keys(colForField) as Field[]) {
      const cell = cells[colForField[field]!]
      if (cell != null) {
        const val = toNumber(cell, field === 'battery_soc_pct' ? false : !!kwForField[field])
        if (val !== null) reading[field] = val
      }
    }
    rows.push(reading)
  }

  return { rows, headers, mapping, unmapped, skipped }
}
