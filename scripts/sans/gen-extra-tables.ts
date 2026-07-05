/**
 * One-shot generator for the second batch of SANS cable tables.
 *
 * 1. Cross-checks the hand-transcribed tables 6.2–6.4 in lib/sans/tables
 *    against the agents' independent transcription (double-entry verification).
 * 2. Emits lib/sans/tables/{voltage-drop-extra,current-capacity-extra,soil-factors}.ts
 *    from the extraction JSON (tables 6.5–6.9 + 6.11/6.12).
 *
 * Run: npx tsx scripts/sans/gen-extra-tables.ts <extract-dir>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { VD_CABLE_TYPES } from '../../lib/sans/tables/voltage-drop'
import { CC_CABLE_TYPES } from '../../lib/sans/tables/current-capacity'

const EXTRACT = process.argv[2]
if (!EXTRACT) throw new Error('usage: gen-extra-tables.ts <extract-dir>')

interface JsonTable {
  table_id: string
  title: string
  printed_page: number
  applies_to?: string
  columns: { key: string; label: string; unit: string | null }[]
  rows: Record<string, number | string | null>[]
  footnotes?: string[]
}

function load(file: string): JsonTable[] {
  return JSON.parse(readFileSync(join(EXTRACT, file), 'utf-8'))
}

const byId = new Map<string, JsonTable>()
for (const f of ['tables-1.json', 'tables-2.json', 'tables-3.json', 'tables-4.json']) {
  for (const t of load(f)) byId.set(t.table_id, t)
}

// ── 1. Cross-check overlap ──────────────────────────────────────────────────
let mismatches = 0
function expect(desc: string, mine: number | null | undefined, theirs: number | string | null | undefined) {
  const a = mine ?? null
  const b = typeof theirs === 'string' ? parseFloat(theirs) : theirs ?? null
  if (a === null && b === null) return
  if (a === null || b === null || Math.abs(a - b) > 1e-9) {
    console.log(`MISMATCH ${desc}: mine=${a} agents=${b}`)
    mismatches++
  }
}

// 6.2(a)/6.3(a)/6.4(a) ampacity
const ccMap: Record<string, Record<string, string>> = {
  '6.2(a)': { m1_1ph: 'm1_1ph', m1_3ph: 'm1_3ph', m2_1ph: 'm2_1ph', m2_3ph: 'm2_3ph', m3_1ph: 'm3_1ph', m3_3ph: 'm3_3ph', m4_1ph: 'm4_1ph', m4_3ph: 'm4_3ph', m5_hz: 'm5_horizontal', m5_vt: 'm5_vertical', m5_trefoil: 'm5_trefoil' },
  '6.3(a)': { m1_2c: 'm1_2core_1ph', m1_34c: 'm1_3or4core_3ph', m2_2c: 'm2_2core_1ph', m2_34c: 'm2_3or4core_3ph', m3_2c: 'm3_2core_1ph', m3_34c: 'm3_3or4core_3ph', m46_2c: 'm4or6_2core_1ph', m46_34c: 'm4or6_3or4core_3ph' },
  '6.4(a)': { m3_2c: 'm3_2core_1ph', m3_34c: 'm3_3or4core_3ph', m46_2c: 'm4_2core_1ph', m46_34c: 'm4_3or4core_3ph' },
}
for (const cable of CC_CABLE_TYPES) {
  const map = ccMap[cable.table]
  const jt = byId.get(cable.table)
  if (!map || !jt) continue
  for (const row of cable.rows) {
    const jr = jt.rows.find((r) => r.size_mm2 === row.size)
    if (!jr) { console.log(`MISMATCH ${cable.table} size ${row.size}: missing in agents`); mismatches++; continue }
    for (const [mineKey, theirKey] of Object.entries(map)) {
      expect(`${cable.table} ${row.size}mm² ${mineKey}`, row.values[mineKey], jr[theirKey])
    }
  }
}

// voltage drop: mine values are number | {r,x,z}; agents use flat r_/x_/z_ groups
const vdMap: Record<string, Record<string, string>> = {
  '6.2(b)': { dc: 'dc', '1ph_m12': '1ph_m12', '1ph_m34': '1ph_m34', '1ph_m5': '1ph_m5', '3ph_m12': '3ph_m12', '3ph_trefoil': '3ph_m345_trefoil', '3ph_flat': '3ph_m34_flat', '3ph_spaced': '3ph_m5_spaced' },
  '6.3(b)': { dc: 'dc', '1ph': '1ph', '3ph': '3ph' },
  '6.4(b)': { dc: 'dc', '1ph': '1ph', '3ph': '3ph' },
}
for (const cable of VD_CABLE_TYPES) {
  const map = vdMap[cable.table]
  const jt = byId.get(cable.table)
  if (!map || !jt) continue
  const dcCol = jt.columns.map((c) => c.key).find((k) => k.startsWith('dc')) ?? 'dc'
  for (const row of cable.rows) {
    const jr = jt.rows.find((r) => r.size_mm2 === row.size)
    if (!jr) { console.log(`MISMATCH ${cable.table} size ${row.size}: missing in agents`); mismatches++; continue }
    for (const [mineKey, group] of Object.entries(map)) {
      const mine = row.values[mineKey]
      if (mineKey === 'dc') {
        expect(`${cable.table} ${row.size}mm² dc`, mine as number | null, jr[dcCol])
        continue
      }
      // agents: small sizes carry the single value in vd_<g> (or z_<g> when
      // there's no vd column); large sizes use r_<g>/x_<g>/z_<g>
      const zk = jr[`z_${group}`] != null ? `z_${group}` : `vd_${group}`
      if (mine == null) {
        expect(`${cable.table} ${row.size}mm² ${mineKey}.z`, null, jr[zk] ?? jr[`z_${group}`])
      } else if (typeof mine === 'number') {
        expect(`${cable.table} ${row.size}mm² ${mineKey}`, mine, jr[zk])
      } else {
        expect(`${cable.table} ${row.size}mm² ${mineKey}.r`, mine.r, jr[`r_${group}`])
        expect(`${cable.table} ${row.size}mm² ${mineKey}.x`, mine.x, jr[`x_${group}`])
        expect(`${cable.table} ${row.size}mm² ${mineKey}.z`, mine.z, jr[zk])
      }
    }
  }
}
console.log(mismatches === 0 ? 'CROSS-CHECK CLEAN: hand data matches the independent agent transcription.' : `CROSS-CHECK: ${mismatches} mismatches — investigate before shipping.`)

// ── 2. Generate the extra modules ───────────────────────────────────────────
const fmt = (v: number | string | null | undefined) =>
  v == null ? 'null' : typeof v === 'string' ? JSON.stringify(v) : String(v)

function vdGroups(t: JsonTable): string[] {
  const groups = new Set<string>()
  for (const c of t.columns) {
    const m = c.key.match(/^z_(.+)$/)
    if (m) groups.add(m[1])
  }
  return [...groups]
}

function vdCableTs(varName: string, id: string, label: string, t: JsonTable, clauseRef: string, groupLabels: Record<string, { label: string; phases: 0 | 1 | 3 }>): string {
  const dcCol = t.columns.map((c) => c.key).find((k) => k.startsWith('dc'))
  const groups = vdGroups(t)
  const arrangements = [
    ...(dcCol ? [`    { id: 'dc', label: 'd.c.', phases: 0 as const },`] : []),
    ...groups.map((g) => {
      const gl = groupLabels[g] ?? { label: g, phases: g.includes('3ph') ? 3 : 1 }
      return `    { id: ${JSON.stringify(g)}, label: ${JSON.stringify(gl.label)}, phases: ${gl.phases} as const },`
    }),
  ].join('\n')
  const rows = t.rows.map((r) => {
    const parts: string[] = []
    if (dcCol) parts.push(`dc: ${fmt(r[dcCol])}`)
    for (const g of groups) {
      const rv = r[`r_${g}`], xv = r[`x_${g}`], zv = r[`z_${g}`] ?? r[`vd_${g}`]
      if (zv == null) parts.push(`${JSON.stringify(g)}: null`)
      else if (rv == null || xv == null) parts.push(`${JSON.stringify(g)}: ${fmt(zv)}`)
      else parts.push(`${JSON.stringify(g)}: { r: ${fmt(rv)}, x: ${fmt(xv)}, z: ${fmt(zv)} }`)
    }
    return `    { size: ${r.size_mm2}, values: { ${parts.join(', ')} } },`
  }).join('\n')
  return `/** ${t.title.replace(/\s+/g, ' ')} (printed p. ${t.printed_page}) */
const ${varName}: VdCableType = {
  id: ${JSON.stringify(id)},
  label: ${JSON.stringify(label)},
  table: ${JSON.stringify(t.table_id)},
  clauseRef: ${JSON.stringify(clauseRef)},
  arrangements: [
${arrangements}
  ],
  rows: [
${rows}
  ],
}
`
}

function ccCableTs(varName: string, id: string, label: string, t: JsonTable, labelMap?: Record<string, string>): string {
  const cols = t.columns.filter((c) => c.key !== 'size_mm2')
  const arrangements = cols.map((c) => {
    const phases = /3ph|3or4|3_4core/.test(c.key) ? 3 : 1
    return `    { id: ${JSON.stringify(c.key)}, label: ${JSON.stringify(labelMap?.[c.key] ?? c.label)}, phases: ${phases} as const },`
  }).join('\n')
  const rows = t.rows.map((r) => {
    const parts = cols.map((c) => `${JSON.stringify(c.key)}: ${fmt(r[c.key])}`)
    return `    { size: ${r.size_mm2}, values: { ${parts.join(', ')} } },`
  }).join('\n')
  return `/** ${t.title.replace(/\s+/g, ' ')} (printed p. ${t.printed_page}) */
const ${varName}: CcCableType = {
  id: ${JSON.stringify(id)},
  label: ${JSON.stringify(label)},
  table: ${JSON.stringify(t.table_id)},
  arrangements: [
${arrangements}
  ],
  rows: [
${rows}
  ],
}
`
}

const OUT_DIR = resolve(__dirname, '../../lib/sans/tables')

// voltage-drop-extra.ts — 6.5(b) Al single-core, 6.6(b) Al multicore, 6.7(b) Al SWA, 6.9(b) rubber flex
{
  const g65 = {
    '1ph_m12': { label: 'Single-phase — methods 1 & 2 (enclosed)', phases: 1 as const },
    '1ph_m34': { label: 'Single-phase — methods 3 & 4 (clipped / tray, touching)', phases: 1 as const },
    '1ph_m5': { label: 'Single-phase — method 5 (spaced, free air)', phases: 1 as const },
    '3ph_m12': { label: 'Three-phase — methods 1 & 2 (enclosed)', phases: 3 as const },
    '3ph_trefoil': { label: 'Three-phase — trefoil', phases: 3 as const },
    '3ph_m345_trefoil': { label: 'Three-phase — trefoil (methods 3, 4 & 5)', phases: 3 as const },
    '3ph_m34_flat': { label: 'Three-phase — flat & touching (methods 3 & 4)', phases: 3 as const },
    '3ph_m5_spaced': { label: 'Three-phase — flat, spaced (method 5)', phases: 3 as const },
    '3ph_flat_touch': { label: 'Three-phase — flat & touching (methods 3 & 4)', phases: 3 as const },
    '3ph_flat_spaced': { label: 'Three-phase — flat, spaced (method 5)', phases: 3 as const },
  }
  const gPlain = {
    '1ph': { label: 'Single-phase — two-core cable', phases: 1 as const },
    '3ph': { label: 'Three-phase — three/four-core cable', phases: 3 as const },
    '1ph_2core': { label: 'Single-phase — two-core cable', phases: 1 as const },
    '1ph_2single': { label: 'Single-phase — two single cables', phases: 1 as const },
  }
  const parts = [
    vdCableTs('SINGLE_AL', 'single-al', 'Single-core PVC, aluminium conductors', byId.get('6.5(b)')!, '6.2.7', g65),
    vdCableTs('MULTI_AL', 'multi-al', 'Multicore PVC, unarmoured, aluminium', byId.get('6.6(b)')!, '6.2.7', gPlain),
    vdCableTs('MULTI_AL_SWA', 'multi-al-swa', 'Multicore PVC, armoured (SWA), aluminium', byId.get('6.7(b)')!, '6.2.7', gPlain),
    vdCableTs('RUBBER_FLEX', 'rubber-flex', '85/150 °C rubber & silicone-rubber insulated, copper', byId.get('6.9(b)')!, '6.2.7', gPlain),
  ]
  const src = `/**
 * SANS 10142-1:2024 Ed 3.2 voltage-drop tables — second batch (aluminium and
 * rubber-insulated). GENERATED by scripts/sans/gen-extra-tables.ts from the
 * agent-transcribed, self-checked extraction JSON — edit the generator, not this file.
 */
import type { VdCableType } from './voltage-drop'

${parts.join('\n')}
export const VD_CABLE_TYPES_EXTRA: VdCableType[] = [SINGLE_AL, MULTI_AL, MULTI_AL_SWA, RUBBER_FLEX]
`
  writeFileSync(join(OUT_DIR, 'voltage-drop-extra.ts'), src)
  console.log('wrote voltage-drop-extra.ts')
}

// current-capacity-extra.ts — 6.5(a) Al single-core, 6.7(a) Al SWA, 6.8 buried, 6.9(a) rubber
{
  const parts = [
    ccCableTs('SINGLE_AL', 'single-al', 'Single-core PVC, aluminium conductors', byId.get('6.5(a)')!),
    ccCableTs('MULTI_AL_SWA', 'multi-al-swa', 'Multicore PVC, armoured (SWA), aluminium', byId.get('6.7(a)')!),
    ccCableTs('BURIED_SWA', 'buried-swa', 'Multicore PVC armoured, buried (direct / in ducts)', byId.get('6.8')!),
    ccCableTs('RUBBER_FLEX', 'rubber-flex', '85/150 °C rubber & silicone-rubber insulated, copper', byId.get('6.9(a)')!),
  ]
  const src = `/**
 * SANS 10142-1:2024 Ed 3.2 current-capacity tables — second batch (aluminium,
 * buried and rubber-insulated). GENERATED by scripts/sans/gen-extra-tables.ts —
 * edit the generator, not this file. Table 6.6(a) (Al multicore, unarmoured)
 * is transcribed by hand in current-capacity.ts's extra list if present.
 */
import type { CcCableType } from './current-capacity'

${parts.join('\n')}
export const CC_CABLE_TYPES_EXTRA: CcCableType[] = [SINGLE_AL, MULTI_AL_SWA, BURIED_SWA, RUBBER_FLEX]
`
  writeFileSync(join(OUT_DIR, 'current-capacity-extra.ts'), src)
  console.log('wrote current-capacity-extra.ts')
}

// soil-factors.ts — 6.11 soil temperature + 6.12 soil thermal resistivity
{
  const t11 = byId.get('6.11')!
  const t12 = byId.get('6.12')!
  const rows11 = t11.rows.map((r) => `  { soilTempC: ${fmt(r.soil_temp_c)}, factor: ${fmt(r.factor)} },`).join('\n')
  const rows12 = t12.rows.map((r) => `  { resistivityKmW: ${fmt(r.resistivity_kmw)}, buriedDirect: ${fmt(r.buried_direct)}, inPipes: ${fmt(r.in_pipes)} },`).join('\n')
  const src = `/**
 * SANS 10142-1:2024 Ed 3.2 — buried-cable correction factors.
 * Table 6.11 (soil temperature, 25 °C base) and table 6.12 (soil thermal
 * resistivity). GENERATED by scripts/sans/gen-extra-tables.ts.
 */
export const SOIL_TEMP_FACTORS: { soilTempC: number; factor: number | null }[] = [
${rows11}
]

export const SOIL_RESISTIVITY_FACTORS: { resistivityKmW: number; buriedDirect: number | null; inPipes: number | null }[] = [
${rows12}
]
`
  writeFileSync(join(OUT_DIR, 'soil-factors.ts'), src)
  console.log('wrote soil-factors.ts')
}
