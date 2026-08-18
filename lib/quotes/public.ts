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

/**
 * One work package a customer can accept on its own, off a combined quote.
 *
 * `totalCents` is the STANDALONE price — higher than the same work inside the
 * bundle, because taking it alone means its own site visit and its own
 * certificate. `bundleSavingCents` is what the whole job saves against buying
 * every package this way, and it is the number the disclaimer quotes.
 */
export interface PublicPackageOption {
  id: string
  label: string
  totalCents: number
  depositCents: number | null
}

export interface PublicPackageChoice {
  packages: PublicPackageOption[]
  /** Price for taking everything — the quote total. */
  bundleTotalCents: number
  bundleDepositCents: number | null
  /** Every package bought separately. */
  separateTotalCents: number
  /** separate − bundle. Only ever positive; zero means nothing to advertise. */
  bundleSavingCents: number
}

/**
 * Combined quotes: the packages the customer may accept individually, plus the
 * bundled figures to weigh them against. Returns null for an ordinary quote —
 * including a combined one with a single package, where there is no choice to
 * make.
 *
 * Also null when the quote is all-or-nothing (`allow_partial_acceptance` off,
 * migration 124). The switch is enforced HERE, in the one function the accept
 * page and the accept route both call, rather than in each of them: a partial
 * acceptance the page never offers must also be one the API refuses, and the
 * only way to guarantee that is for both to be asking the same question.
 */
export function parsePackageChoice(quote: {
  generated_quote?: string | null
  allow_partial_acceptance?: boolean | null
}): PublicPackageChoice | null {
  if (quote.allow_partial_acceptance === false) return null
  if (!quote.generated_quote) return null
  try {
    const data = JSON.parse(quote.generated_quote)
    if (data?.type !== 'scope' || !Array.isArray(data.packages) || data.packages.length < 2) {
      return null
    }
    const rands = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : null)

    const packages: PublicPackageOption[] = []
    for (const p of data.packages) {
      const id = typeof p?.id === 'string' ? p.id : ''
      const total = rands(p?.ownTotalRands)
      // A package with no id can't be accepted (nothing to record), and one
      // with no price can't be sold. Either way it is not an option.
      if (!id || total === null || total <= 0) continue
      packages.push({
        id,
        label: String(p?.name ?? 'Package'),
        totalCents: total,
        depositCents: rands(p?.depositTotalRands),
      })
    }
    if (packages.length < 2) return null

    const bundleTotalCents = rands(data.quoteTotalRands) ?? 0
    const separateTotalCents = rands(data.separateTotalRands)
      ?? packages.reduce((t, p) => t + p.totalCents, 0)

    return {
      packages,
      bundleTotalCents,
      bundleDepositCents: rands(data.depositTotalRands),
      separateTotalCents,
      bundleSavingCents: Math.max(0, separateTotalCents - bundleTotalCents),
    }
  } catch {
    return null
  }
}

/** How an accepted single package is recorded in quote_requests.accepted_tier. */
export const PACKAGE_TIER_PREFIX = 'pkg:'

export function packageTierValue(packageId: string): string {
  return `${PACKAGE_TIER_PREFIX}${packageId}`
}

/** The package id behind an accepted_tier, or null when everything was taken. */
export function packageIdFromTier(tier: string | null | undefined): string | null {
  if (typeof tier !== 'string' || !tier.startsWith(PACKAGE_TIER_PREFIX)) return null
  const id = tier.slice(PACKAGE_TIER_PREFIX.length)
  return id || null
}

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
