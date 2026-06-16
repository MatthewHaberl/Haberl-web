// Currency + VAT helpers for the Key Electric demo storefront.
// All prices are stored in cents (ZAR minor unit), matching the live store's API.

export const VAT_RATE = 0.15

/** Format a cents value as a ZAR currency string, e.g. 57300 -> "R 573.00". */
export function formatZAR(cents: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/** Add 15% VAT to an ex-VAT cents amount. */
export function inclVat(cents: number): number {
  return Math.round(cents * (1 + VAT_RATE))
}
