import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Archive } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  canRequestUpdatedQuote,
  formatCents,
  isValidShareToken,
  parseTierOptions,
  publicQuoteState,
} from '@/lib/quotes/public'
import { QuoteFrame } from './QuoteFrame'
import { PublicQuoteActions } from './PublicQuoteActions'
import { PrintQuoteButton } from './PrintQuoteButton'
import { PublicShell } from './PublicShell'

export const metadata: Metadata = {
  title: 'Your Solar Quote',
  robots: { index: false, follow: false },
}

// Public tokenized page — no login. Data is fetched with the service-role
// client; the unguessable UUID token is the only credential.
const VIEWABLE = ['generated', 'sent', 'accepted', 'declined']

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isValidShareToken(token)) notFound()

  const supabase = createAdminClient()
  const { data: quote } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('share_token', token)
    .maybeSingle()

  if (!quote) notFound()

  const state = publicQuoteState(quote)

  // Archived or deleted: the link stops serving the quote entirely. The customer
  // isn't dead-ended though — they can ask for fresh pricing in one tap, which
  // lands as a lead on the staff to-do list.
  if (state === 'closed') {
    return (
      <PublicShell quoteNumber={quote.quote_number}>
        <div className="rounded-lg border border-border bg-white p-8 flex flex-col items-center gap-3 text-center">
          <Archive className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold text-primary">This quote is no longer available</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            Equipment prices and system designs move on, so we&apos;ve closed this one.
            Still interested? Ask us for an updated quote — it only takes a moment.
          </p>
          <Link
            href={`/q/${token}/renew`}
            className="mt-1 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Request an updated quote
          </Link>
        </div>
      </PublicShell>
    )
  }

  if (!quote.quote_html || !VIEWABLE.includes(quote.status)) notFound()

  // First-open tracking
  if (!quote.viewed_at) {
    await supabase
      .from('quote_requests')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', quote.id)
  }

  const isOpen = state === 'open'
  const expired = state === 'expired'
  const tierOptions = parseTierOptions(quote)

  // Accepted state: banking details for EFT + deposit/proof progress
  let banking = null
  let contactPhone: string | null = null
  let proof: { uploaded: boolean; confirmed: boolean; rejected: boolean; rejectedReason: string | null } | null = null
  if (quote.status === 'accepted') {
    const [{ data: settings }, { data: job }] = await Promise.all([
      supabase.from('company_settings').select('banking, contact_phone').eq('id', true).maybeSingle(),
      supabase
        .from('jobs')
        .select('deposit_proof_url, deposit_confirmed_at, deposit_proof_rejected_at, deposit_proof_rejected_reason')
        .eq('quote_request_id', quote.id)
        .maybeSingle(),
    ])
    banking = settings?.banking ?? null
    contactPhone = settings?.contact_phone ?? null
    proof = {
      uploaded: !!job?.deposit_proof_url,
      confirmed: !!job?.deposit_confirmed_at,
      rejected: !!job?.deposit_proof_rejected_at,
      rejectedReason: job?.deposit_proof_rejected_reason ?? null,
    }
  }

  const expiryFormatted = quote.expiry_date
    ? new Date(quote.expiry_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <PublicShell quoteNumber={quote.quote_number}>
      {/* Greeting + summary */}
      <div>
        <h1 className="text-xl font-bold text-primary">
          Solar quote for {quote.customer_name}
        </h1>
        {quote.address && <p className="text-sm text-muted-foreground mt-0.5">{quote.address}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-lg font-bold text-primary mt-1">{formatCents(quote.total_amount)}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Deposit</p>
          <p className="text-lg font-bold text-primary mt-1">{formatCents(quote.deposit_amount)}</p>
        </div>
      </div>

      {/* Status banners */}
      {state === 'accepted' && (
        <div className="rounded-lg border border-green-300 dark:border-green-800/60 bg-green-50 dark:bg-green-950/40 px-4 py-3 text-sm text-green-800 dark:text-green-300">
          <strong>Quote accepted</strong>
          {quote.accepted_at && (
            <> on {new Date(quote.accepted_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</>
          )}
          {quote.acceptance_name && <> by {quote.acceptance_name}</>}
          . Next step: pay the deposit below to secure your equipment and installation date.
        </div>
      )}
      {state === 'declined' && (
        <div className="rounded-lg border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          This quote was declined. Changed your mind, or want an adjusted version? Ask us for an
          updated quote below — no obligation.
        </div>
      )}
      {expired && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          This quote expired on <strong>{expiryFormatted}</strong>. Equipment prices change over
          time — ask us for an updated one below and we&apos;ll refresh it for you.
        </div>
      )}
      {isOpen && expiryFormatted && (
        <p className="text-xs text-muted-foreground">
          Valid until <strong className="text-foreground">{expiryFormatted}</strong>.
        </p>
      )}

      {/* Accept / decline / deposit actions */}
      {(isOpen || state === 'accepted') && (
        <PublicQuoteActions
          token={token}
          state={state === 'accepted' ? 'accepted' : 'open'}
          quoteNumber={quote.quote_number}
          depositCents={quote.deposit_amount}
          tierOptions={isOpen ? tierOptions : null}
          banking={banking}
          proof={proof}
          contactPhone={contactPhone}
        />
      )}

      {/* Expired or declined: the quote below is history — this is the way forward. */}
      {canRequestUpdatedQuote(state) && (
        <Link
          href={`/q/${token}/renew`}
          className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Request an updated quote
        </Link>
      )}

      {/* The quote itself */}
      <div className="flex justify-end">
        <PrintQuoteButton html={quote.quote_html} />
      </div>
      <QuoteFrame html={quote.quote_html} />
    </PublicShell>
  )
}
