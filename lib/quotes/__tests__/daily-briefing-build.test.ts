import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildDailyBriefing, planFollowup } from '../daily-briefing'

/**
 * The briefing is the one place that decides what "needs you today". Work the
 * business has taken off its plate — archived/deleted quotes, cancelled jobs,
 * POs on cancelled jobs, anything belonging to an archived customer — must never
 * reach it. These tests lock that, because a stale task is how a real one gets
 * missed.
 */

type Filter = [string, string, unknown]
interface Recorded { table: string; filters: Filter[] }

/**
 * Minimal PostgREST-shaped stub: every chained filter is recorded, awaiting the
 * builder yields the next queued fixture for that table (queries run in the
 * order buildDailyBriefing builds them).
 */
function stubClient(fixtures: Record<string, unknown[][]>) {
  const recorded: Recorded[] = []
  const queues: Record<string, unknown[][]> = {}
  for (const [table, results] of Object.entries(fixtures)) queues[table] = [...results]

  const client = {
    from(table: string) {
      const entry: Recorded = { table, filters: [] }
      recorded.push(entry)
      const rows = queues[table]?.shift() ?? []
      const builder: Record<string, unknown> = {
        then(resolve: (v: { data: unknown[] }) => unknown) {
          return Promise.resolve({ data: rows }).then(resolve)
        },
      }
      for (const method of ['select', 'eq', 'neq', 'not', 'is', 'lt', 'in', 'order', 'limit']) {
        builder[method] = (...args: unknown[]) => {
          entry.filters.push([method, String(args[0] ?? ''), args[1]])
          return builder
        }
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, recorded }
}

/** Did the query on `table` (nth occurrence) apply `method` to `column`? */
function applied(recorded: Recorded[], table: string, nth: number, method: string, column: string): boolean {
  const entry = recorded.filter((r) => r.table === table)[nth]
  return !!entry?.filters.some((f) => f[0] === method && f[1] === column)
}

const ARCHIVED_CUSTOMER = 'cust-archived'
const LIVE_CUSTOMER = 'cust-live'
const NOW = new Date('2026-08-10T08:00:00Z').getTime()
const LONG_AGO = new Date('2026-07-01T08:00:00Z').toISOString()

function fixtures() {
  return {
    quote_requests: [
      // sent (follow-up chase)
      [
        { id: 'q-sent-live', customer_id: LIVE_CUSTOMER, customer_name: 'Live Co', quote_number: 'Q1', expiry_date: null, sent_at: LONG_AGO, reminder_count: 2 },
        { id: 'q-sent-archived', customer_id: ARCHIVED_CUSTOMER, customer_name: 'Gone Co', quote_number: 'Q2', expiry_date: null, sent_at: LONG_AGO, reminder_count: 2 },
      ],
      // generated (drafts to send)
      [
        { id: 'q-draft-live', customer_id: LIVE_CUSTOMER, customer_name: 'Live Co', quote_number: 'Q3', total_amount: 100_000, created_at: LONG_AGO },
        { id: 'q-draft-archived', customer_id: ARCHIVED_CUSTOMER, customer_name: 'Gone Co', quote_number: 'Q4', total_amount: 100_000, created_at: LONG_AGO },
        { id: 'q-draft-nocust', customer_id: null, customer_name: 'Walk-in', quote_number: 'Q5', total_amount: 100_000, created_at: LONG_AGO },
      ],
      // sent + viewed (awaiting reply)
      [
        { id: 'q-view-live', customer_id: LIVE_CUSTOMER, customer_name: 'Live Co', quote_number: 'Q6', viewed_at: LONG_AGO, sent_at: LONG_AGO },
        { id: 'q-view-archived', customer_id: ARCHIVED_CUSTOMER, customer_name: 'Gone Co', quote_number: 'Q7', viewed_at: LONG_AGO, sent_at: LONG_AGO },
      ],
    ],
    jobs: [[
      { id: 'j-live', title: 'Live install', deposit_proof_uploaded_at: LONG_AGO, site: { customer_id: LIVE_CUSTOMER } },
      { id: 'j-archived', title: 'Archived customer install', deposit_proof_uploaded_at: LONG_AGO, site: { customer_id: ARCHIVED_CUSTOMER } },
      { id: 'j-nosite', title: 'No site yet', deposit_proof_uploaded_at: LONG_AGO, site: null },
    ]],
    leads: [
      [
        { id: 'l-new-live', name: 'New Live', phone: '0821112222', suburb: 'Fourways', created_at: LONG_AGO, customer_id: null },
        { id: 'l-new-archived', name: 'New Gone', phone: '0823334444', suburb: 'Sandton', created_at: LONG_AGO, customer_id: ARCHIVED_CUSTOMER },
      ],
      [
        { id: 'l-fu-live', name: 'Called Live', phone: '0825556666', suburb: 'Midrand', created_at: LONG_AGO, contacted_at: LONG_AGO, customer_id: LIVE_CUSTOMER },
        { id: 'l-fu-archived', name: 'Called Gone', phone: '0827778888', suburb: 'Randburg', created_at: LONG_AGO, contacted_at: LONG_AGO, customer_id: ARCHIVED_CUSTOMER },
      ],
    ],
    purchase_orders: [[
      { id: 'po-live', po_number: 'PO-1', expected_date: '2026-08-01', supplier: { name: 'ACDC' }, job: { status: 'in_progress' } },
      { id: 'po-cancelled-job', po_number: 'PO-2', expected_date: '2026-08-01', supplier: { name: 'ACDC' }, job: { status: 'cancelled' } },
      { id: 'po-nojob', po_number: 'PO-3', expected_date: '2026-08-01', supplier: { name: 'ACDC' }, job: null },
    ]],
    customers: [[{ id: ARCHIVED_CUSTOMER }]],
  }
}

test('briefing asks the database to exclude archived/deleted quotes and cancelled jobs', async () => {
  const { client, recorded } = stubClient(fixtures())
  await buildDailyBriefing(client, NOW)

  for (const nth of [0, 1, 2]) {
    assert.ok(applied(recorded, 'quote_requests', nth, 'is', 'archived_at'), `quote query ${nth} must filter archived_at`)
    assert.ok(applied(recorded, 'quote_requests', nth, 'is', 'deleted_at'), `quote query ${nth} must filter deleted_at`)
  }
  assert.ok(applied(recorded, 'jobs', 0, 'neq', 'status'), 'deposit query must exclude cancelled jobs')
  assert.ok(applied(recorded, 'customers', 0, 'not', 'archived_at'), 'must load the archived-customer list')
})

test('an archived customer takes their quotes, deposits and leads off the to-do list', async () => {
  const { client } = stubClient(fixtures())
  const b = await buildDailyBriefing(client, NOW)

  const ids = (items: Array<{ id: string }>) => items.map((i) => i.id)
  assert.deepEqual(ids([...b.customerSends, ...b.personalFollowups]), ['q-sent-live'])
  // Quotes with no CRM link at all stay — nothing has been removed for them.
  assert.deepEqual(ids(b.drafts), ['q-draft-live', 'q-draft-nocust'])
  assert.deepEqual(ids(b.awaitingResponse), ['q-view-live'])
  assert.deepEqual(ids(b.depositsToConfirm), ['j-live', 'j-nosite'])
  assert.deepEqual(ids(b.newLeads), ['l-new-live'])
  assert.deepEqual(ids(b.followupLeads), ['l-fu-live'])
})

test('a purchase order on a cancelled job stops being overdue', async () => {
  const { client } = stubClient(fixtures())
  const b = await buildDailyBriefing(client, NOW)
  assert.deepEqual(b.overduePOs.map((p) => p.id), ['po-live', 'po-nojob'])
})

test('totals count only what survived the filters', async () => {
  const { client } = stubClient(fixtures())
  const b = await buildDailyBriefing(client, NOW)
  const counted =
    b.personalFollowups.length + b.drafts.length + b.awaitingResponse.length +
    b.depositsToConfirm.length + b.newLeads.length + b.followupLeads.length + b.overduePOs.length
  assert.equal(b.totalAttention, counted)
  assert.equal(b.totalAuto, b.customerSends.length)
})

test('planFollowup still escalates on the 3/7/10-day ladder', () => {
  const day = 86_400_000
  assert.equal(planFollowup({ sent_at: new Date(NOW - 3 * day).toISOString(), expiry_date: null, reminder_count: 0 }, NOW), 'customer_nudge_1')
  assert.equal(planFollowup({ sent_at: new Date(NOW - 7 * day).toISOString(), expiry_date: null, reminder_count: 1 }, NOW), 'customer_nudge_2')
  assert.equal(planFollowup({ sent_at: new Date(NOW - 10 * day).toISOString(), expiry_date: null, reminder_count: 2 }, NOW), 'admin_no_response')
  assert.equal(planFollowup({ sent_at: new Date(NOW - 1 * day).toISOString(), expiry_date: null, reminder_count: 0 }, NOW), null)
})
