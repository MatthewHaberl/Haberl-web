// Run with: npx tsx --test lib/quotes/__tests__/daily-briefing.test.ts
//
// planFollowup + nextReminderCount ARE the quote follow-up automation. The cron
// (/api/cron/quote-followups) does nothing but loop rows, call planFollowup, send
// when isCustomerAction(), and stamp nextReminderCount(). So every rule about
// "when does a customer get chased" lives in these three pure functions, and a
// regression here either spams customers or silently stops chasing them — both
// invisible until revenue is already lost.
//
// The tests below drive the state machine day by day, the same way the daily cron
// does, rather than poking single calls, because the interesting failures are
// sequence failures (skipped step, repeated nudge, never terminates).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  planFollowup,
  isCustomerAction,
  nextReminderCount,
  parseBriefingRecipients,
  type FollowupAction,
  type PlannableQuote,
} from '../daily-briefing'

const DAY = 86_400_000
const NOW = Date.parse('2026-06-15T08:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString()

function quote(over: Partial<PlannableQuote> = {}): PlannableQuote {
  return { sent_at: daysAgo(0), expiry_date: null, reminder_count: 0, ...over }
}

/**
 * Replay the daily cron over `days` runs, applying the counter exactly as the
 * route does. Returns every action it would have taken, with the day it fired.
 */
function replayCron(start: PlannableQuote, days: number, from = NOW) {
  const state: PlannableQuote = { ...start }
  const log: Array<{ day: number; action: FollowupAction; count: number }> = []
  for (let d = 0; d < days; d++) {
    const action = planFollowup(state, from + d * DAY)
    if (!action) continue
    log.push({ day: d, action, count: state.reminder_count })
    state.reminder_count = nextReminderCount(action)
  }
  return { log, state }
}

// ── Thresholds ────────────────────────────────────────────────────────────────

test('planFollowup waits the full 3 days before the first customer nudge', () => {
  assert.equal(planFollowup(quote({ sent_at: daysAgo(0) }), NOW), null)
  assert.equal(planFollowup(quote({ sent_at: daysAgo(2) }), NOW), null)
  // 2 days 23h59m is still not 3 days — the threshold is not "the 3rd calendar day".
  assert.equal(planFollowup(quote({ sent_at: new Date(NOW - 3 * DAY + 60_000).toISOString() }), NOW), null)
  assert.equal(planFollowup(quote({ sent_at: daysAgo(3) }), NOW), 'customer_nudge_1')
  assert.equal(planFollowup(quote({ sent_at: daysAgo(6) }), NOW), 'customer_nudge_1')
})

test('planFollowup gates each step on reminder_count, not only on elapsed days', () => {
  // Day 7 but nothing has been sent yet → still the FIRST nudge. The machine must
  // never skip a step just because the calendar moved on.
  assert.equal(planFollowup(quote({ sent_at: daysAgo(7), reminder_count: 0 }), NOW), 'customer_nudge_1')
  assert.equal(planFollowup(quote({ sent_at: daysAgo(7), reminder_count: 1 }), NOW), 'customer_nudge_2')
  // Nudge 1 already sent, but day 7 has not arrived → nothing today.
  assert.equal(planFollowup(quote({ sent_at: daysAgo(5), reminder_count: 1 }), NOW), null)
  // Both nudges sent, day 10 not reached → nothing today.
  assert.equal(planFollowup(quote({ sent_at: daysAgo(9), reminder_count: 2 }), NOW), null)
  assert.equal(planFollowup(quote({ sent_at: daysAgo(10), reminder_count: 2 }), NOW), 'admin_no_response')
  // Day 30 with only one nudge sent is still nudge 2 — escalation requires count 2.
  assert.equal(planFollowup(quote({ sent_at: daysAgo(30), reminder_count: 1 }), NOW), 'customer_nudge_2')
})

test('planFollowup stops permanently once reminder_count reaches 3', () => {
  for (const count of [3, 4, 99]) {
    assert.equal(planFollowup(quote({ sent_at: daysAgo(60), reminder_count: count }), NOW), null)
    // Even an expired quote goes quiet — 3 is the terminal state, full stop.
    assert.equal(
      planFollowup(quote({ sent_at: daysAgo(60), reminder_count: count, expiry_date: '2020-01-01' }), NOW),
      null,
    )
  }
})

test('planFollowup does nothing for a quote that was never sent', () => {
  assert.equal(planFollowup(quote({ sent_at: null }), NOW), null)
  assert.equal(planFollowup(quote({ sent_at: null, reminder_count: 1 }), NOW), null)
  // Not even when it has expired — an unsent quote is not the customer's problem.
  assert.equal(planFollowup(quote({ sent_at: null, expiry_date: '2020-01-01' }), NOW), null)
})

// ── Expiry ────────────────────────────────────────────────────────────────────

test('expiry outranks every other rule and never emails the customer', () => {
  // Day 3 would normally be nudge 1; expiry takes it to the human instead.
  const expired = planFollowup(quote({ sent_at: daysAgo(3), expiry_date: '2020-01-01' }), NOW)
  assert.equal(expired, 'admin_expired')
  assert.equal(isCustomerAction(expired!), false, 'an expired quote must never trigger a customer email')
  // Same at day 0, before any nudge would have been due.
  assert.equal(planFollowup(quote({ sent_at: daysAgo(0), expiry_date: '2020-01-01' }), NOW), 'admin_expired')
  // A future expiry date changes nothing.
  assert.equal(planFollowup(quote({ sent_at: daysAgo(3), expiry_date: '2099-12-31' }), NOW), 'customer_nudge_1')
})

test('a quote is live for the whole of its expiry day and expires the instant after', () => {
  // expiry_date is a bare 'YYYY-MM-DD' expanded to local 23:59:59, so build the
  // boundary the same way rather than assuming a timezone.
  const expiry = '2026-06-15'
  const cutoff = new Date(`${expiry}T23:59:59`).getTime()
  const sent_at = new Date(cutoff - 4 * DAY).toISOString()

  assert.equal(planFollowup({ sent_at, expiry_date: expiry, reminder_count: 0 }, cutoff), 'customer_nudge_1',
    'still live at the last second of the expiry day')
  assert.equal(planFollowup({ sent_at, expiry_date: expiry, reminder_count: 0 }, cutoff + 1000), 'admin_expired',
    'expired one second later')
})

// ── Action classification ─────────────────────────────────────────────────────

test('only the two nudges email the customer; the escalations are for humans', () => {
  assert.equal(isCustomerAction('customer_nudge_1'), true)
  assert.equal(isCustomerAction('customer_nudge_2'), true)
  assert.equal(isCustomerAction('admin_no_response'), false)
  assert.equal(isCustomerAction('admin_expired'), false)
})

test('nextReminderCount always advances the machine towards its terminal state', () => {
  assert.equal(nextReminderCount('customer_nudge_1'), 1)
  assert.equal(nextReminderCount('customer_nudge_2'), 2)
  assert.equal(nextReminderCount('admin_no_response'), 3)
  assert.equal(nextReminderCount('admin_expired'), 3)

  // The invariant that makes the cron terminate: the count stamped after an action
  // is strictly greater than any count that could have produced it. Without this a
  // quote would be re-actioned forever, emailing the customer daily.
  const triggers: Record<FollowupAction, number[]> = {
    customer_nudge_1: [0],
    customer_nudge_2: [1],
    admin_no_response: [2],
    admin_expired: [0, 1, 2],
  }
  for (const [action, counts] of Object.entries(triggers) as Array<[FollowupAction, number[]]>) {
    for (const c of counts) {
      assert.ok(nextReminderCount(action) > c, `${action} from count ${c} did not advance the counter`)
    }
    assert.ok(nextReminderCount(action) <= 3, `${action} overshot the terminal count`)
  }
})

// ── Full sequences (what the cron actually does over time) ────────────────────

test('a healthy quote gets exactly two customer emails, on day 3 and day 7, then stops', () => {
  const { log, state } = replayCron(quote({ sent_at: daysAgo(0) }), 45)

  assert.deepEqual(
    log.map((l) => [l.day, l.action]),
    [[3, 'customer_nudge_1'], [7, 'customer_nudge_2'], [10, 'admin_no_response']],
  )
  assert.equal(log.filter((l) => isCustomerAction(l.action)).length, 2,
    'a customer must never receive more than the two scheduled nudges')
  assert.equal(state.reminder_count, 3, 'the machine ends in its terminal state')

  // Counter must be monotonically non-decreasing across the whole run.
  const counts = log.map((l) => l.count)
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b))
})

test('after a cron outage the follow-ups catch up in order — no step is skipped or doubled', () => {
  // Quote sent 20 days ago, nothing has run. The backlog is worked off one action
  // per day (this is CURRENT behaviour: the customer gets nudge 1 and nudge 2 on
  // consecutive days rather than both at once, or neither).
  const { log, state } = replayCron(quote({ sent_at: daysAgo(20) }), 10)

  assert.deepEqual(
    log.map((l) => [l.day, l.action]),
    [[0, 'customer_nudge_1'], [1, 'customer_nudge_2'], [2, 'admin_no_response']],
  )
  assert.equal(log.filter((l) => isCustomerAction(l.action)).length, 2, 'still only two customer emails')
  assert.equal(state.reminder_count, 3)
})

test('an expiring quote is escalated exactly once and then goes silent forever', () => {
  const { log, state } = replayCron(
    quote({ sent_at: daysAgo(1), expiry_date: '2026-06-16' }),
    60,
  )
  const expiries = log.filter((l) => l.action === 'admin_expired')
  assert.equal(expiries.length, 1, 'the operator must be flagged once, not every morning')
  assert.equal(state.reminder_count, 3)
  assert.ok(!log.some((l) => isCustomerAction(l.action)),
    'no customer email once the quote is past its expiry')
})

test('a quote accepted mid-flight (counter forced to 3) stops immediately', () => {
  // Simulates the customer accepting after nudge 1: whatever sets reminder_count
  // to 3 must be enough to stop the machine, with no further actions at all.
  const { log } = replayCron(quote({ sent_at: daysAgo(4), reminder_count: 3 }), 30)
  assert.deepEqual(log, [])
})

// ── Recipient parsing ─────────────────────────────────────────────────────────

test('parseBriefingRecipients splits on commas, semicolons, spaces and newlines', () => {
  const expected = ['a@haberl.co.za', 'b@haberl.co.za', 'c@haberl.co.za']
  for (const input of [
    'a@haberl.co.za,b@haberl.co.za,c@haberl.co.za',
    'a@haberl.co.za, b@haberl.co.za, c@haberl.co.za',
    'a@haberl.co.za;b@haberl.co.za;c@haberl.co.za',
    'a@haberl.co.za b@haberl.co.za c@haberl.co.za',
    'a@haberl.co.za\nb@haberl.co.za\nc@haberl.co.za',
    '  a@haberl.co.za ,; b@haberl.co.za \n c@haberl.co.za  ',
  ]) {
    assert.deepEqual(parseBriefingRecipients(input, 'fallback@haberl.co.za'), expected,
      `failed to parse: ${JSON.stringify(input)}`)
  }
})

test('parseBriefingRecipients de-duplicates so nobody gets the briefing twice', () => {
  assert.deepEqual(
    parseBriefingRecipients('matt@haberl.co.za, matt@haberl.co.za; matt@haberl.co.za', null),
    ['matt@haberl.co.za'],
  )
  // Order of first appearance is preserved.
  assert.deepEqual(
    parseBriefingRecipients('b@x.co.za a@x.co.za b@x.co.za', null),
    ['b@x.co.za', 'a@x.co.za'],
  )
  // De-duplication is exact-string, so case variants are NOT merged (current
  // behaviour — the same mailbox typed two ways gets two copies).
  assert.deepEqual(
    parseBriefingRecipients('Matt@x.co.za matt@x.co.za', null),
    ['Matt@x.co.za', 'matt@x.co.za'],
  )
})

test('parseBriefingRecipients falls back to the contact address when the list is unusable', () => {
  const contact = 'info@haberl.co.za'
  for (const input of [null, undefined, '', '   ', ',;,', 'not-an-address', 'nobody, nothing']) {
    assert.deepEqual(parseBriefingRecipients(input, contact), [contact],
      `expected fallback for ${JSON.stringify(input)}`)
  }
})

test('parseBriefingRecipients returns nothing rather than inventing a recipient', () => {
  // The cron treats an empty list as "build the briefing but send no email", so
  // returning [] here is what stops it emailing nowhere.
  assert.deepEqual(parseBriefingRecipients(null, null), [])
  assert.deepEqual(parseBriefingRecipients('', undefined), [])
  assert.deepEqual(parseBriefingRecipients('garbage', ''), [])
})

test('parseBriefingRecipients keeps only tokens containing @, verbatim', () => {
  // Tokens without an @ are dropped rather than passed to the mail API.
  assert.deepEqual(parseBriefingRecipients('Matt matt@x.co.za Admin', null), ['matt@x.co.za'])
  // CURRENT behaviour: a "Name <addr>" display form is split on the space and the
  // angle brackets survive, so the recipient becomes '<matt@x.co.za>'.
  assert.deepEqual(parseBriefingRecipients('Matt <matt@x.co.za>', null), ['<matt@x.co.za>'])
  // The contact_email fallback is NOT validated the same way — it is used as-is.
  assert.deepEqual(parseBriefingRecipients('', 'not-an-address'), ['not-an-address'])
})
