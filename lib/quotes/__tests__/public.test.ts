import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canRequestUpdatedQuote, publicQuoteState } from '../public'

/**
 * The share link's behaviour, in one place. The page and the accept/decline/
 * proof routes all read this, so a quote we've closed can't be accepted through
 * any of them.
 */

const FUTURE = '2099-01-01'
const PAST = '2020-01-01'

test('a live quote is open; an out-of-date one is expired', () => {
  assert.equal(publicQuoteState({ status: 'sent', expiry_date: FUTURE }), 'open')
  assert.equal(publicQuoteState({ status: 'generated', expiry_date: null }), 'open')
  assert.equal(publicQuoteState({ status: 'sent', expiry_date: PAST }), 'expired')
})

test('archiving or deleting closes the link', () => {
  assert.equal(publicQuoteState({ status: 'sent', expiry_date: FUTURE, archived_at: '2026-08-10' }), 'closed')
  assert.equal(publicQuoteState({ status: 'sent', expiry_date: FUTURE, deleted_at: '2026-08-10' }), 'closed')
  assert.equal(publicQuoteState({ status: 'generated', archived_at: '2026-08-10' }), 'closed')
  // Declining then archiving is still closed, not merely declined.
  assert.equal(publicQuoteState({ status: 'declined', archived_at: '2026-08-10' }), 'closed')
})

test('an accepted quote keeps serving its deposit page even once archived', () => {
  assert.equal(publicQuoteState({ status: 'accepted', archived_at: '2026-08-10' }), 'accepted')
  assert.equal(publicQuoteState({ status: 'accepted', expiry_date: PAST }), 'accepted')
})

test('statuses that were never public are closed', () => {
  assert.equal(publicQuoteState({ status: 'pending' }), 'closed')
  assert.equal(publicQuoteState({ status: 'declined' }), 'declined')
})

test('the re-quote route is offered on every dead end and nowhere else', () => {
  assert.equal(canRequestUpdatedQuote('closed'), true)
  assert.equal(canRequestUpdatedQuote('expired'), true)
  assert.equal(canRequestUpdatedQuote('declined'), true)
  assert.equal(canRequestUpdatedQuote('open'), false)
  assert.equal(canRequestUpdatedQuote('accepted'), false)
})
