import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { emailLayout, sendEmail } from '@/lib/email/send'

export const runtime = 'nodejs'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function rands(cents: number) {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Email the purchase order to the supplier as an HTML line table. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const [{ data: po }, { data: lines }, { data: settings }] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(*)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('purchase_order_lines').select('*').eq('po_id', id).order('sort_order'),
    supabase.from('company_settings').select('contact_email, contact_phone').eq('id', true).maybeSingle(),
  ])

  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  const supplier = po.supplier as { name: string; email: string | null; contact_person: string | null } | null
  if (!supplier?.email) {
    return NextResponse.json({ error: 'This supplier has no email address — add one under Settings → Suppliers.' }, { status: 400 })
  }
  if (!lines?.length) return NextResponse.json({ error: 'This purchase order has no lines' }, { status: 400 })
  if (po.status === 'cancelled') return NextResponse.json({ error: 'This purchase order is cancelled' }, { status: 409 })

  const totalCents = lines.reduce((sum, line) => sum + Number(line.qty_ordered) * line.unit_cost_cents, 0)
  const rows = lines.map((line) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${escapeHtml(line.sku || '—')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${escapeHtml(line.description)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">${line.qty_ordered}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">${rands(line.unit_cost_cents)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">${rands(Number(line.qty_ordered) * line.unit_cost_cents)}</td>
    </tr>`).join('')

  const html = emailLayout(
    `Purchase Order ${po.po_number}`,
    `<p style="font-size:15px;line-height:1.6;">Hi${supplier.contact_person ? ` ${escapeHtml(supplier.contact_person)}` : ''},</p>
     <p style="font-size:15px;line-height:1.6;">Please supply the following${po.expected_date ? ` by <strong>${new Date(po.expected_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>` : ''}. Use reference <strong>${escapeHtml(po.po_number)}</strong> on the invoice and delivery note.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;margin:14px 0;">
       <tr>
         <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">SKU</th>
         <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Description</th>
         <th style="padding:6px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Qty</th>
         <th style="padding:6px 8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Unit</th>
         <th style="padding:6px 8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Total</th>
       </tr>
       ${rows}
       <tr>
         <td colspan="4" style="padding:8px;text-align:right;font-weight:bold;font-size:13px;">Order total</td>
         <td style="padding:8px;text-align:right;font-weight:bold;font-size:13px;">${rands(totalCents)}</td>
       </tr>
     </table>
     ${po.notes ? `<p style="font-size:13px;color:#6b7280;">Notes: ${escapeHtml(po.notes)}</p>` : ''}
     <p style="font-size:13px;color:#6b7280;">Please confirm availability and lead time by replying to this email.</p>`,
  )
  const text = [
    `Purchase Order ${po.po_number}`,
    ...(po.expected_date ? [`Required by: ${po.expected_date}`] : []),
    '',
    ...lines.map((line) => `${line.sku || '-'} | ${line.description} | x${line.qty_ordered} | ${rands(line.unit_cost_cents)} | ${rands(Number(line.qty_ordered) * line.unit_cost_cents)}`),
    '',
    `Order total: ${rands(totalCents)}`,
    'Please confirm availability and lead time by reply.',
  ].join('\n')

  // CC any supplier contacts flagged "CC on POs" (excluding the primary recipient)
  const { data: ccContacts } = po.supplier_id
    ? await supabase
        .from('supplier_contacts')
        .select('email')
        .eq('supplier_id', po.supplier_id)
        .eq('cc_on_po', true)
    : { data: [] as { email: string | null }[] }
  const cc = Array.from(
    new Set(
      (ccContacts ?? [])
        .map((c) => (c.email ?? '').trim())
        .filter((e) => e && e.toLowerCase() !== supplier.email!.toLowerCase()),
    ),
  )

  const result = await sendEmail({
    to: [supplier.email],
    cc: cc.length ? cc : undefined,
    subject: `Purchase Order ${po.po_number} — Haberl Electrical & Solar`,
    html,
    text,
    replyTo: settings?.contact_email ?? undefined,
  })
  if (!result.sent) {
    return NextResponse.json({ error: result.error ?? 'Email failed' }, { status: 502 })
  }

  if (po.status === 'draft') {
    await supabase
      .from('purchase_orders')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
  }

  return NextResponse.json({ ok: true })
}
