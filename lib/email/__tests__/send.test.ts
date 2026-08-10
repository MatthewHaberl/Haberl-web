// Run with: npx tsx --test lib/email/__tests__/send.test.ts
//
// Everything the customer receives goes through emailLayout(). Titles are built
// from customer-supplied text (names, quote references, typed reasons), so the
// title MUST be HTML-escaped — an unescaped one turns every quote email into a
// delivery vector for whatever a lead typed into the public form.
// formatCents is the money the customer reads; a wrong divisor or a silent NaN
// is a number they will hold us to.
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCents, emailLayout, emailButton, sendEmail } from '../send'

// en-ZA formats money with a COMMA decimal and a NON-BREAKING space (U+00A0) for
// thousands — not an ordinary space. Normalising here keeps the assertions
// readable while still pinning the real output.
const NBSP = ' '
const plain = (s: string) => s.split(NBSP).join(' ')

// ── formatCents ───────────────────────────────────────────────────────────────

test('formatCents renders cents as rands with exactly two decimals', () => {
  assert.equal(formatCents(0), 'R0,00')
  assert.equal(formatCents(1), 'R0,01')
  assert.equal(formatCents(99), 'R0,99')
  assert.equal(formatCents(100), 'R1,00')
  assert.equal(plain(formatCents(150_050)), 'R1 500,50')
  // Never truncated to whole rands, never shown with 3+ decimals.
  assert.equal(formatCents(12_345), 'R123,45')
  assert.match(formatCents(12_345), /^R\d+,\d{2}$/)
})

test('formatCents groups thousands so large quote totals stay readable', () => {
  assert.equal(plain(formatCents(123_456_789)), 'R1 234 567,89')
  assert.equal(plain(formatCents(1_000_00)), 'R1 000,00')
  assert.equal(plain(formatCents(1_234_567_890_123)), 'R12 345 678 901,23')
  // The grouping character really is U+00A0, which some mail clients and PDF
  // renderers treat differently to a plain space — pin it so a locale change
  // that silently swaps separators is caught.
  assert.ok(formatCents(123_456_789).includes(NBSP))
  assert.ok(!formatCents(123_456_789).includes(' '))
})

test('formatCents shows a dash for "no amount", not R0,00 and not NaN', () => {
  // A null total means "not costed yet". Rendering it as R0,00 tells the customer
  // the job is free.
  assert.equal(formatCents(null), '—')
  assert.equal(formatCents(undefined), '—')
  assert.notEqual(formatCents(null), formatCents(0))
  for (const v of [null, undefined, 0, -1, 1e12]) {
    assert.ok(!formatCents(v).includes('NaN'), `NaN leaked for ${v}`)
    assert.ok(!formatCents(v).includes('undefined'))
  }
})

test('formatCents keeps credits negative', () => {
  // Credit notes / refunds must not silently render as a charge.
  assert.equal(formatCents(-12_345), 'R-123,45')
  assert.ok(formatCents(-1).startsWith('R-'))
})

// ── emailLayout ───────────────────────────────────────────────────────────────

test('emailLayout HTML-escapes the title', () => {
  const html = emailLayout(`<script>alert('xss')</script>`, '<p>body</p>')
  assert.ok(!html.includes('<script>'), 'a script tag in the title reached the rendered email')
  assert.ok(!html.includes('</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;'))
})

test('emailLayout escapes the metacharacters that break out of the heading', () => {
  const html = emailLayout(`Quote "A & B" <img src=x onerror=alert(1)>`, '')
  assert.ok(html.includes('&amp;'), 'ampersands must be escaped first, not double-escaped away')
  assert.ok(html.includes('&quot;'))
  assert.ok(!html.includes('<img'), 'an injected tag survived')
  // The attack text is still visible, but inert — it renders as characters in the
  // heading instead of becoming an element.
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  // Common real title: an apostrophe in a customer name must survive readably.
  assert.ok(emailLayout("O'Brien's quote", '').includes('O&#39;Brien&#39;s quote'))
})

test('emailLayout renders the body as HTML — callers own escaping their content', () => {
  // Deliberate: the body is composed HTML (lists, buttons). This test pins that
  // contract so nobody "fixes" it by escaping the body and shipping visible tags.
  const html = emailLayout('Title', '<p style="color:red">Hello</p>')
  assert.ok(html.includes('<p style="color:red">Hello</p>'))
})

test('emailLayout produces a complete, self-contained email document', () => {
  const html = emailLayout('Daily briefing', '<p>x</p>')
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(html.includes('</html>'))
  // Email clients drop <style> blocks and external CSS — styling must stay inline.
  assert.ok(!/<style[\s>]/i.test(html), 'a stylesheet block will be stripped by mail clients')
  assert.ok(!/<link[\s>]/i.test(html))
  assert.ok(html.includes('info@haberl.co.za'), 'the footer identifies the sender')
})

// ── emailButton ───────────────────────────────────────────────────────────────

test('emailButton renders a real anchor with the href and label given', () => {
  const html = emailButton('https://haberl.co.za/q/abc123', 'View your quote')
  assert.ok(html.includes('href="https://haberl.co.za/q/abc123"'))
  assert.ok(html.includes('View your quote'))
  // Table-wrapped, because Outlook ignores padding on a bare <a>.
  assert.ok(html.includes('<table'))
})

test('emailButton does NOT escape its href or label (current behaviour)', () => {
  // Documenting reality, not endorsing it: every call site today passes a
  // code-built URL and a literal label, so nothing user-supplied reaches here —
  // but the function itself offers no protection if that ever changes.
  const html = emailButton('https://x.co/?a=1&b=2', 'Pay & accept')
  assert.ok(html.includes('href="https://x.co/?a=1&b=2"'), 'ampersand is passed through raw')
  assert.ok(html.includes('Pay & accept'))
})

// ── sendEmail ─────────────────────────────────────────────────────────────────

test('sendEmail degrades to { sent: false } when Resend is not configured', async () => {
  const saved = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  try {
    const res = await sendEmail({ to: ['a@b.co.za'], subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' })
    // Callers branch on `sent`; throwing here would fail the whole cron/API route
    // just because email is not set up in this environment.
    assert.equal(res.sent, false)
    assert.match(res.error ?? '', /RESEND_API_KEY/)
  } finally {
    if (saved !== undefined) process.env.RESEND_API_KEY = saved
  }
})
