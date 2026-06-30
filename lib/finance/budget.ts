// Shared types + helpers for the Finance → Budget section.
// Mirrors migration 083_budget.sql. The Supabase client in this app is untyped,
// so these describe the rows we read/write and back the UI.

export type BudgetScope = 'business' | 'personal'
export type BudgetKind = 'expense' | 'income'
export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'once'

export const BUDGET_SCOPES: { value: BudgetScope; label: string }[] = [
  { value: 'business', label: 'Business' },
  { value: 'personal', label: 'Personal' },
]

export const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'once', label: 'One-off' },
]

export const CADENCE_LABEL = Object.fromEntries(
  CADENCES.map((c) => [c.value, c.label]),
) as Record<Cadence, string>

export interface BudgetCategory {
  id: string
  scope: BudgetScope
  kind: BudgetKind
  name: string
  match_keys: string[]
  sort_order: number
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface BudgetPlan {
  id: string
  category_id: string
  month: string
  planned_cents: number
  note: string | null
}

export interface BudgetCommitment {
  id: string
  scope: BudgetScope
  category_id: string | null
  name: string
  amount_cents: number
  cadence: Cadence
  due_day: number | null
  next_due: string | null
  active: boolean
  note: string | null
}

export interface BudgetGoal {
  id: string
  scope: BudgetScope
  name: string
  target_cents: number
  saved_cents: number
  target_date: string | null
  note: string | null
  achieved_at: string | null
}

export interface BudgetManualActual {
  id: string
  category_id: string
  month: string
  amount_cents: number
  note: string | null
}

// RPC row shapes
export interface ActualRow { month: string; category: string; spent_cents: number }
export interface CashflowRow { month: string; money_in: number; money_out: number; net: number }
export interface BalanceRow { account_label: string; as_of: string; balance_cents: number }

/** Normalise any date to the first day of its month as 'YYYY-MM-01'. */
export function monthStart(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(`${d.slice(0, 10)}T00:00:00`) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

/** Shift a 'YYYY-MM-01' month string by N months (negative = back). */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return monthStart(d)
}

/** Human label for a month string, e.g. 'June 2026'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}

/** Parse a free-typed Rand amount ("1 500.50", "R1500") into integer cents, or null. */
export function randToCents(v: string): number | null {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** A commitment's cost expressed per month, so different cadences can be summed. */
export function monthlyEquivalentCents(amount_cents: number, cadence: Cadence): number {
  switch (cadence) {
    case 'weekly': return Math.round((amount_cents * 52) / 12)
    case 'monthly': return amount_cents
    case 'quarterly': return Math.round(amount_cents / 3)
    case 'annual': return Math.round(amount_cents / 12)
    case 'once': return 0 // not a recurring monthly load
  }
}
