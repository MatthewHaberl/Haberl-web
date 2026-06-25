// Categorise + spec-parse the Key Electric "alt-power/solar" scrape, then split it
// into a dup-FREE bucket (brands not in the curated solar catalog → safe to create)
// and a REVIEW bucket (brands already stocked → potential same-product-different-SKU
// dupes that a human must eyeball). The raw scrape lands everything as category
// "other" with junk specs; this rewrites category + the electrical columns the quote
// pickers actually use, and clears the bogus protection specs the scraper attached.
//
//   node --env-file=.env.local scripts/key-solar-prep.mjs <rawJsonPath>
//
// Writes <dir>/solar-import.json (exact-SKU matches + dup-free new) and
//        <dir>/solar-review.json (overlapping-brand non-matches), and prints a summary.
// No DB writes — feed solar-import.json to key-electric-load.mjs --commit.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const rawPath = process.argv[2]
if (!rawPath) { console.error('usage: node scripts/key-solar-prep.mjs <rawJsonPath>'); process.exit(1) }

const supabase = createClient(url, key, { auth: { persistSession: false } })
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'))
const normSku = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const normBrand = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const clean = (s) => String(s || '').replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/&#8217;/g, "'")
const num = (m) => (m ? Number(m[1]) : null)

// ---- categorisation (order matters; first hit wins) ------------------------
function categorise(desc) {
  const d = desc.toLowerCase()
  const has = (re) => re.test(d)
  if (has(/cable pack|power cable/)) return 'cable'
  if (has(/inline fuse|fuse and holder|\bfuse\b/) && has(/mc4|inline|holder/)) return 'fuseholder'
  if (has(/battery connector|mc4 connector|cable connector|amphenol/)) return 'connector'
  if (has(/ev charger|electric vehicle charger|charge controller/)) return 'other'
  // Real PCS/HPS inverters carry the word "Inverter" (and say "Excluding/Including
  // Transformer"), so test \binverter\b FIRST. Standalone transformers / bypass
  // cabinets / ATS lack the word and fall through to the accessory rule below,
  // which is why that rule must come AFTER this one.
  if (has(/\binverter\b/)) return 'inverter'
  if (has(/\bbatter|lifepo|lithium\b/) || has(/ess cabinet|energy storage/)) {
    if (has(/\brack\b/) || has(/control unit|\bbcu\b|\bbms\b(?!.*\bah\b)/)) return 'other'
    return 'battery'
  }
  if (has(/circuit breaker/)) return 'breaker'
  if (has(/\bisolator\b/)) return 'isolator'
  if (has(/surge|\bspd\b/)) return 'spd'
  if (has(/transformer|combiner|bypass|automatic transfer|\bats\b|monitoring|dongle|enerlog/)) return 'other'
  if (has(/rail|clamp|bracket|roof hook|\bhook\b|washer|\bbolt|screw|\bnut\b|foot piece|splice|bushing|grommet|l-bracket|anti-theft|cable clip|mounting|\bmount\b|wing|grab|angle/)) return 'mounting'
  if (has(/solar panel|pv module/)) return 'panel'
  return 'other'
}

// ---- per-category spec / electrical-column parsing -------------------------
function phaseOf(d) {
  if (/3[\s-]*phase|\b3ph?\b|3pn?\b/i.test(d)) return 'three'
  if (/1[\s-]*phase|\b1ph?\b|1pn?\b|single[\s-]*phase/i.test(d)) return 'single'
  return 'any'
}
function enrich(row, category) {
  const d = clean(row.description)
  const out = { watts_ac: null, watts_dc: null, kwh: null, isc_amps: null, voc_volts: null, phase: 'any', specs: {} }
  if (category === 'inverter') {
    const kw = num(d.match(/([\d.]+)\s*kw/i))
    if (kw) out.watts_ac = Math.round(kw * 1000)
    out.phase = phaseOf(d)
  } else if (category === 'panel') {
    const w = num(d.replace(/[\d.]+\s*kwh?/gi, ' ').match(/([\d.]+)\s*w\b/i))
    if (w) out.watts_dc = w
  } else if (category === 'battery') {
    out.kwh = num(d.match(/([\d.]+)\s*kwh/i)) ?? num(d.match(/([\d.]+)\s*kw\b/i))
  } else if (['breaker', 'isolator', 'spd', 'fuseholder'].includes(category)) {
    const s = {}
    const poles = num(d.match(/\b(\d)\s*p\b/i)); if (poles) { s.poles = poles; s.pole_config = `${poles}P` }
    const amp = num(d.match(/\b([\d.]+)\s*a\b/i)); if (amp) s.amperage_a = amp
    const volt = num(d.match(/\b([\d.]+)\s*v(?:\s*dc|\s*ac)?\b/i)); if (volt) s.voltage_v = volt
    const ka = num(d.match(/\b([\d.]+)\s*ka\b/i)); if (ka) s.breaking_capacity_ka = ka
    if (/\bdc\b/i.test(d)) s.current_type = 'DC'
    else if (/\bac\b/i.test(d)) s.current_type = 'AC'
    out.specs = s
  }
  return out
}

async function fetchExisting() {
  const skus = new Set(); const solarBrands = new Set()
  let from = 0; const size = 1000
  while (true) {
    const { data, error } = await supabase
      .from('equipment_catalog').select('sku,brand,category').range(from, from + size - 1)
    if (error) { console.error('fetch error', error.message); process.exit(2) }
    for (const e of data) {
      skus.add(normSku(e.sku))
      if (['inverter', 'battery', 'panel'].includes(e.category)) solarBrands.add(normBrand(e.brand))
    }
    if (data.length < size) break
    from += size
  }
  return { skus, solarBrands }
}

const { skus, solarBrands } = await fetchExisting()
const byCat = {}, importRows = [], reviewRows = []
for (const r0 of raw) {
  const description = clean(r0.description)
  const category = categorise(description)
  const e = enrich(r0, category)
  const row = { ...r0, description, category, ...e }
  byCat[category] = (byCat[category] || 0) + 1
  const isMatch = skus.has(normSku(r0.sku))
  const brandStocked = solarBrands.has(normBrand(r0.brand))
  const dupProne = ['inverter', 'battery', 'panel'].includes(category)
  if (isMatch) { row._disp = 'match'; importRows.push(row) }
  else if (dupProne && brandStocked) { row._disp = 'review'; reviewRows.push(row) }
  else { row._disp = 'new'; importRows.push(row) }
}

const dir = path.dirname(rawPath)
fs.writeFileSync(path.join(dir, 'solar-import.json'), JSON.stringify(importRows, null, 2))
fs.writeFileSync(path.join(dir, 'solar-review.json'), JSON.stringify(reviewRows, null, 2))

console.log('=== category breakdown (all 166) ===')
for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`)
const disp = (d) => raw.length && [...importRows, ...reviewRows].filter((r) => r._disp === d).length
console.log(`\n=== disposition ===`)
console.log(`  ${disp('match')} exact-SKU match  -> attach Key offer (safe)`)
console.log(`  ${disp('new')} dup-free new      -> create hidden (safe)  [solar-import.json]`)
console.log(`  ${disp('review')} overlapping brand -> HOLD for review     [solar-review.json]`)
console.log(`\n=== REVIEW bucket (brands you already stock) ===`)
for (const r of reviewRows) {
  const spec = r.watts_ac ? `${(r.watts_ac / 1000)}kW ${r.phase}` : r.kwh ? `${r.kwh}kWh` : r.watts_dc ? `${r.watts_dc}Wp` : ''
  console.log(`  [${r.category}] ${r.brand} ${r.sku} — ${r.description}  {${spec}}`)
}
