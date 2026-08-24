// ─────────────────────────────────────────────────────────────────────────────
// Staff paperwork — what the kinds are called, and when one goes stale.
//
// Pure: no Supabase, no React. The upload route, the Documents tab and the
// staff list all read their labels and their expiry wording from here so a
// licence is described the same way everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import type { StaffDocumentType } from '@/types/database'

export interface StaffDocTypeMeta {
  value: StaffDocumentType
  label: string
  /** Shown under the picker — what belongs in this drawer. */
  hint: string
  /** The document carries a number worth capturing (ID, licence, SARS). */
  wantsNumber: boolean
  /** The document lapses, so an expiry date should be filled in. */
  wantsExpiry: boolean
}

/** Display order on the tab: identity first, then trade, then employment. */
export const STAFF_DOC_TYPES: StaffDocTypeMeta[] = [
  {
    value: 'id_document',
    label: 'ID / passport',
    hint: 'SA ID card or book, passport, asylum or work permit.',
    wantsNumber: true,
    wantsExpiry: true,
  },
  {
    value: 'drivers_licence',
    label: "Driver's licence",
    hint: 'Card licence, PrDP. Expires — fill the date in.',
    wantsNumber: true,
    wantsExpiry: true,
  },
  {
    value: 'wireman_licence',
    label: "Wireman's licence",
    hint: 'Installation / master electrician registration and DoL card.',
    wantsNumber: true,
    wantsExpiry: true,
  },
  {
    value: 'qualification',
    label: 'Qualification',
    hint: 'Trade test, N-certificates, course and training certificates.',
    wantsNumber: false,
    wantsExpiry: false,
  },
  {
    value: 'contract',
    label: 'Contract',
    hint: 'Employment contract, letters of appointment, amendments.',
    wantsNumber: false,
    wantsExpiry: false,
  },
  {
    value: 'banking',
    label: 'Banking',
    hint: 'Bank confirmation letter — what wages are paid into.',
    wantsNumber: true,
    wantsExpiry: false,
  },
  {
    value: 'tax',
    label: 'Tax',
    hint: 'SARS registration, IRP5, tax directive.',
    wantsNumber: true,
    wantsExpiry: false,
  },
  {
    value: 'medical',
    label: 'Medical',
    hint: 'Fitness-to-work certificate, working-at-heights medical.',
    wantsNumber: false,
    wantsExpiry: true,
  },
  {
    value: 'safety',
    label: 'Safety & induction',
    hint: 'Site inductions, PPE issue, toolbox-talk sign-offs.',
    wantsNumber: false,
    wantsExpiry: true,
  },
  {
    value: 'disciplinary',
    label: 'Disciplinary',
    hint: 'Warnings and hearing outcomes. Manager and admin only.',
    wantsNumber: false,
    wantsExpiry: false,
  },
  {
    value: 'other',
    label: 'Other',
    hint: 'Anything else worth keeping on the person.',
    wantsNumber: false,
    wantsExpiry: false,
  },
]

export const STAFF_DOC_TYPE_VALUES: StaffDocumentType[] = STAFF_DOC_TYPES.map((t) => t.value)

export const STAFF_DOC_LABEL: Record<StaffDocumentType, string> = STAFF_DOC_TYPES.reduce(
  (acc, t) => {
    acc[t.value] = t.label
    return acc
  },
  {} as Record<StaffDocumentType, string>,
)

export function isStaffDocType(v: string): v is StaffDocumentType {
  return (STAFF_DOC_TYPE_VALUES as string[]).includes(v)
}

/** How close to lapsing a document has to be before the page nags. */
export const EXPIRY_WARN_DAYS = 60

export type ExpiryStatus = 'none' | 'valid' | 'soon' | 'expired'

export interface ExpiryState {
  status: ExpiryStatus
  /** Whole days from today to the expiry date; negative once it has lapsed. */
  days: number
}

/**
 * Where a document sits against its expiry date.
 *
 * Dates are plain 'YYYY-MM-DD' — compared as dates, not timestamps, so a card
 * that expires today reads as expiring today no matter the hour or the
 * timezone the browser happens to be in.
 */
export function expiryState(expiresOn: string | null | undefined, today: string): ExpiryState {
  if (!expiresOn) return { status: 'none', days: 0 }
  const days = daysBetween(today, expiresOn)
  if (days < 0) return { status: 'expired', days }
  if (days <= EXPIRY_WARN_DAYS) return { status: 'soon', days }
  return { status: 'valid', days }
}

/** Whole days from `from` to `to`, both 'YYYY-MM-DD'. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** "expired 12 days ago" / "expires in 30 days" / "expires today". */
export function expiryWording(state: ExpiryState): string {
  if (state.status === 'none') return ''
  if (state.days === 0) return 'expires today'
  if (state.days < 0) {
    const n = Math.abs(state.days)
    return `expired ${n} day${n === 1 ? '' : 's'} ago`
  }
  return `expires in ${state.days} day${state.days === 1 ? '' : 's'}`
}

/** Human file size for the table — bytes are noise at a glance. */
export function fileSizeLabel(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
