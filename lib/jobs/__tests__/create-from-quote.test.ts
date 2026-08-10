// Run with: npx tsx --test lib/jobs/__tests__/create-from-quote.test.ts
//
// createJobFromQuote is the hand-off from "customer said yes" to "we build it":
// it creates the job, the install checklist, and copies the frozen BOM into
// job_materials — the list procurement actually buys from. Getting it wrong costs
// real money (wrong tier ordered, rands stored where cents belong, a duplicate
// job/site on every acceptance, or a half-created job left behind after an error).
//
// extractBom() — the tier-picking logic these tests really exercise — is NOT
// exported, so it is driven through createJobFromQuote and asserted on the rows
// that reach job_materials. That is also the honest contract: what gets bought.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createJobFromQuote } from '../create-from-quote'

// ── A minimal Supabase test double ────────────────────────────────────────────
// PostgREST builders are chainable and thenable; every chain here ends in an
// await. The double records one call per .from() and answers at await time, so
// assertions can inspect exactly which tables were written and with what.

interface RecordedCall {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  filters: Array<{ fn: string; args: unknown[] }>
}

type Result = { data?: unknown; error?: { message: string } | null }

function fakeSupabase(respond: (call: RecordedCall) => Result) {
  const calls: RecordedCall[] = []
  const from = (table: string) => {
    const call: RecordedCall = { table, op: 'select', filters: [] }
    calls.push(call)
    const filter = (fn: string) => (...args: unknown[]) => { call.filters.push({ fn, args }); return b }
    const b: Record<string, unknown> = {
      select: () => b, order: () => b, limit: () => b, single: () => b, maybeSingle: () => b,
      eq: filter('eq'), ilike: filter('ilike'), is: filter('is'), not: filter('not'), in: filter('in'),
      insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return b },
      update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return b },
      delete: () => { call.op = 'delete'; return b },
      then: (ok: (v: Result) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve(respond(call)).then(ok, fail),
    }
    return b
  }
  return { supabase: { from } as unknown as SupabaseClient, calls }
}

/** Default happy-path responses; override any `table:op` key. */
function responder(overrides: Record<string, Result> = {}) {
  return (call: RecordedCall): Result => {
    const key = `${call.table}:${call.op}`
    if (key in overrides) return overrides[key]
    switch (key) {
      case 'jobs:select': return { data: null, error: null }        // no existing job
      case 'sites:select': return { data: [], error: null }         // no matching site
      case 'sites:insert': return { data: { id: 'site-new' }, error: null }
      case 'jobs:insert': return { data: { id: 'job-1' }, error: null }
      default: return { data: null, error: null }
    }
  }
}

const BOM_LINE = {
  section: 'Panels', sku: 'P-500', description: '500W panel',
  quantity: 10, unitCostRands: 1234.56, unitSellRands: 1666.66,
}

function quoteWith(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'q1', customer_id: 'cust-1', customer_name: 'Acme Pty Ltd', address: '1 Main Rd',
    quote_number: 'Q-001', total_amount: 12_345_600, deposit_amount: 5_000_000,
    accepted_tier: null, bom_snapshot: null,
    generated_quote: JSON.stringify({ supplierBom: [BOM_LINE] }),
    ...over,
  }
}

const materialsOf = (calls: RecordedCall[]) =>
  (calls.find((c) => c.table === 'job_materials' && c.op === 'insert')?.payload ?? []) as Array<Record<string, unknown>>

// ── BOM extraction, seen through job_materials ────────────────────────────────

test('a single-option quote copies its BOM into job_materials in rands→cents', () => {
  const { supabase, calls } = fakeSupabase(responder())
  const quote = quoteWith({
    generated_quote: JSON.stringify({
      supplierBom: [BOM_LINE, { description: 'Line with nothing else filled in' }],
    }),
  })

  return createJobFromQuote(supabase, quote, 'user-1').then((res) => {
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.created, true)
    assert.equal(res.materialsSeeded, 2)
    assert.deepEqual(res.warnings, [], 'a fully linked quote should warn about nothing')

    const rows = materialsOf(calls)
    assert.equal(rows.length, 2)
    // Money must land as integer cents — storing rands here silently 100x's every
    // material cost report downstream.
    assert.equal(rows[0].unit_cost_cents, 123_456)
    assert.equal(rows[0].unit_sell_cents, 166_666)
    assert.equal(rows[0].qty_planned, 10)
    assert.equal(rows[0].section, 'Panels')
    assert.equal(rows[0].sku, 'P-500')
    assert.equal(rows[0].job_id, 'job-1')
    // A sparse line must default rather than write null into NOT NULL columns.
    assert.equal(rows[1].section, '')
    assert.equal(rows[1].sku, '')
    assert.equal(rows[1].qty_planned, 0)
    assert.equal(rows[1].unit_cost_cents, 0)
    assert.equal(rows[1].unit_sell_cents, 0)
    // Ordering is what the picking list is printed in.
    assert.deepEqual(rows.map((r) => r.sort_order), [0, 1])
  })
})

test('a multi-option quote buys the tier the customer accepted', () => {
  const { supabase, calls } = fakeSupabase(responder())
  const quote = quoteWith({
    accepted_tier: 'premium',
    generated_quote: JSON.stringify({
      type: 'multi-option',
      options: [
        { tier: 'essential', supplierBom: [{ sku: 'CHEAP', quantity: 1 }] },
        { tier: 'recommended', supplierBom: [{ sku: 'MID', quantity: 1 }] },
        { tier: 'premium', supplierBom: [{ sku: 'TOP', quantity: 1 }, { sku: 'TOP-2', quantity: 2 }] },
      ],
    }),
  })

  return createJobFromQuote(supabase, quote, 'user-1').then((res) => {
    assert.equal(res.ok && res.materialsSeeded, 2)
    assert.deepEqual(materialsOf(calls).map((r) => r.sku), ['TOP', 'TOP-2'],
      'ordering the wrong tier is the expensive failure this guards')
  })
})

test('a multi-option quote falls back to the recommended tier, then to the first option', async () => {
  const options = [
    { tier: 'essential', supplierBom: [{ sku: 'CHEAP' }] },
    { tier: 'recommended', supplierBom: [{ sku: 'MID' }] },
  ]

  // No accepted_tier recorded yet (accepted by phone, say) → recommended.
  const a = fakeSupabase(responder())
  await createJobFromQuote(a.supabase, quoteWith({
    accepted_tier: null,
    generated_quote: JSON.stringify({ type: 'multi-option', options }),
  }), 'user-1')
  assert.deepEqual(materialsOf(a.calls).map((r) => r.sku), ['MID'])

  // A tier name that no longer exists must not silently seed nothing.
  const b = fakeSupabase(responder())
  await createJobFromQuote(b.supabase, quoteWith({
    accepted_tier: 'platinum-deluxe',
    generated_quote: JSON.stringify({ type: 'multi-option', options }),
  }), 'user-1')
  assert.deepEqual(materialsOf(b.calls).map((r) => r.sku), ['MID'], 'unknown tier → recommended')

  // No recommended tier at all → first option wins.
  const c = fakeSupabase(responder())
  await createJobFromQuote(c.supabase, quoteWith({
    accepted_tier: null,
    generated_quote: JSON.stringify({
      type: 'multi-option',
      options: [{ tier: 'essential', supplierBom: [{ sku: 'CHEAP' }] }, { tier: 'premium', supplierBom: [{ sku: 'TOP' }] }],
    }),
  }), 'user-1')
  assert.deepEqual(materialsOf(c.calls).map((r) => r.sku), ['CHEAP'])
})

test('an unreadable or BOM-less quote still creates the job, with a loud warning', async () => {
  for (const generated_quote of [
    'not json at all',
    '{"supplierBom": ',            // truncated
    JSON.stringify({ total: 123 }),                       // no supplierBom key
    JSON.stringify({ supplierBom: 'oops' }),              // wrong type
    JSON.stringify({ type: 'multi-option', options: [] }), // no options to pick from
    JSON.stringify({ type: 'multi-option', options: [{ tier: 'recommended' }] }), // option without a BOM
    'null',
  ]) {
    const { supabase, calls } = fakeSupabase(responder())
    const res = await createJobFromQuote(supabase, quoteWith({ generated_quote }), 'user-1')

    assert.equal(res.ok, true, `should not throw on ${JSON.stringify(generated_quote).slice(0, 40)}`)
    if (!res.ok) continue
    assert.equal(res.created, true, 'the job is still created — the operator fixes materials after')
    assert.equal(res.materialsSeeded, 0)
    assert.ok(
      res.warnings.some((w) => w.includes('No supplier BOM found')),
      `a missing BOM must be surfaced, not silent (${JSON.stringify(generated_quote).slice(0, 40)})`,
    )
    // And no empty insert is attempted.
    assert.equal(calls.some((c) => c.table === 'job_materials'), false)
  }
})

test('a locked bom_snapshot beats the live generated_quote', () => {
  // Design lock: procurement buys what was frozen at acceptance, even if the quote
  // has been recalculated since.
  const { supabase, calls } = fakeSupabase(responder())
  const quote = quoteWith({
    bom_snapshot: { supplierBom: [{ sku: 'LOCKED', quantity: 3, unitCostRands: 10 }] },
    generated_quote: JSON.stringify({ supplierBom: [{ sku: 'RECALCULATED', quantity: 99 }] }),
  })

  return createJobFromQuote(supabase, quote, 'user-1').then((res) => {
    assert.equal(res.ok && res.materialsSeeded, 1)
    const rows = materialsOf(calls)
    assert.equal(rows[0].sku, 'LOCKED')
    assert.equal(rows[0].qty_planned, 3)
    assert.equal(rows[0].unit_cost_cents, 1000)
  })
})

// ── Job creation, idempotency, rollback ───────────────────────────────────────

test('every accepted quote gets the full install checklist, once', () => {
  const { supabase, calls } = fakeSupabase(responder())
  return createJobFromQuote(supabase, quoteWith(), 'user-1').then(() => {
    const tasks = (calls.find((c) => c.table === 'job_tasks')?.payload ?? []) as Array<Record<string, unknown>>
    assert.ok(tasks.length >= 10, 'the pipeline checklist should not shrink to a stub')
    assert.ok(tasks.every((t) => t.job_id === 'job-1'))
    assert.ok(tasks.every((t) => typeof t.description === 'string' && (t.description as string).length > 0))
    assert.equal(new Set(tasks.map((t) => t.description)).size, tasks.length, 'no duplicate checklist steps')
    assert.equal(calls.filter((c) => c.table === 'job_tasks').length, 1)
  })
})

test('a quote with no saved calculation is refused before anything is written', () => {
  const { supabase, calls } = fakeSupabase(responder())
  return createJobFromQuote(supabase, quoteWith({ generated_quote: null }), 'user-1').then((res) => {
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 400)
    assert.match(res.error, /calculate and save/i)
    assert.deepEqual(calls, [], 'nothing may be written for a quote that cannot be costed')
  })
})

test('re-accepting a quote reuses the existing job instead of creating a second one', () => {
  const { supabase, calls } = fakeSupabase(responder({
    'jobs:select': { data: { id: 'job-existing', site_id: 'site-7' }, error: null },
  }))
  return createJobFromQuote(supabase, quoteWith(), 'user-1').then((res) => {
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.jobId, 'job-existing')
    assert.equal(res.created, false)
    assert.equal(res.materialsSeeded, 0, 'materials must not be double-seeded on a re-run')
    assert.deepEqual(res.warnings, [])
    assert.equal(calls.some((c) => c.op === 'insert'), false, 'idempotent: no inserts at all')
  })
})

test('an existing job with no site is back-filled, and only while it is still unlinked', () => {
  const { supabase, calls } = fakeSupabase(responder({
    'jobs:select': { data: { id: 'job-existing', site_id: null }, error: null },
    'sites:select': { data: [{ id: 'site-found' }], error: null },
  }))
  return createJobFromQuote(supabase, quoteWith(), 'user-1').then((res) => {
    assert.equal(res.ok && res.warnings.length, 0)
    const update = calls.find((c) => c.table === 'jobs' && c.op === 'update')
    assert.ok(update, 'the unlinked job should be linked to the site')
    assert.deepEqual(update.payload, { site_id: 'site-found' })
    // The `.is('site_id', null)` guard is what stops this stomping a site another
    // request just linked.
    assert.ok(update.filters.some((f) => f.fn === 'is' && f.args[0] === 'site_id' && f.args[1] === null))
    assert.equal(calls.some((c) => c.table === 'sites' && c.op === 'insert'), false,
      'an existing site must be reused, never duplicated')
  })
})

test('a failed site lookup never falls through to creating a duplicate site', () => {
  const { supabase, calls } = fakeSupabase(responder({
    'sites:select': { data: null, error: { message: 'connection reset' } },
  }))
  return createJobFromQuote(supabase, quoteWith(), 'user-1').then((res) => {
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(calls.some((c) => c.table === 'sites' && c.op === 'insert'), false,
      'inserting after a read error is how duplicate sites appear on every acceptance')
    assert.ok(res.warnings.some((w) => w.includes('No customer linked')),
      'the operator must be told the job is not visible to the customer')
  })
})

test('a quote with no customer skips site resolution entirely and warns', () => {
  const { supabase, calls } = fakeSupabase(responder())
  return createJobFromQuote(supabase, quoteWith({ customer_id: null }), 'user-1').then((res) => {
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(calls.some((c) => c.table === 'sites'), false)
    assert.ok(res.warnings.some((w) => w.includes('No customer linked')))
    const job = calls.find((c) => c.table === 'jobs' && c.op === 'insert')
    assert.equal((job!.payload as Record<string, unknown>).site_id, null)
  })
})

test('LIKE metacharacters in an address are escaped so they match literally', () => {
  const { supabase, calls } = fakeSupabase(responder())
  return createJobFromQuote(supabase, quoteWith({ address: '100% Main_Rd \\ Unit 2' }), 'user-1').then(() => {
    const lookup = calls.find((c) => c.table === 'sites' && c.op === 'select')
    const ilike = lookup!.filters.find((f) => f.fn === 'ilike')
    assert.equal(ilike!.args[1], '100\\% Main\\_Rd \\\\ Unit 2',
      'an unescaped % or _ turns the address match into a wildcard and links the wrong site')
  })
})

test('a half-created job is rolled back rather than left behind', async () => {
  for (const [failing, expected] of [
    ['job_tasks:insert', /Checklist not created/],
    ['job_materials:insert', /Materials not seeded/],
  ] as const) {
    const { supabase, calls } = fakeSupabase(responder({
      [failing]: { data: null, error: { message: 'insert exploded' } },
    }))
    const res = await createJobFromQuote(supabase, quoteWith(), 'user-1')

    assert.equal(res.ok, false, `${failing} should fail the whole operation`)
    if (res.ok) continue
    assert.equal(res.status, 500)
    assert.match(res.error, expected)
    const del = calls.find((c) => c.table === 'jobs' && c.op === 'delete')
    assert.ok(del, `a job with a broken ${failing} must be deleted, not left as a ghost`)
    assert.ok(del.filters.some((f) => f.fn === 'eq' && f.args[0] === 'id' && f.args[1] === 'job-1'))
  }
})

test('the job record carries the money as a readable summary and starts at deposit_pending', () => {
  const { supabase, calls } = fakeSupabase(responder())
  return createJobFromQuote(supabase, quoteWith(), 'user-7').then(() => {
    const job = calls.find((c) => c.table === 'jobs' && c.op === 'insert')!.payload as Record<string, unknown>
    assert.equal(job.stage, 'deposit_pending')
    assert.equal(job.quote_request_id, 'q1')
    assert.equal(job.assigned_to, 'user-7')
    assert.equal(job.created_by, 'user-7', 'both NOT NULL actor columns must be set')
    assert.equal(job.site_id, 'site-new')
    assert.match(String(job.title), /Q-001/)
    // total_amount / deposit_amount are cents in the DB and must be shown as rands.
    // (en-ZA groups with a non-breaking space, so normalise before matching.)
    const description = String(job.description).replace(/ /g, ' ')
    assert.match(description, /Total R 123 456/)
    assert.match(description, /Deposit R 50 000/)
  })
})
