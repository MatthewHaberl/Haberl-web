// Load parsed Key Electric candidate rows into equipment_catalog — OFFER-AWARE (v2).
//
//   node --env-file=.env.local scripts/key-electric-load.mjs <jsonPath>            # dry run
//   node --env-file=.env.local scripts/key-electric-load.mjs <jsonPath> --commit   # write
//
// Match-or-create (no duplicate product rows):
//   * SKU match to an existing catalog product  -> attach a "Key Electric" supplier
//     offer to it (plus a baseline offer capturing the product's current price/supplier,
//     so the cheapest-offer logic can compare). The product row is NOT overwritten.
//   * No match -> create the product row (hidden) + its Key offer.
// Dry run also reports likely duplicates (same brand + high description overlap) that did
// NOT match on SKU, for manual review — these are NOT auto-merged.
//
// Cost follows the cheapest offer (migration 052 triggers); items load hidden.

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const jsonPath = process.argv[2]
const commit = process.argv.includes('--commit')
if (!jsonPath) { console.error('usage: node scripts/key-electric-load.mjs <jsonPath> [--commit]'); process.exit(1) }

const VAT = 1.15
const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const supabase = createClient(url, key, { auth: { persistSession: false } })

const normSku = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const tokenize = (s) => new Set((String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2))
function overlap(a, b) {
  const A = tokenize(a), B = tokenize(b)
  if (!A.size || !B.size) return 0
  let c = 0; for (const t of A) if (B.has(t)) c++
  return c / Math.min(A.size, B.size)
}

const toDbRow = (r) => ({
  category: r.category, brand: r.brand, supplier: r.supplier, sku: r.sku,
  description: r.description, cost_rands: r.cost_rands, phase: r.phase || 'any',
  // Electrical columns the quote pickers read (null for non-electrical lines like
  // mounting/cable). Only set when the prep step parsed a value, so this stays a
  // no-op for the protection import which never carried these.
  watts_ac: r.watts_ac ?? null, watts_dc: r.watts_dc ?? null, kwh: r.kwh ?? null,
  isc_amps: r.isc_amps ?? null, voc_volts: r.voc_volts ?? null,
  specs: r.specs || {}, primary_image_url: r.primary_image_url || null,
  datasheet_url: r.datasheet_url || null, source_url: r.source_url || null,
  external_ref: r.external_ref || null, active: false, show_on_store: false, sort_order: 0,
})

async function fetchAllExisting() {
  const all = []
  let from = 0
  const size = 1000
  while (true) {
    const { data, error } = await supabase
      .from('equipment_catalog')
      .select('id,sku,supplier,cost_rands,brand,description')
      .range(from, from + size - 1)
    if (error) { console.error('fetch existing error:', error.message); process.exit(2) }
    all.push(...data)
    if (data.length < size) break
    from += size
  }
  return all
}

async function ensureBaselineOffer(row) {
  // Capture the product's current price as an offer the first time it gains a competitor.
  const supplier = row.supplier && row.supplier !== 'Key Electric' ? row.supplier : 'Existing list'
  await supabase.from('equipment_supplier_offers').upsert({
    catalog_id: row.id, supplier, supplier_sku: row.sku,
    cost_rands: row.cost_rands, list_price_rands: Math.round((row.cost_rands / VAT) * 100) / 100,
  }, { onConflict: 'catalog_id,supplier', ignoreDuplicates: true })
}

async function upsertKeyOffer(catalogId, cand) {
  await supabase.from('equipment_supplier_offers').upsert({
    catalog_id: catalogId, supplier: 'Key Electric', supplier_sku: cand.sku,
    cost_rands: cand.cost_rands, list_price_rands: cand.price_ex_vat ?? Math.round((cand.cost_rands / VAT) * 100) / 100,
    source_url: cand.source_url || null,
  }, { onConflict: 'catalog_id,supplier' })
}

async function main() {
  const existing = await fetchAllExisting()
  console.log('connected — existing catalog rows:', existing.length)

  const bySku = new Map()
  for (const e of existing) bySku.set(normSku(e.sku), e)
  const byBrand = new Map()
  for (const e of existing) {
    const k = (e.brand || '').toLowerCase()
    if (!byBrand.has(k)) byBrand.set(k, [])
    byBrand.get(k).push(e)
  }

  const matched = [], created = [], fuzzy = []
  for (const r of rows) {
    const hit = bySku.get(normSku(r.sku))
    if (hit) { matched.push({ cand: r, existing: hit }); continue }
    // likely-duplicate signal (report only): same brand + strong description overlap
    let best = null
    for (const e of (byBrand.get((r.brand || '').toLowerCase()) || [])) {
      const ov = overlap(r.description, e.description)
      if (ov >= 0.6 && (!best || ov > best.ov)) best = { existing: e, ov }
    }
    if (best) fuzzy.push({ cand: r, existing: best.existing, ov: best.ov })
    created.push(r)
  }

  console.log(`candidates ${rows.length} | SKU-match (attach offer) ${matched.length} | new (create) ${created.length} | of new, likely-dup for review ${fuzzy.length}`)
  for (const m of matched.slice(0, 10)) console.log('  MATCH', m.cand.sku, '→ existing', m.existing.brand, m.existing.sku)
  for (const f of fuzzy.slice(0, 15)) console.log(`  ~DUP(${f.ov.toFixed(2)}) ${f.cand.sku} "${f.cand.description}"  ≈  ${f.existing.sku} "${f.existing.description}"`)

  if (!commit) { console.log('\nDRY RUN — no writes. Add --commit to apply.'); return }

  let attached = 0, newRows = 0
  // 1. Matched -> baseline + Key offer on the existing product.
  for (const { cand, existing } of matched) {
    await ensureBaselineOffer(existing)
    await upsertKeyOffer(existing.id, cand)
    if (++attached % 50 === 0) console.log('attached offers', attached, '/', matched.length)
  }
  // 2. New -> create hidden product + Key offer.
  for (const r of created) {
    const { data, error } = await supabase.from('equipment_catalog').insert(toDbRow(r)).select('id').single()
    if (error) { console.error('insert error', r.sku, error.message); continue }
    await upsertKeyOffer(data.id, r)
    if (++newRows % 50 === 0) console.log('created', newRows, '/', created.length)
  }
  console.log(`DONE — offers attached to existing: ${attached} | new products: ${newRows}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
