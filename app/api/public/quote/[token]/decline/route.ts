import { NextResponse } from 'next/server'
import { sendAdminNotice } from '@/lib/email/quotes'
import { getBaseUrl, getCompanySettings, getQuoteByToken } from '@/lib/quotes/server'
import { escapeHtml } from '@/lib/utils'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { supabase, quote } = await getQuoteByToken(token)
  if (!quote) return new Response('Quote not found', { status: 404 })

  if (quote.status === 'declined') return NextResponse.json({ ok: true })
  if (!['generated', 'sent'].includes(quote.status)) {
    return new Response('This quote is no longer open', { status: 409 })
  }

  let body: { reason?: string }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const reason = String(body.reason ?? '').trim().slice(0, 500) || null

  const { error } = await supabase
    .from('quote_requests')
    .update({
      status: 'declined',
      declined_at: new Date().toISOString(),
      decline_reason: reason,
    })
    .eq('id', quote.id)
    .in('status', ['generated', 'sent'])
  if (error) {
    console.error('[public/decline]', error)
    return new Response('Could not record this — please try again', { status: 500 })
  }

  try {
    const settings = await getCompanySettings(supabase)
    await sendAdminNotice(
      settings?.contact_email ?? null,
      `Quote declined — ${quote.quote_number ?? quote.customer_name}`,
      [
        `<strong>${escapeHtml(quote.customer_name)}</strong> declined quote <strong>${escapeHtml(quote.quote_number ?? '')}</strong>.`,
        reason ? `Reason: ${escapeHtml(reason)}` : 'No reason given.',
      ],
      `${getBaseUrl()}/portal/employee/quotes-v2/${quote.id}`,
      'Open quote',
    )
  } catch (err) {
    console.error('[public/decline] admin notice failed', err)
  }

  return NextResponse.json({ ok: true })
}
