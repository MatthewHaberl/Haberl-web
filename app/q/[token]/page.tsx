import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCents, isQuoteExpired, isValidShareToken, parseTierOptions } from '@/lib/quotes/public'
import { QuoteFrame } from './QuoteFrame'
import { PublicQuoteActions } from './PublicQuoteActions'

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

  if (!quote || !quote.quote_html || !VIEWABLE.includes(quote.status)) notFound()

  // First-open tracking
  if (!quote.viewed_at) {
    await supabase
      .from('quote_requests')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', quote.id)
  }

  const isOpen = quote.status === 'sent' || quote.status === 'generated'
  const expired = isOpen && isQuoteExpired(quote)
  const tierOptions = parseTierOptions(quote)

  // Accepted state: banking details for EFT + deposit/proof progress
  let banking = null
  let contactPhone: string | null = null
  let proof: { uploaded: boolean; confirmed: boolean } | null = null
  if (quote.status === 'accepted') {
    const [{ data: settings }, { data: job }] = await Promise.all([
      supabase.from('company_settings').select('banking, contact_phone').eq('id', true).maybeSingle(),
      supabase
        .from('jobs')
        .select('deposit_proof_url, deposit_confirmed_at')
        .eq('quote_request_id', quote.id)
        .maybeSingle(),
    ])
    banking = settings?.banking ?? null
    contactPhone = settings?.contact_phone ?? null
    proof = {
      uploaded: !!job?.deposit_proof_url,
      confirmed: !!job?.deposit_confirmed_at,
    }
  }

  const expiryFormatted = quote.expiry_date
    ? new Date(quote.expiry_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Brand header */}
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <span className="text-lg font-bold">
            Haberl <span className="text-[#f97316]">Solar</span>
          </span>
          {quote.quote_number && (
            <span className="text-sm font-mono opacity-90">{quote.quote_number}</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-5">
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
        {quote.status === 'accepted' && (
          <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            <strong>Quote accepted</strong>
            {quote.accepted_at && (
              <> on {new Date(quote.accepted_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</>
            )}
            {quote.acceptance_name && <> by {quote.acceptance_name}</>}
            . Next step: pay the deposit below to secure your equipment and installation date.
          </div>
        )}
        {quote.status === 'declined' && (
          <div className="rounded-lg border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
            This quote was declined. Changed your mind, or want an adjusted version? Reply to the
            quote email or call us — we&apos;ll gladly revise it.
          </div>
        )}
        {expired && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This quote expired on <strong>{expiryFormatted}</strong>. Equipment prices change over
            time — contact us and we&apos;ll refresh it for you.
          </div>
        )}
        {isOpen && !expired && expiryFormatted && (
          <p className="text-xs text-muted-foreground">
            Valid until <strong className="text-foreground">{expiryFormatted}</strong>.
          </p>
        )}

        {/* Accept / decline / deposit actions */}
        {((isOpen && !expired) || quote.status === 'accepted') && (
          <PublicQuoteActions
            token={token}
            state={quote.status === 'accepted' ? 'accepted' : 'open'}
            quoteNumber={quote.quote_number}
            depositCents={quote.deposit_amount}
            tierOptions={isOpen ? tierOptions : null}
            banking={banking}
            proof={proof}
            contactPhone={contactPhone}
          />
        )}

        {/* The quote itself */}
        <QuoteFrame html={quote.quote_html} />

        <footer className="pb-8 pt-2 text-center text-xs text-muted-foreground">
          Haberl Electrical &amp; Solar · SANS 10142 Compliant · info@haberl.co.za
        </footer>
      </main>
    </div>
  )
}
