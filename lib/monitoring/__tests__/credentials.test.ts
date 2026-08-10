// Run with: npx tsx --test lib/monitoring/__tests__/credentials.test.ts
//
// These blobs are customers' inverter-portal logins sitting in a Supabase column.
// Two failures matter: the ciphertext leaking the password (encryption that isn't),
// and decryption breaking after a round-trip (every monitoring integration goes
// dark at once). The AES-GCM auth tag also has to actually reject tampering —
// otherwise a modified row is silently trusted.
//
// getKey() reads MONITORING_CREDENTIALS_KEY lazily, on each call, so the tests can
// set it here rather than depending on the developer's .env.local.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  encryptCredentials,
  decryptCredentials,
  decryptCredentialsLoose,
} from '../credentials'
import type { BrandCredentials } from '../types'

const KEY_A = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' // 64 hex = 32 bytes
const KEY_B = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
process.env.MONITORING_CREDENTIALS_KEY = KEY_A

const CREDS: BrandCredentials = {
  app_id: 'haberl-app',
  app_secret: 'sup3r-s3cret-value',
  username: 'monitor@haberl.co.za',
  password: 'p@ssw0rd with spaces',
}

test('credentials survive an encrypt → decrypt round trip unchanged', () => {
  assert.deepEqual(decryptCredentials(encryptCredentials(CREDS)), CREDS)
  // Empty and unicode payloads must not be special-cased into breakage.
  assert.deepEqual(decryptCredentials(encryptCredentials({})), {})
  const odd: BrandCredentials = { password: 'ünïcøde ✓ "quotes" \\ \n newline', sn: '' }
  assert.deepEqual(decryptCredentials(encryptCredentials(odd)), odd)
})

test('the stored blob never contains the secret in readable form', () => {
  const blob = encryptCredentials(CREDS)
  for (const secret of Object.values(CREDS)) {
    assert.ok(!blob.includes(String(secret)), `"${secret}" appeared verbatim in the stored blob`)
    assert.ok(!Buffer.from(blob, 'hex').toString('utf8').includes(String(secret)))
  }
  assert.ok(!blob.includes('password'), 'even the JSON keys must not be readable')
})

test('the blob has the documented iv+tag+ciphertext hex layout', () => {
  const blob = encryptCredentials(CREDS)
  assert.match(blob, /^[0-9a-f]+$/, 'must be pure hex — it is stored in a text column')
  assert.equal(blob.length % 2, 0)
  assert.ok(blob.length > 56, 'iv (24 hex) + tag (32 hex) leaves room for ciphertext')
  // Those offsets are exactly what decryptCredentials slices back out.
  assert.equal(Buffer.from(blob.slice(0, 24), 'hex').length, 12)  // 96-bit GCM iv
  assert.equal(Buffer.from(blob.slice(24, 56), 'hex').length, 16) // 128-bit auth tag
})

test('encrypting the same credentials twice never produces the same blob', () => {
  // A random IV per encryption is what stops an observer with DB read access from
  // spotting that two customers share a password, or that a password is unchanged.
  const blobs = new Set(Array.from({ length: 8 }, () => encryptCredentials(CREDS)))
  assert.equal(blobs.size, 8, 'IV reuse — encryption is deterministic')
  // ...and every one of them still decrypts to the same thing.
  for (const b of blobs) assert.deepEqual(decryptCredentials(b), CREDS)
})

test('a tampered blob is rejected, not silently decrypted', () => {
  const blob = encryptCredentials(CREDS)
  const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === '0' ? '1' : '0') + s.slice(i + 1)
  for (const [where, i] of [['iv', 2], ['auth tag', 30], ['ciphertext', 70]] as const) {
    assert.throws(() => decryptCredentials(flip(blob, i)), `${where} tampering went undetected`)
  }
  assert.throws(() => decryptCredentials(blob.slice(0, -2)), 'truncation went undetected')
})

test('a blob encrypted with another key cannot be read', () => {
  const blob = encryptCredentials(CREDS)
  process.env.MONITORING_CREDENTIALS_KEY = KEY_B
  try {
    assert.throws(() => decryptCredentials(blob))
    // And the graceful path degrades to {} rather than handing back junk.
    assert.deepEqual(decryptCredentialsLoose(blob), {})
  } finally {
    process.env.MONITORING_CREDENTIALS_KEY = KEY_A
  }
})

test('a missing or malformed key fails loudly instead of encrypting with a weak one', () => {
  const saved = process.env.MONITORING_CREDENTIALS_KEY
  try {
    for (const bad of [undefined, '', 'short', 'a'.repeat(63), 'a'.repeat(65)]) {
      if (bad === undefined) delete process.env.MONITORING_CREDENTIALS_KEY
      else process.env.MONITORING_CREDENTIALS_KEY = bad
      assert.throws(() => encryptCredentials(CREDS), /64-character hex/, `key ${JSON.stringify(bad)} was accepted`)
      assert.throws(() => decryptCredentials('deadbeef'), /64-character hex/)
    }
  } finally {
    process.env.MONITORING_CREDENTIALS_KEY = saved
  }
})

// ── decryptCredentialsLoose — the "never crash the collector" path ─────────────

test('decryptCredentialsLoose returns {} for nothing at all', () => {
  assert.deepEqual(decryptCredentialsLoose(null), {})
  assert.deepEqual(decryptCredentialsLoose(undefined), {})
  assert.deepEqual(decryptCredentialsLoose(''), {})
})

test('decryptCredentialsLoose reads a properly encrypted blob', () => {
  assert.deepEqual(decryptCredentialsLoose(encryptCredentials(CREDS)), CREDS)
})

test('decryptCredentialsLoose tolerates dev-mode plaintext JSON', () => {
  // Rows written before encryption existed (or by hand during setup) are plain
  // JSON; they must keep working rather than knocking the collector over.
  assert.deepEqual(decryptCredentialsLoose(JSON.stringify(CREDS)), CREDS)
  assert.deepEqual(decryptCredentialsLoose('{"api_key":"abc"}'), { api_key: 'abc' })
  assert.deepEqual(decryptCredentialsLoose('{}'), {})
})

test('decryptCredentialsLoose returns {} for garbage rather than throwing', () => {
  for (const junk of [
    'not json at all',
    '{"unterminated": ',
    'deadbeef',                 // valid hex, but far too short to be a blob
    'z'.repeat(200),            // not hex
    'a'.repeat(200),            // right shape, wrong content
  ]) {
    assert.deepEqual(decryptCredentialsLoose(junk), {}, `expected {} for ${junk.slice(0, 24)}`)
  }
})

test('decryptCredentialsLoose returns {} for JSON that parses but is not a credentials object', () => {
  // Regression guard. The fallback used to be a bare JSON.parse, so a stored value
  // that was valid JSON but not an object came back as that value. That broke the
  // one promise this "loose" variant makes — never hand the caller something that
  // crashes. Concretely:
  //   'null'  -> backfill.ts does Object.keys(creds) and throws a TypeError
  //   '"abc"' -> monitoring/test spreads it, yielding {0:'a',1:'b',2:'c'}
  for (const notAnObject of ['null', '123', '"abc"', '[]', '[1,2,3]', 'true']) {
    assert.deepEqual(
      decryptCredentialsLoose(notAnObject), {},
      `expected {} for the non-object JSON ${notAnObject}`,
    )
  }
})

test('decryptCredentialsLoose still returns real credential objects untouched', () => {
  // The narrowing must not over-reach: a genuine object still comes through whole.
  assert.deepEqual(decryptCredentialsLoose('{"api_key":"abc","nested":{"a":1}}'), {
    api_key: 'abc', nested: { a: 1 },
  } as unknown as BrandCredentials)
})
