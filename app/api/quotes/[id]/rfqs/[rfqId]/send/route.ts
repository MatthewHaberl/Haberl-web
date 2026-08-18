import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailLayout, sendEmail } from '@/lib/email/send'
import {
  renderRfqHtml, renderRfqText, whatsappLink,
  type RfqChannel, type RfqRenderContext, type SupplierRfqLineRow,
} from '@/lib/quotes/supplier-rfq'

export const runtime = 'nodejs'

/**
 * Send an RFQ, or preview exactly what would be sent (W99).
 *
 * GET  — the rendered email, the plain text behind Copy, and the WhatsApp link.
 *        Nothing leaves the building; this is what the dialog shows.
 * POST — {channel}. 'email' hands it to Resend; 'copy' and 'whatsapp' record
 *        that it went out by hand (the browser owns the clipboard and the share
 *        sheet, so the server only stamps the trail).
 *
 * Every channel stamps sent_at/sent_via so a quote's history shows what was
 * asked, of whom, and when.
 */

const CHANNELS: RfqChannel[] = ['email', 'whatsapp', 'copy']

async function load(quoteId: string, rfqId: string) {
  const admin = createAdminClient()
  const { data: rfq } = await admin
    .from('supplier_rfqs')
    .select('*')
    .eq('id', rfqId)
    .eq('quote_request_id', quoteId)
    .maybeSingle()
  if (!rfq) return null

  const [{ data: lines }, { data: quote }, { data: settings }] = await Promise.all([
    admin.from('supplier_rfq_lines').select('*').eq('rfq_id', rfqId).order('line_no'),
    admin.from('quote_requests').select('customer_name, address, quote_number').eq('id', quoteId).maybeSingle(),
    admin.from('company_settings').select('company_name, contact_email, contact_phone').eq('id', true).maybeSingle(),
  ])
  const { data: supplier } = rfq.supplier_id
    ? await admin.from('suppliers').select('id, name, email, phone, contact_person').eq('id', rfq.supplier_id).maybeSingle()
    : { data: null }

  const jobRef = [quote?.customer_name, quote?.address].filter(Boolean).join(' — ') || null
  const ctx: RfqRenderContext = {
    rfqNumber: rfq.rfq_number,
    supplierName: rfq.supplier_name || supplier?.name || '',
    contactPerson: supplier?.contact_person ?? null,
    jobRef,
    message: rfq.message,
    fromName: settings?.company_name ?? 'Haberl Electrical & Solar',
    fromEmail: settings?.contact_email ?? null,
    fromPhone: settings?.contact_phone ?? null,
  }
  return { admin, rfq, supplier, lines: (lines ?? []) as SupplierRfqLineRow[], ctx }
}

async function requireManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) as Response }
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: new Response('Forbidden', { status: 403 }) as Response }
  }
  return { userId: user.id }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; rfqId: string }> },
) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const { id, rfqId } = await params
  const loaded = await load(id, rfqId)
  if (!loaded) return new Response('RFQ not found', { status: 404 })
  const { rfq, supplier, lines, ctx } = loaded

  const text = renderRfqText(ctx, lines)
  return NextResponse.json({
    subject: `RFQ ${rfq.rfq_number} — ${ctx.jobRef ?? 'Haberl Electrical & Solar'}`,
    to: supplier?.email ?? null,
    supplierPhone: supplier?.phone ?? null,
    text,
    html: renderRfqHtml(ctx, lines),
    whatsappUrl: whatsappLink(text, supplier?.phone),
    lineCount: lines.length,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; rfqId: string }> },
) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const { id, rfqId } = await params
  const body = await req.json().catch(() => ({}))
  const channel: RfqChannel = CHANNELS.includes(body.channel) ? body.channel : 'email'

  const loaded = await load(id, rfqId)
  if (!loaded) return new Response('RFQ not found', { status: 404 })
  const { admin, rfq, supplier, lines, ctx } = loaded

  if (rfq.status === 'cancelled') {
    return NextResponse.json({ error: 'This RFQ is cancelled.' }, { status: 409 })
  }
  if (!lines.length) {
    return NextResponse.json({ error: 'This RFQ has no lines on it yet.' }, { status: 400 })
  }

  const sentTo: string[] = []

  if (channel === 'email') {
    if (!supplier?.email) {
      return NextResponse.json(
        { error: `${rfq.supplier_name || 'This supplier'} has no email address — add one under Settings → Suppliers, or send it by WhatsApp instead.` },
        { status: 400 },
      )
    }
    // CC anyone flagged "CC on POs" — same desk that handles the quotes.
    const { data: ccContacts } = await admin
      .from('supplier_contacts').select('email').eq('supplier_id', supplier.id).eq('cc_on_po', true)
    const cc = Array.from(new Set(
      (ccContacts ?? [])
        .map((c) => (c.email ?? '').trim())
        .filter((e) => e && e.toLowerCase() !== supplier.email!.toLowerCase()),
    ))

    const result = await sendEmail({
      to: [supplier.email],
      cc: cc.length ? cc : undefined,
      subject: `RFQ ${rfq.rfq_number} — ${ctx.jobRef ?? 'Haberl Electrical & Solar'}`,
      html: emailLayout(`Request for quotation ${rfq.rfq_number}`, renderRfqHtml(ctx, lines)),
      text: renderRfqText(ctx, lines),
      replyTo: ctx.fromEmail ?? undefined,
    })
    if (!result.sent) {
      return NextResponse.json({ error: result.error ?? 'Email failed' }, { status: 502 })
    }
    sentTo.push(supplier.email, ...cc)
  }

  const { data: updated, error } = await admin
    .from('supplier_rfqs')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_via: channel,
      sent_to: sentTo,
    })
    .eq('id', rfqId)
    .select('*')
    .single()
  if (error) {
    // The mail is already gone — say so rather than let the UI offer a resend.
    console.error('[rfqs] stamp sent', error)
    return NextResponse.json(
      { error: 'Sent, but the RFQ status could not be updated. Refresh before sending again.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, rfq: updated, sentTo })
}
