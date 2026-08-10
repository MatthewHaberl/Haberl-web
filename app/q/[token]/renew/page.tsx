import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidShareToken, publicQuoteState } from '@/lib/quotes/public'
import { PublicShell } from '../PublicShell'
import { RenewRequestForm } from './RenewRequestForm'

export const metadata: Metadata = {
  title: 'Request an updated quote',
  robots: { index: false, follow: false },
}

/**
 * Where an old quote link leads instead of a dead end. Works for any quote we
 * closed (archived/deleted), let expire, or that the customer declined — their
 * details are already on file, so asking for fresh pricing is one tap.
 */
export default async function RenewQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isValidShareToken(token)) notFound()

  const supabase = createAdminClient()
  const { data: quote } = await supabase
    .from('quote_requests')
    .select('quote_number, customer_name, customer_phone, customer_email, address, status, expiry_date, archived_at, deleted_at, created_at')
    .eq('share_token', token)
    .maybeSingle()

  if (!quote) notFound()

  // A quote that's still live (or already accepted) doesn't need renewing —
  // send them back to the real thing.
  const state = publicQuoteState(quote)
  if (state === 'open' || state === 'accepted') redirect(`/q/${token}`)

  const quotedOn = quote.created_at
    ? new Date(quote.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <PublicShell quoteNumber={quote.quote_number}>
      <div>
        <h1 className="text-xl font-bold text-primary">Request an updated quote</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {quote.quote_number ? <>Your previous quote <strong>{quote.quote_number}</strong></> : 'Your previous quote'}
          {quotedOn ? <> from {quotedOn}</> : null}{' '}
          is no longer current. Confirm your details and we&apos;ll put together fresh pricing on
          today&apos;s equipment costs.
        </p>
      </div>

      <RenewRequestForm
        token={token}
        defaultName={quote.customer_name ?? ''}
        defaultPhone={quote.customer_phone ?? ''}
        defaultEmail={quote.customer_email ?? ''}
        defaultAddress={quote.address ?? ''}
      />
    </PublicShell>
  )
}
