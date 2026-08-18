import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRowsParallel } from '@/lib/supabase/fetch-all'
import { mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { fetchWorkTypes } from '@/lib/quotes/work-types'
import { bomForQuoteRequest } from '@/lib/quotes/build-quote-document'
import { bomToRfqCandidates } from '@/lib/quotes/supplier-rfq'

export const runtime = 'nodejs'

/**
 * RFQs on one quote (W99).
 *
 * GET  — list the RFQs raised against this quote, with their lines.
 * POST — build a fresh draft off the quote's live BOM. Every material line lands
 *        on it; the dialog is where lines get unticked, edited or added. The BOM
 *        is computed here (server-side, full catalog) rather than posted from the
 *        client so the list can't be shaped by a stale browser copy of the design.
 */

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const { id: quoteId } = await params
  const admin = createAdminClient()
  const { data: rfqs, error } = await admin
    .from('supplier_rfqs')
    .select('*')
    .eq('quote_request_id', quoteId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[rfqs] list', error)
    return new Response('Could not load the RFQs', { status: 500 })
  }
  if (!rfqs?.length) return NextResponse.json({ rfqs: [], lines: [] })

  const { data: lines } = await admin
    .from('supplier_rfq_lines')
    .select('*')
    .in('rfq_id', rfqs.map((r) => r.id))
    .order('line_no')
  return NextResponse.json({ rfqs, lines: lines ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  const { id: quoteId } = await params
  const admin = createAdminClient()

  const body = await req.json().catch(() => ({}))
  const supplierId = typeof body.supplierId === 'string' && body.supplierId ? body.supplierId : null

  const { data: quote } = await admin
    .from('quote_requests').select('*').eq('id', quoteId).maybeSingle()
  if (!quote) return new Response('Quote not found', { status: 404 })

  // Full catalog, paged — a bare select caps at ~1000 rows and the catalog is
  // ~15k since the Key import, which would silently drop items off the RFQ.
  const [{ data: catalogRows, error: catalogError }, { data: settings }, workTypes] = await Promise.all([
    fetchAllRowsParallel<EquipmentCatalogItem>((from, to) =>
      admin.from('equipment_catalog').select('*').order('id').range(from, to)),
    admin.from('company_settings').select('*').eq('id', true).maybeSingle(),
    fetchWorkTypes(admin),
  ])
  if (catalogError) {
    return NextResponse.json(
      { error: `Could not load the equipment catalog: ${catalogError.message}` },
      { status: 500 },
    )
  }
  const catalog = new Map<string, EquipmentCatalogItem>()
  for (const item of catalogRows) catalog.set(item.id, item)

  const pricing = mapSettingsToPricing(settings ?? {})
  const built = bomForQuoteRequest({ quote, catalog, pricing, workTypes })
  if (!built) {
    return NextResponse.json(
      { error: "There's nothing on this quote yet — add items to the design or scope first." },
      { status: 400 },
    )
  }
  const candidates = bomToRfqCandidates(built.bom, catalog)
  if (!candidates.length) {
    return NextResponse.json(
      { error: 'This quote has no material lines to price — only labour and fees.' },
      { status: 400 },
    )
  }

  // Supplier: the one asked for, else our only/first active supplier.
  const { data: supplier } = supplierId
    ? await admin.from('suppliers').select('id, name').eq('id', supplierId).maybeSingle()
    : await admin.from('suppliers').select('id, name').eq('active', true).order('name').limit(1).maybeSingle()

  // RFQ-<year>-NNN, numbered within the year (same shape as the PO number).
  const year = new Date().getFullYear()
  const { count } = await admin
    .from('supplier_rfqs')
    .select('*', { count: 'exact', head: true })
    .like('rfq_number', `RFQ-${year}-%`)
  const rfqNumber = `RFQ-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`

  const { data: rfq, error: rfqError } = await admin
    .from('supplier_rfqs')
    .insert({
      quote_request_id: quoteId,
      supplier_id: supplier?.id ?? null,
      supplier_name: supplier?.name ?? '',
      rfq_number: rfqNumber,
      status: 'draft',
      created_by: auth.userId,
    })
    .select('*')
    .single()
  if (rfqError || !rfq) {
    console.error('[rfqs] create', rfqError)
    return new Response('Could not create the RFQ', { status: 500 })
  }

  const { data: lines, error: linesError } = await admin
    .from('supplier_rfq_lines')
    .insert(candidates.map((c, index) => ({
      rfq_id: rfq.id,
      line_no: index,
      section: c.section,
      sku: c.sku,
      description: c.description,
      qty: c.qty,
      unit: c.unit,
      catalog_id: c.catalogId,
      needs_code: c.needsCode,
      // Why it's on the list, in the supplier's words where it matters.
      note: c.unpriced && !c.needsCode ? 'No price on file' : null,
    })))
    .select('*')
  if (linesError) {
    console.error('[rfqs] create lines', linesError)
    await admin.from('supplier_rfqs').delete().eq('id', rfq.id)
    return new Response('Could not build the RFQ lines', { status: 500 })
  }

  return NextResponse.json({ ok: true, rfq, lines: lines ?? [] })
}
