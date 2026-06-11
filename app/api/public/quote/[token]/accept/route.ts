import { NextResponse } from 'next/server'
import { createJobFromQuote } from '@/lib/jobs/create-from-quote'
import { sendAdminNotice } from '@/lib/email/quotes'
import { formatCents, isQuoteExpired, parseTierOptions } from '@/lib/quotes/public'
import { getBaseUrl, getClientIp, getCompanySettings, getQuoteByToken } from '@/lib/quotes/server'

export const runtime = 'nodejs'

/**
 * Public online acceptance. The unguessable share token is the credential;
 * the typed name + timestamp + IP form the acceptance record.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { supabase, quote } = await getQuoteByToken(token)
  if (!quote) return new Response('Quote not found', { status: 404 })

  // Idempotent: a second tap on Accept is fine. If a previous attempt
  // recorded the acceptance but job creation failed, retry it now.
  if (quote.status === 'accepted') {
    const actor = quote.generated_by ?? quote.submitted_by
    if (actor) {
      const retry = await createJobFromQuote(supabase, quote, actor)
      if (!retry.ok) {
        console.error('[public/accept] job retry failed:', retry.error)
        return new Response('Could not open the installation job - please contact us', { status: 500 })
      }
    }
    return NextResponse.json({ ok: true })
  }
  if (!['generated', 'sent'].includes(quote.status)) {
    return new Response('This quote is no longer open for acceptance', { status: 409 })
  }
  if (isQuoteExpired(quote)) {
    return new Response('This quote has expired — please contact us for a refreshed version', { status: 410 })
  }

  let body: { name?: string; tier?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request', { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  if (name.length < 2 || name.length > 120) {
    return new Response('Please enter your full name to accept', { status: 400 })
  }

  // Multi-tier: lock in the chosen option's totals so the job, deposit and
  // emails all reflect what the customer actually accepted.
  const tierOptions = parseTierOptions(quote)
  const chosen = tierOptions?.find((option) => option.tier === body.tier) ?? null

  const update: Record<string, unknown> = {
    status: 'accepted',
    accepted_at: new Date().toISOString(),
    acceptance_name: name,
    acceptance_ip: getClientIp(req),
    accepted_tier: chosen?.tier ?? null,
  }
  if (chosen?.totalCents != null) update.total_amount = chosen.totalCents
  if (chosen?.depositCents != null) update.deposit_amount = chosen.depositCents

  const { error: updateError } = await supabase
    .from('quote_requests')
    .update(update)
    .eq('id', quote.id)
    .in('status', ['generated', 'sent'])
  if (updateError) {
    console.error('[public/accept]', updateError)
    return new Response('Could not record acceptance — please try again', { status: 500 })
  }

  // Create the job (idempotent). Assigned to whoever generated the quote.
  const acceptedQuote = { ...quote, ...update }
  const actorId = quote.generated_by ?? quote.submitted_by
  let jobWarning: string | null = null
  if (actorId) {
    const result = await createJobFromQuote(supabase, acceptedQuote, actorId)
    if (!result.ok) jobWarning = result.error
  } else {
    jobWarning = 'No staff account linked to this quote — create the job manually.'
  }
  if (jobWarning) {
    console.error('[public/accept] job creation:', jobWarning)
    await supabase
      .from('quote_requests')
      .update({
        status: quote.status,
        accepted_at: null,
        acceptance_name: null,
        acceptance_ip: null,
        accepted_tier: null,
        total_amount: quote.total_amount,
        deposit_amount: quote.deposit_amount,
      })
      .eq('id', quote.id)
      .eq('status', 'accepted')

    return new Response('Could not open the installation job - please try again or contact us', { status: 500 })
  }

  // Notify admin — never block the customer on email problems
  try {
    const settings = await getCompanySettings(supabase)
    await sendAdminNotice(
      settings?.contact_email ?? null,
      `Quote accepted — ${quote.quote_number ?? quote.customer_name}`,
      [
        `<strong>${quote.customer_name}</strong> accepted quote <strong>${quote.quote_number ?? ''}</strong>${chosen ? ` (${chosen.label} option)` : ''}.`,
        `Signed: ${name}`,
        `Total: ${formatCents((update.total_amount as number) ?? quote.total_amount)} · Deposit: ${formatCents((update.deposit_amount as number) ?? quote.deposit_amount)}`,
        ...(jobWarning ? [`⚠ ${jobWarning}`] : []),
      ],
      `${getBaseUrl()}/portal/employee/quotes/${quote.id}`,
      'Open quote',
    )
  } catch (err) {
    console.error('[public/accept] admin notice failed', err)
  }

  return NextResponse.json({ ok: true })
}
