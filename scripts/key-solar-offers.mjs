// Attach Key Electric supplier offers to EXISTING catalog products for the held-back
// "review" solar items (brands Matthew already stocks). Conservative spec match only:
// same brand + same category + exact kW (inverter) / exact Wp (panel) / kWh within a
// small tolerance (battery) + compatible phase. Anything ambiguous (>1 candidate) or
// unmatched is SKIPPED and reported — never guessed, because the offer feeds quote
// pricing via the migration-052 cheapest-offer trigger.
//
//   node --env-file=.env.local scripts/key-solar-offers.mjs <reviewJsonPath>            # dry run
//   node --env-file=.env.local scripts/key-solar-offers.mjs <reviewJsonPath> --commit   # attach

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const jsonPath = process.argv[2]
const commit = process.argv.includes('--commit')
if (!jsonPath) { console.error('usage: node scripts/key-solar-offers.mjs <reviewJsonPath> [--commit]'); process.exit(1) }

const VAT = 1.15
const supabase = createClient(url, key, { auth: { persistSession: false } })
const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const nb = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const phaseOk = (a, b) => !a || !b || a === 'any' || b === 'any' || a === b

async function fetchExisting() {
  const all = []; let from = 0; const size = 1000
  while (true) {
    const { data, error } = await supabase.from('equipment_catalog')
      .select('id,sku,brand,category,supplier,cost_rands,watts_ac,watts_dc,kwh,phase,description')
      .range(from, from + size - 1)
    if (error) { console.error('fetch error', error.message); process.exit(2) }
    all.push(...data); if (data.length < size) break; from += size
  }
  return all
}

// Same kW + phase is NOT enough for inverters: a 5kW *hybrid* and a 5kW *solar power
// converter* / *off-grid* unit are different products that happen to share a rating.
// Refuse to pair across those sub-types so we never attach an offer to the wrong SKU.
function typeOk(a, b) {
  const conv = (s) => /converter|\bspc\b|grid.?tie/i.test(s)
  const off = (s) => /off.?grid/i.test(s)
  return conv(a) === conv(b) && off(a) === off(b)
}

function findMatch(r, existing) {
  const cands = existing.filter((e) =>
    nb(e.brand) === nb(r.brand) && e.category === r.category && nb(e.supplier || '') !== 'keyelectric')
  if (r.category === 'inverter' && r.watts_ac) return cands.filter((e) => e.watts_ac === r.watts_ac && phaseOk(e.phase, r.phase) && typeOk(e.description, r.description))
  if (r.category === 'battery' && r.kwh) return cands.filter((e) => e.kwh != null && Math.abs(Number(e.kwh) - Number(r.kwh)) < 0.15)
  if (r.category === 'panel' && r.watts_dc) return cands.filter((e) => Number(e.watts_dc) === Number(r.watts_dc))
  return []
}

async function attach(e, r) {
  const supplier = e.supplier && e.supplier !== 'Key Electric' ? e.supplier : 'Existing list'
  await supabase.from('equipment_supplier_offers').upsert({
    catalog_id: e.id, supplier, supplier_sku: e.sku,
    cost_rands: e.cost_rands, list_price_rands: Math.round((e.cost_rands / VAT) * 100) / 100,
  }, { onConflict: 'catalog_id,supplier', ignoreDuplicates: true })
  await supabase.from('equipment_supplier_offers').upsert({
    catalog_id: e.id, supplier: 'Key Electric', supplier_sku: r.sku,
    cost_rands: r.cost_rands, list_price_rands: r.price_ex_vat ?? Math.round((r.cost_rands / VAT) * 100) / 100,
    source_url: r.source_url || null,
  }, { onConflict: 'catalog_id,supplier' })
}

const existing = await fetchExisting()
const matched = [], ambiguous = [], nomatch = []
for (const r of rows) {
  const m = findMatch(r, existing)
  if (m.length === 1) matched.push({ r, e: m[0] })
  else if (m.length > 1) ambiguous.push({ r, m })
  else nomatch.push(r)
}

console.log(`review ${rows.length} | unique match ${matched.length} | ambiguous ${ambiguous.length} | no match ${nomatch.length}\n`)
console.log('== MATCH -> attach Key offer ==')
for (const { r, e } of matched) console.log(`  ${r.brand} ${r.sku} (Key R${r.cost_rands}) -> ${e.sku} "${e.description}" (yours R${e.cost_rands})`)
console.log('\n== AMBIGUOUS -> skipped ==')
for (const { r, m } of ambiguous) console.log(`  ${r.brand} ${r.sku} "${r.description}" ~ [${m.map((e) => e.sku).join(', ')}]`)
console.log('\n== NO MATCH -> skipped (import separately or ignore) ==')
for (const r of nomatch) console.log(`  ${r.category} ${r.brand} ${r.sku} "${r.description}"`)

// Emit the genuinely-new models (no existing twin) so they can be imported as their
// own products — EXCLUDING utility-scale IES gear (MWh containers / big ESS cabinets /
// 61HV rack modules) which Matthew doesn't quote. Written every run; harmless dry-run.
const isUtilityIes = (r) => nb(r.brand) === 'ies' &&
  (r.kwh == null || Number(r.kwh) > 60 || /cabinet|mwh|\brack\b|module|\bbcu\b|control unit/i.test(r.description))
const newModels = nomatch.filter((r) => !isUtilityIes(r))
const outPath = jsonPath.replace(/\.json$/, '').replace(/review$/, '') + 'new-models.json'
fs.writeFileSync(outPath, JSON.stringify(newModels, null, 2))
console.log(`\nwrote ${newModels.length} new-model rows -> ${outPath} (utility IES skipped: ${nomatch.length - newModels.length})`)

if (!commit) { console.log('\nDRY RUN — add --commit to attach offers.'); process.exit(0) }
let n = 0
for (const { r, e } of matched) { await attach(e, r); n++ }
console.log(`\nDONE — Key Electric offers attached to ${n} existing products.`)
