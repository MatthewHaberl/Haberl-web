import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCredits, type QuoteCredit } from '@/lib/quotes/credits'
import { reissueWithCredits } from '@/lib/quotes/build-quote-document'
import { snapshotQuoteVersion } from '@/lib/quotes/versions'

export const runtime = 'nodejs'

/**
 * Save the credits on a quote — money already owed to the customer, taken off
 * what they pay (migration 126).
 *
 * Why this is a route and not a client-side update to the column: a credit is
 * money, and the two figures the rest of the system spends (total_amount,
 * deposit_amount) have to move with it in the same write. A browser that
 * updated `credits` and then computed those itself would be one failed request
 * away from a quote whose document, total and deposit disagreed.
 *
 * Three cases, all handled here:
 *   pending    nothing is rendered yet — save the credits; Generate picks them
 *              up like every other document option.
 *   generated  the draft document is rebuilt from the priced snapshot it
 *              already holds, so the credit lands without re-pricing anything.
 *   sent+      the same, but the version the customer already saw is archived
 *              first. Reissuing IS the point: crediting a finished job is the
 *              main reason this exists, and a credit only ever moves the number
 *              in the customer's favour.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  let body: { credits?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request', { status: 400 })
  }

  // parseCredits is the gate, not a formality: it drops anything negative,
  // zero or non-numeric, so a hand-rolled POST cannot turn a credit into a
  // surcharge or a NaN into a total.
  const credits: QuoteCredit[] = parseCredits(body.credits)
  const rejected = Array.isArray(body.credits) ? body.credits.length - credits.length : 0
  if (rejected > 0) {
    return NextResponse.json(
      { error: `${rejected} ${rejected === 1 ? 'entry needs' : 'entries need'} an amount greater than zero.` },
      { status: 400 },
    )
  }

  const { data: quote } = await supabase
    .from('quote_requests').select('*').eq('id', id).maybeSingle()
  if (!quote) return new Response('Quote not found', { status: 404 })
  if (quote.archived_at || quote.deleted_at) {
    return NextResponse.json(
      { error: `This quote is ${quote.deleted_at ? 'deleted' : 'archived'} — restore it before crediting it.` },
      { status: 409 },
    )
  }

  const update: Record<string, unknown> = { credits }

  // Rebuild the document from the priced snapshot it already holds. Never from
  // the design — see reissueWithCredits: re-pricing a finished quote to apply a
  // credit would drag every catalog increase since it was written onto it.
  const reissue = quote.generated_quote ? reissueWithCredits(quote.generated_quote, credits) : null
  if (reissue) {
    // Archive what the customer has already been shown, before it is replaced.
    // Best-effort, same posture as the send path: losing the archive is bad,
    // refusing the credit because the archive hiccuped is worse.
    if (quote.status !== 'pending' && quote.status !== 'generated') {
      await snapshotQuoteVersion(quote, {
        sentBy: user.id,
        amendmentReason: credits.length > 0
          ? `Credit applied: ${credits.map((c) => c.label).join(', ')}`
          : 'Credit removed',
      })
    }
    update.quote_html = reissue.html
    update.generated_quote = reissue.generatedQuoteJson
    update.total_amount = Math.round(reissue.payableTotalR * 100)
    update.deposit_amount = Math.round(reissue.depositTotalR * 100)
  }

  const { error } = await supabase.from('quote_requests').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    ok: true,
    reissued: reissue !== null,
    // Null on a quote with no document yet — the panel says "applies on the
    // next generate" rather than quoting a figure that isn't saved anywhere.
    payableTotalR: reissue?.payableTotalR ?? null,
    depositTotalR: reissue?.depositTotalR ?? null,
  })
}
