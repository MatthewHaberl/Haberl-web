// Run with: npx tsx --test lib/__tests__/utils.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseZarAmount, escapeHtml } from '../utils'

test('parseZarAmount handles en-ZA comma decimals without 100x inflation', () => {
  // The bug this guards: a naive [^0-9.] strip drops the comma decimal, so
  // "1 500,50" became 150050 instead of 1500.5.
  assert.equal(parseZarAmount('1 500,50'), 1500.5)
  assert.equal(parseZarAmount('R1 500,50'), 1500.5)
  assert.equal(parseZarAmount('R 12 345,67'), 12345.67)
  assert.equal(parseZarAmount('1.500,50'), 1500.5) // dot thousands, comma decimal
  assert.equal(parseZarAmount('1,500.50'), 1500.5) // comma thousands, dot decimal
  assert.equal(parseZarAmount('1500.50'), 1500.5) // plain dot decimal
  assert.equal(parseZarAmount('1500'), 1500)
  assert.equal(parseZarAmount(2500), 2500)
  assert.ok(Number.isNaN(parseZarAmount('')))
  assert.ok(Number.isNaN(parseZarAmount('   ')))
  assert.ok(Number.isNaN(parseZarAmount('abc')))
  assert.ok(Number.isNaN(parseZarAmount(null)))
  assert.ok(Number.isNaN(parseZarAmount(undefined)))
})

test('escapeHtml neutralises HTML metacharacters', () => {
  assert.equal(
    escapeHtml(`<script>alert('x')</script>`),
    '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;',
  )
  assert.equal(escapeHtml('A & B "C"'), 'A &amp; B &quot;C&quot;')
  assert.equal(escapeHtml('safe name'), 'safe name')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
  assert.equal(escapeHtml(42), '42')
})
