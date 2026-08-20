import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Check, Eye } from 'lucide-react'
import { createClient, getUser } from '@/lib/supabase/server'
import { fetchAllRowsParallel } from '@/lib/supabase/fetch-all'
import { mapSettingsToPricing, type EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { engineFor, fetchWorkTypes } from '@/lib/quotes/work-types'
import { priceQuoteRequest, renderQuoteDocument } from '@/lib/quotes/build-quote-document'
import { formatCents } from '@/lib/quotes/public'
import { PublicShell } from '../../[token]/PublicShell'
import { QuoteFrame } from '../../[token]/QuoteFrame'
import { PrintQuoteButton } from '../../[token]/PrintQuoteButton'
import { scrubSupplierMarkup } from '@/lib/catalog/supplier-tags'

export const metadata = { title: 'Customer preview — Haberl' }

// Statuses where the customer is already looking at a saved document: preview
// shows THAT html, not a fresh render, so staff see what was actually sent.
const SENT_STATUSES = ['sent', 'accepted', 'declined']

const STAFF_ROLES = new Set(['field_worker', 'manager', 'admin'])

/**
 * "See it as the customer will" — the quote document in the customer's own
 * chrome, one click from the builder and without sending anything.
 *
 * Draft (pending/generated): rendered live from the current design/scope through
 * the same builder /api/quotes/[id]/generate uses, so it reflects unsaved-to-
 * document edits. Nothing is written — no quote number is consumed, no status
 * moves. Sent onwards: the stored quote_html, which is what the link serves.
 *
 * The accept panel is a dead facsimile. Rendering the real one would put a live
 * "Accept quote" button in front of staff on the customer's behalf.
 */
export default async function QuotePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  // Deliberately outside /portal so the customer's chrome isn't wrapped in the
  // staff sidebar — which means proxy.ts doesn't gate it and this page must.
  if (!user) redirect(`/auth/login?next=/q/preview/${id}`)

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !STAFF_ROLES.has(profile.role)) redirect('/portal')

  // Which quotes this user may see is RLS's job (migration 072) — if the row
  // comes back, they're allowed to see it.
  const { data: quote } = await supabase
    .from('quote_requests').select('*').eq('id', id).maybeSingle()
  if (!quote) notFound()

  const workTypes = await fetchWorkTypes(supabase)
  const isSolar = engineFor(quote.work_type, workTypes) === 'solar'
  const backHref = `/portal/employee/quotes-v2/${id}`

  const isSent = SENT_STATUSES.includes(quote.status) && !!quote.quote_html

  let html: string | null = null
  let error: string | null = null
  let staleNote: string | null = null
  let totalCents: number | null = null
  let depositCents: number | null = null

  if (isSent) {
    html = quote.quote_html
    totalCents = quote.total_amount
    depositCents = quote.deposit_amount
  } else {
    // Same inputs as a real generate: full catalog (paged — a partial map
    // silently prices missing items at R0) and live company settings.
    const [{ data: catalogRows, error: catalogError }, { data: settings }] = await Promise.all([
      fetchAllRowsParallel<EquipmentCatalogItem>((from, to) =>
        supabase.from('equipment_catalog').select('*').order('id').range(from, to)),
      supabase.from('company_settings').select('*').eq('id', true).maybeSingle(),
    ])
    if (catalogError) {
      error = `Could not load the equipment catalog: ${catalogError.message}`
    } else {
      const catalog = new Map<string, EquipmentCatalogItem>()
      for (const item of catalogRows) catalog.set(item.id, item)
      const pricing = mapSettingsToPricing(settings ?? {})
      const priceResult = priceQuoteRequest({ quote, catalog, pricing, workTypes })
      if (!priceResult.ok) {
        error = priceResult.error
      } else {
        const doc = renderQuoteDocument({
          priced: priceResult.priced,
          quote,
          catalog,
          pricing,
          workTypes,
          // No number is allocated for a preview — the sequence is consumed at
          // generate. An un-numbered draft shows a clearly fake one.
          quoteNumber: quote.quote_number ? String(quote.quote_number) : 'DRAFT',
          expiryDays: (settings?.quote_expiry_days as number | null) ?? 30,
        })
        html = doc.html
        totalCents = Math.round(doc.bom.totalSellR * 100)
        depositCents = Math.round(doc.depositTotalR * 100)
      }
    }
    // A generated quote whose design was since emptied still has a document the
    // customer could be sent — show it rather than dead-ending on the render.
    if (error && quote.quote_html) {
      staleNote = error
      error = null
      html = quote.quote_html
      totalCents = quote.total_amount
      depositCents = quote.deposit_amount
    }
  }

  // Same scrub the live link applies — the preview's job is to show exactly
  // what the customer will see (see lib/catalog/supplier-tags.ts).
  if (html) html = scrubSupplierMarkup(html)

  const expiryFormatted = quote.expiry_date
    ? new Date(quote.expiry_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div>
      {/* Staff-only bar — everything below it is the customer's view. */}
      <div className="sticky top-0 z-10 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-200">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Link href={backHref} className="inline-flex items-center gap-1 font-medium hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the builder
          </Link>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Eye className="h-3.5 w-3.5" /> Customer preview
          </span>
          <span className="text-xs opacity-80">
            {isSent
              ? 'This is the document the customer was sent — the link serves exactly this.'
              : staleNote
                ? `Showing the last generated document — a live render isn't possible: ${staleNote}`
                : 'Rendered live from the current design. Nothing is saved and no quote number is used.'}
          </span>
        </div>
      </div>

      {error || !html ? (
        <PublicShell quoteNumber={quote.quote_number} solar={isSolar}>
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <h1 className="text-lg font-bold text-primary">Nothing to show the customer yet</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {error ?? 'This quote has no document yet.'}
            </p>
            <Link
              href={backHref}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Back to the builder
            </Link>
          </div>
        </PublicShell>
      ) : (
        <PublicShell quoteNumber={quote.quote_number ?? 'DRAFT'} solar={isSolar}>
          <div>
            <h1 className="text-xl font-bold text-primary">
              {isSolar ? 'Solar quote' : 'Quote'} for {quote.customer_name}
            </h1>
            {quote.address && <p className="mt-0.5 text-sm text-muted-foreground">{quote.address}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-lg font-bold text-primary">{formatCents(totalCents)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Deposit</p>
              <p className="mt-1 text-lg font-bold text-primary">{formatCents(depositCents)}</p>
            </div>
          </div>

          {expiryFormatted && (
            <p className="text-xs text-muted-foreground">
              Valid until <strong className="text-foreground">{expiryFormatted}</strong>.
            </p>
          )}

          {/* Facsimile of the accept panel — deliberately inert, but drawn at the
              same weight the customer sees. A blanket opacity here greyed the
              whole panel out, which is not what the customer's page looks like;
              the caption below carries the "this does nothing" message. */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold text-primary">Ready to go ahead?</h2>
            <p className="mt-3 text-sm text-muted-foreground">Your full name (acts as your signature)</p>
            <div className="mt-1.5 h-10 rounded-md border border-border bg-background" />
            <label className="mt-3 flex items-start gap-2.5 text-sm">
              <input type="checkbox" disabled className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span className="text-muted-foreground">
                I accept this quote and authorise Haberl Electrical &amp; Solar to proceed with the{' '}
                {isSolar ? 'installation' : 'work'} as quoted.
              </span>
            </label>
            <div
              aria-disabled
              className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground"
            >
              <Check className="h-4 w-4" /> Accept quote
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Preview only — accept and decline are disabled here. The customer signs and accepts
              from their own link.
            </p>
          </div>

          <div className="flex justify-end">
            <PrintQuoteButton html={html} />
          </div>
          <QuoteFrame html={html} title={isSolar ? 'Solar quote' : 'Quote'} />
        </PublicShell>
      )}
    </div>
  )
}
