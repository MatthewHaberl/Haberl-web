// Run with: npx tsx --test lib/customers/__tests__/phone.test.ts
//
// normalizePhone() MUST stay in lock-step with the SQL function
// public.normalize_phone() (migration 053), because customers.phone_normalized /
// leads.phone_normalized are STORED generated columns computed by the SQL side,
// and this TS side is what we match against them. If the two ever diverge,
// de-duplication silently stops working — the same person is created twice and
// the public lead form's per-phone throttle stops throttling.
//
// The cases below are the exact branches of the SQL CASE expression, in order.
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone } from '../phone'

test('normalizePhone folds every SA phone format to the local 0XXXXXXXXX key', () => {
  // All of these are the same person and MUST produce the same key.
  const same = [
    '+27 79 033 6247',
    '+27790336247',
    '0027 79 033 6247',
    '0027790336247',
    '079 033 6247',
    '0790336247',
    '(079) 033-6247',
    '79 033 6247',   // 9 digits, leading zero dropped
    '790336247',
  ]
  for (const input of same) {
    assert.equal(normalizePhone(input), '0790336247', `"${input}" should fold to 0790336247`)
  }
})

test('normalizePhone returns null when there is nothing to key on', () => {
  assert.equal(normalizePhone(''), null)
  assert.equal(normalizePhone('   '), null)
  assert.equal(normalizePhone('abc'), null)
  assert.equal(normalizePhone(null), null)
  assert.equal(normalizePhone(undefined), null)
})

test('normalizePhone leaves non-SA / unexpected lengths as bare digits', () => {
  // Final `else` branch of the SQL CASE: strip punctuation, keep the digits.
  assert.equal(normalizePhone('+44 20 7946 0958'), '442079460958')
  assert.equal(normalizePhone('12345'), '12345')
})

test('normalizePhone distinguishes genuinely different numbers', () => {
  assert.notEqual(normalizePhone('0790336247'), normalizePhone('0790336248'))
  assert.notEqual(normalizePhone('+27790336247'), normalizePhone('+27790336248'))
})

// A compact re-implementation of the SQL CASE from migration 053. If someone
// edits either implementation without the other, this diverges and fails.
function sqlNormalizePhone(p: string | null | undefined): string | null {
  const digits = String(p ?? '').replace(/\D/g, '')
  if (digits === '') return null
  if (/^27[0-9]{9}$/.test(digits)) return '0' + digits.slice(2)
  if (/^0027[0-9]{9}$/.test(digits)) return '0' + digits.slice(4)
  if (/^[0-9]{9}$/.test(digits)) return '0' + digits
  return digits
}

test('normalizePhone matches the SQL normalize_phone() branch for branch', () => {
  const cases = [
    '+27 79 033 6247', '0027790336247', '079 033 6247', '790336247', '0790336247',
    '', '   ', 'abc', '+44 20 7946 0958', '12345', '27790336247', '00279', '0000000000',
  ]
  for (const input of cases) {
    assert.equal(
      normalizePhone(input),
      sqlNormalizePhone(input),
      `TS and SQL disagree on "${input}" — de-duplication would break`,
    )
  }
})
