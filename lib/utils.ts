import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * HTML-escape a value for safe interpolation into email/HTML templates. Use at
 * every point where user-controlled text (customer names, typed reasons, notes)
 * is placed into HTML that a browser or email client will render.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Parse a South-African money string the user typed (e.g. "1 500,50" or
 * "R1.500,50") into a number. en-ZA uses a COMMA decimal and space/dot group
 * separators; a naive `[^0-9.]` strip drops the comma and inflates the value
 * 100x. Returns NaN for unparseable input.
 */
export function parseZarAmount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (value == null) return NaN
  const cleaned = String(value)
    .replace(/[\s]/g, '') // group spaces (JS \s also matches NBSP / narrow NBSP)
    .replace(/r/gi, '')               // currency symbol
  // Whichever of ',' or '.' appears LAST is the decimal separator; the other is
  // a thousands separator and is removed.
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized: string
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = cleaned.replace(/,/g, '')
  }
  const digits = normalized.replace(/[^0-9.-]/g, '')
  if (!/[0-9]/.test(digits)) return NaN // blank / no numeric content
  return Number(digits)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}
