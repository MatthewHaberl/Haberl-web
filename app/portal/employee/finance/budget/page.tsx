import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { FinanceTabs } from '@/components/finance/FinanceTabs'
import { Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import {
  monthStart, shiftMonth, monthLabel,
  type BudgetCategory, type BudgetPlan, type BudgetCommitment, type BudgetGoal,
  type BudgetManualActual, type ActualRow, type CashflowRow, type BalanceRow,
} from '@/lib/finance/budget'
import { COMPANY_CATEGORIES } from '../[id]/DocAllocations'
import { PlanVsActual, type PlanRow } from './PlanVsActual'
import { CashFlowPanel } from './CashFlowPanel'
import { CommitmentsPanel } from './CommitmentsPanel'
import { GoalsPanel } from './GoalsPanel'

export const metadata: Metadata = { title: 'Finance — Budget' }
export const dynamic = 'force-dynamic'

type View = 'plan' | 'cashflow' | 'commitments' | 'goals'
type SP = { view?: string; month?: string }

const VIEWS: { key: View; label: string }[] = [
  { key: 'plan', label: 'Plan vs Actual' },
  { key: 'cashflow', label: 'Cash flow & runway' },
  { key: 'commitments', label: 'Commitments' },
  { key: 'goals', label: 'Goals' },
]

/** Last calendar day of the month a 'YYYY-MM-01' string belongs to, as
 *  'YYYY-MM-DD'. Built from local date parts (NOT toISOString, which would
 *  shift to UTC and drop the last day in a +HH timezone like SAST). */
function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 0) // day 0 of month m+1 (1-based) = last day of month m
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function BudgetPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSection('finance')
  const sp = await searchParams
  const view: View = (VIEWS.find((v) => v.key === sp.view)?.key ?? 'plan')
  const month = sp.month ? monthStart(sp.month) : monthStart(new Date())

  const supabase = await createClient()

  // Categories drive every view; load once.
  const { data: catsRaw } = await supabase
    .from('budget_categories').select('*').is('archived_at', null)
    .order('scope').order('sort_order').order('name')
  const categories = (catsRaw ?? []) as unknown as BudgetCategory[]

  // ── Plan vs Actual ──────────────────────────────────────────
  let planRows: PlanRow[] = []
  let unbudgeted: { category: string; spent_cents: number }[] = []
  if (view === 'plan') {
    const [{ data: plansRaw }, { data: prevPlansRaw }, { data: actualsRaw }, { data: manualRaw }] = await Promise.all([
      supabase.from('budget_plans').select('*').eq('month', month),
      supabase.from('budget_plans').select('category_id, planned_cents').eq('month', shiftMonth(month, -1)),
      supabase.rpc('budget_actuals', { p_from: month, p_to: monthEnd(month) }),
      supabase.from('budget_manual_actuals').select('*').eq('month', month),
    ])
    const plans = (plansRaw ?? []) as unknown as BudgetPlan[]
    const prevPlanByCat = new Map(((prevPlansRaw ?? []) as { category_id: string; planned_cents: number }[])
      .map((p) => [p.category_id, p.planned_cents]))
    const actuals = (actualsRaw ?? []) as unknown as ActualRow[]
    const manual = (manualRaw ?? []) as unknown as BudgetManualActual[]

    const planByCat = new Map(plans.map((p) => [p.category_id, p]))
    const manualByCat = new Map<string, number>()
    const manualListByCat = new Map<string, BudgetManualActual[]>()
    for (const m of manual) {
      manualByCat.set(m.category_id, (manualByCat.get(m.category_id) ?? 0) + m.amount_cents)
      const list = manualListByCat.get(m.category_id) ?? []
      list.push(m); manualListByCat.set(m.category_id, list)
    }
    // Bank actuals are keyed by the company-tag string; map each to a category
    // via match_keys. Track which tag strings get claimed so leftovers surface.
    const claimed = new Set<string>()
    const bankByCat = new Map<string, number>()
    for (const cat of categories) {
      let sum = 0
      for (const a of actuals) {
        if (cat.match_keys.includes(a.category)) { sum += a.spent_cents; claimed.add(a.category) }
      }
      if (sum) bankByCat.set(cat.id, sum)
    }
    unbudgeted = actuals
      .filter((a) => !claimed.has(a.category))
      .map((a) => ({ category: a.category, spent_cents: a.spent_cents }))
      .sort((x, y) => y.spent_cents - x.spent_cents)

    planRows = categories.map((cat) => {
      const bank = bankByCat.get(cat.id) ?? 0
      const man = manualByCat.get(cat.id) ?? 0
      const p = planByCat.get(cat.id)
      return {
        category_id: cat.id,
        name: cat.name,
        scope: cat.scope,
        kind: cat.kind,
        match_keys: cat.match_keys,
        planned_cents: p?.planned_cents ?? 0,
        prev_planned_cents: prevPlanByCat.get(cat.id) ?? 0,
        bank_cents: bank,
        manual_cents: man,
        manual_entries: (manualListByCat.get(cat.id) ?? []).map((m) => ({ id: m.id, amount_cents: m.amount_cents, note: m.note })),
      }
    })
  }

  // ── Cash flow & runway ──────────────────────────────────────
  let cashflow: CashflowRow[] = []
  let balances: BalanceRow[] = []
  if (view === 'cashflow') {
    const [{ data: cf }, { data: bal }] = await Promise.all([
      supabase.rpc('budget_cashflow', { p_months: 12 }),
      supabase.rpc('budget_balances'),
    ])
    cashflow = (cf ?? []) as unknown as CashflowRow[]
    balances = (bal ?? []) as unknown as BalanceRow[]
  }

  // ── Commitments ─────────────────────────────────────────────
  let commitments: BudgetCommitment[] = []
  if (view === 'commitments') {
    const { data } = await supabase.from('budget_commitments').select('*')
      .order('active', { ascending: false }).order('scope').order('name')
    commitments = (data ?? []) as unknown as BudgetCommitment[]
  }

  // ── Goals ───────────────────────────────────────────────────
  let goals: BudgetGoal[] = []
  if (view === 'goals') {
    const { data } = await supabase.from('budget_goals').select('*')
      .order('achieved_at', { nullsFirst: true }).order('created_at')
    goals = (data ?? []) as unknown as BudgetGoal[]
  }

  const subHref = (v: View) => `/portal/employee/finance/budget?view=${v}${v === 'plan' ? `&month=${month}` : ''}`

  return (
    <PageShell width="wide">
      <PageHeader
        icon={Wallet}
        title="Finance — Budget"
        description="Plan spending against the money that actually leaves your accounts, track cash flow and runway, keep recurring costs in view, and save toward goals."
      />

      <FinanceTabs />

      {/* sub-view nav */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {VIEWS.map((v) => (
          <Link key={v.key} href={subHref(v.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              view === v.key ? 'border-accent text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {v.label}
          </Link>
        ))}
      </div>

      {view === 'plan' && (
        <PlanVsActual
          month={month}
          prevMonth={shiftMonth(month, -1)}
          nextMonth={shiftMonth(month, 1)}
          monthLabel={monthLabel(month)}
          rows={planRows}
          unbudgeted={unbudgeted}
          companyTags={COMPANY_CATEGORIES}
        />
      )}
      {view === 'cashflow' && <CashFlowPanel cashflow={cashflow} balances={balances} />}
      {view === 'commitments' && (
        <CommitmentsPanel commitments={commitments} categories={categories} />
      )}
      {view === 'goals' && <GoalsPanel goals={goals} />}
    </PageShell>
  )
}
