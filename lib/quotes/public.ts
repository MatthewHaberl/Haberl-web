/**
 * Pure helpers shared by the public quote page (/q/[token]) and its API
 * routes. No supabase imports — safe for both server and client bundles.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidShareToken(token: string): boolean {
  return UUID_RE.test(token)
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** expiry_date is a plain date — the quote stays valid through that day. */
export function isQuoteExpired(quote: { expiry_date?: string | null }): boolean {
  if (!quote.expiry_date) return false
  return Date.now() > new Date(`${quote.expiry_date}T23:59:59`).getTime()
}

/**
 * What the share link should do right now. One resolver so the page and every
 * public API agree — a quote we have archived or deleted must never be
 * acceptable, no matter which route the customer reaches it through.
 *
 * `accepted` deliberately wins over archive/delete: once a quote is accepted the
 * link is the customer's deposit page for a live job, and closing that mid-
 * installation would strand them.
 */
export type PublicQuoteState = 'open' | 'accepted' | 'declined' | 'expired' | 'closed'

export interface PublicQuoteStateInput {
  status?: string | null
  expiry_date?: string | null
  archived_at?: string | null
  deleted_at?: string | null
}

export function publicQuoteState(quote: PublicQuoteStateInput): PublicQuoteState {
  if (quote.status === 'accepted') return 'accepted'
  if (quote.deleted_at || quote.archived_at) return 'closed'
  if (quote.status === 'declined') return 'declined'
  if (quote.status !== 'generated' && quote.status !== 'sent') return 'closed'
  return isQuoteExpired(quote) ? 'expired' : 'open'
}

/** States where the only sensible next step is asking us for a fresh quote. */
export function canRequestUpdatedQuote(state: PublicQuoteState): boolean {
  return state === 'closed' || state === 'expired' || state === 'declined'
}

/** Why the link no longer accepts — shown to the customer, sent by the APIs. */
export const CLOSED_QUOTE_MESSAGE =
  'This quote is no longer available — request an updated one and we will send you fresh pricing.'

export interface PublicTierOption {
  tier: string
  label: string
  totalCents: number | null
  depositCents: number | null
}

/**
 * Multi-option quotes: one entry per tier with the totals the customer would
 * accept. Deposit per tier = the option's deposit items filtered to the
 * admin-selected deposit_items names (falls back to all the option's items).
 * Returns null for single-option quotes.
 */
export function parseTierOptions(quote: {
  generated_quote?: string | null
  deposit_items?: string[] | null
}): PublicTierOption[] | null {
  if (!quote.generated_quote) return null
  try {
    const data = JSON.parse(quote.generated_quote)
    if (data?.type !== 'multi-option' || !Array.isArray(data.options) || data.options.length === 0) {
      return null
    }
    const selectedNames: string[] = Array.isArray(quote.deposit_items) ? quote.deposit_items : []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.options.map((option: any) => {
      const tier = String(option?.tier ?? '')
      const rawLabel = String(option?.tierLabel ?? tier)
      const items: Array<{ name?: string; amountRands?: number }> =
        Array.isArray(option?.depositItems) ? option.depositItems : []
      const chosen = selectedNames.length
        ? items.filter((item) => item?.name && selectedNames.includes(item.name))
        : items
      const depositRands = (chosen.length ? chosen : items)
        .reduce((sum, item) => sum + (typeof item?.amountRands === 'number' ? item.amountRands : 0), 0)

      return {
        tier,
        label: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
        totalCents: typeof option?.quoteTotalRands === 'number'
          ? Math.round(option.quoteTotalRands * 100)
          : null,
        depositCents: depositRands > 0 ? Math.round(depositRands * 100) : null,
      }
    })
  } catch {
    return null
  }
}
