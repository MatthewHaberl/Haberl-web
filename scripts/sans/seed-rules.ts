/**
 * Seed sans_rules from the live design-rules registry plus the Amendment 3
 * PV/battery rules. Re-runnable: clears source-tagged rows first.
 *
 * Run: npx tsx scripts/sans/seed-rules.ts
 * Auth: dev-admin login over PostgREST (temp admin insert policy, migration 088 era).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DESIGN_RULES } from '../../lib/solar/rules-registry'

const ENV_PATH = resolve(__dirname, '../../.env.local')

function env(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [k, ...rest] = trimmed.split('=')
    out[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/** Pull SANS clause refs ("§6.7.5", "clause 8.7", "annex I") out of free text. */
function clauseRefs(...texts: string[]): string[] {
  const refs = new Set<string>()
  for (const t of texts) {
    for (const m of t.matchAll(/§\s?(\d+(?:\.\d+)*)/g)) refs.add(m[1])
    for (const m of t.matchAll(/annex\s+([A-S])\b/gi)) refs.add(m[1].toUpperCase())
  }
  return [...refs]
}

const SEVERITY: Record<string, 'blocker' | 'warning' | 'info'> = {
  both: 'warning', verifier: 'warning', calculator: 'info', site: 'info', commercial: 'info',
}
const IMPLEMENTED: Record<string, string | null> = {
  calculator: 'lib/solar/quote-calculator.ts',
  verifier: 'lib/solar/compliance.ts runComplianceChecks()',
  both: 'lib/solar/quote-calculator.ts + lib/solar/compliance.ts',
  site: null,
  commercial: 'lib/solar/quote-calculator.ts',
}

interface RuleRow {
  rule_key: string
  title: string
  summary: string
  clause_refs: string[]
  category: string
  severity: 'blocker' | 'warning' | 'info'
  machine_checkable: boolean
  implemented_in: string | null
  source: string
}

const registryRows: RuleRow[] = DESIGN_RULES.map((r) => ({
  rule_key: r.id,
  title: r.title,
  summary: `${r.rule} Why: ${r.why}`,
  clause_refs: clauseRefs(r.rule, r.reference, r.title, r.why),
  category: r.category,
  severity: SEVERITY[r.enforcement] ?? 'info',
  machine_checkable: ['calculator', 'verifier', 'both'].includes(r.enforcement),
  implemented_in: IMPLEMENTED[r.enforcement] ?? null,
  source: 'rules-registry',
}))

/** Amendment 3 (Ed 3.03) rules that will bind PV/battery work — tracked ahead of publication. */
const amdt3Rows: RuleRow[] = [
  { rule_key: 'AMDT3-MULTI-01', title: 'One source per multicore cable', summary: 'A multicore cable may not contain conductors from circuits supplied by different sources — e.g. inverter input and inverter output must not share a multicore. Also: one disconnecting device per multicore cable.', clause_refs: ['6.1.13', '6.9.1'], category: 'Cabling, Conduit & Glands', severity: 'blocker', machine_checkable: false, implemented_in: null, source: 'amdt3' },
  { rule_key: 'AMDT3-NE-01', title: 'Island-mode N-E bond must live inside the converter', summary: 'For backup-capable inverters/generators, neutral and PE may only be connected while intentionally in island mode, and the reference must be internal to the unit or manufacturer-supplied control gear. An external relay/contactor arrangement is not accepted.', clause_refs: ['7.12.3'], category: 'AC & Distribution Board', severity: 'blocker', machine_checkable: false, implemented_in: null, source: 'amdt3' },
  { rule_key: 'AMDT3-PSCC-01', title: 'Sum PSCC across paralleled sources', summary: 'Where more than one source can operate in parallel (grid + PV + battery), prospective short-circuit current must be summed. Battery PSCC comes from the BMS nameplate, datasheet, manufacturer or calculation.', clause_refs: ['8.4'], category: 'Compliance & Paperwork', severity: 'warning', machine_checkable: false, implemented_in: null, source: 'amdt3' },
  { rule_key: 'AMDT3-INSUL-01', title: 'PV array DC insulation-resistance test', summary: 'PV array DC circuits get a dedicated insulation-resistance test per IEC 62446-1:2018, separate from the AC tests; minimum 1,0 MΩ.', clause_refs: ['8.6.8'], category: 'Compliance & Paperwork', severity: 'warning', machine_checkable: false, implemented_in: null, source: 'amdt3' },
  { rule_key: 'AMDT3-STRUCT-01', title: 'PV mounting needs structural sign-off', summary: 'PV support structures and module mounting must comply with building regulations and SANS 60364-7-712 structural load requirements; mechanical soundness may need a competent-person opinion; roof penetrations must be weatherproof.', clause_refs: ['8.6.15'], category: 'Compliance & Paperwork', severity: 'warning', machine_checkable: false, implemented_in: null, source: 'amdt3' },
  { rule_key: 'AMDT3-FIRE-01', title: 'PV fire-risk compliance', summary: 'Fire risks must comply with SANS 60364-7-712 plus national and local fire regulations applicable to the installation.', clause_refs: ['8.6.16'], category: 'Compliance & Paperwork', severity: 'warning', machine_checkable: false, implemented_in: null, source: 'amdt3' },
  { rule_key: 'AMDT3-REPORT-01', title: 'Annex S test report for the PV/battery portion', summary: 'Where an installation includes a generating plant, an Annex S test report (converters, storage, PV modules, DC voltage, islanding settings, SLD, bonding continuity, ECC sizing, neutral loop impedance, PSCC, elevated N-E voltage) must be attached for the generating-plant portion, with a registered-person declaration.', clause_refs: ['8.7', 'S'], category: 'Compliance & Paperwork', severity: 'blocker', machine_checkable: false, implemented_in: null, source: 'amdt3' },
]

async function main() {
  const e = env()
  const url = e.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
  const anon = e.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: e.DEV_PORTAL_EMAIL_ADMIN, password: e.DEV_PORTAL_PASSWORD }),
  })
  if (!login.ok) throw new Error(`login failed: ${login.status}`)
  const { access_token } = (await login.json()) as { access_token: string }

  const rows = [...registryRows, ...amdt3Rows]
  const res = await fetch(`${url}/rest/v1/sans_rules?on_conflict=rule_key`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  console.log(`seeded ${rows.length} rules -> ${res.status}`)
  if (!res.ok) console.error(await res.text())
}

main().catch((err) => { console.error(err); process.exit(1) })
