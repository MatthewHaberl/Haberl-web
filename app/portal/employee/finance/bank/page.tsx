import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Landmark, Search, Crosshair, X } from 'lucide-react'
import type { Metadata } from 'next'
import { PageShell, PageHeader } from '@/components/layout/page'
import { FinanceTabs } from '@/components/finance/FinanceTabs'
import { BankTxnTable, type BankRow } from './BankTxnTable'
import { BankRulesManager } from './BankRulesManager'
import { COMPANY_CATEGORIES } from '../[id]/DocAllocations'
import { Inbox } from 'lucide-react'

export const metadata: Metadata = { title: 'Finance — Bank Statements' }
export const dynamic = 'force-dynamic'

const PAGE_SIZES = [50, 100, 200, 300]
const DEFAULT_PAGE_SIZE = 300
// When focused on one transaction, default to showing this many days either
// side so surrounding activity (transfers, withdrawals) is visible at a glance.
const FOCUS_WINDOW_DAYS = 14

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface AccountAgg {
  label: string
  n: number
  money_in: number
  money_out: number
  net: number
}

interface Report {
  total_count: number
  money_in: number
  money_out: number
  net: number
  min_date: string | null
  max_date: string | null
  accounts: AccountAgg[]
  all_accounts: string[]
}


type SP = {
  account?: string
  q?: string
  from?: string
  to?: string
  dir?: string
  sort?: string
  page?: string
  per?: string
  focus?: string
  cust?: string
  min?: string
  max?: string
}

// Parse a Rand amount string ("3000", "3 000.50") into integer cents, or null.
function randToCents(v: string): number | null {
  const n = parseFloat(v.replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function buildHref(base: SP, override: Partial<SP>): string {
  const merged = { ...base, ...override }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== 'all' && !(k === 'sort' && v === 'asc')
      && !(k === 'per' && v === String(DEFAULT_PAGE_SIZE)) && k !== 'page') params.set(k, v)
  }
  // page handled explicitly when needed
  if (override.page && override.page !== '0') params.set('page', override.page)
  const qs = params.toString()
  return `/portal/employee/finance/bank${qs ? `?${qs}` : ''}`
}

export default async function BankStatementsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const account = sp.account ?? 'all'
  const q = sp.q ?? ''
  const dir = sp.dir ?? 'all'
  const sort = sp.sort === 'desc' ? 'desc' : 'asc'
  const page = Math.max(0, parseInt(sp.page ?? '0', 10) || 0)
  const per = PAGE_SIZES.includes(Number(sp.per)) ? Number(sp.per) : DEFAULT_PAGE_SIZE
  const focusId = sp.focus || ''
  const cust = sp.cust ?? 'all'           // 'all' | 'none' | <customer uuid>
  const minStr = sp.min ?? ''
  const maxStr = sp.max ?? ''
  const minCents = minStr ? randToCents(minStr) : null
  const maxCents = maxStr ? randToCents(maxStr) : null

  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  // Focus mode: deep-linked from a statement payment/charge. Look up the
  // transaction so we can centre the date window on it and label the banner.
  type FocusTxn = { id: string; txn_date: string; account_label: string | null; description: string | null; amount_cents: number }
  let focusTxn: FocusTxn | null = null
  if (focusId) {
    const { data } = await supabase
      .from('bank_transactions')
      .select('id, txn_date, account_label, description, amount_cents')
      .eq('id', focusId)
      .maybeSingle()
    focusTxn = (data as FocusTxn | null) ?? null
  }

  // Date window. `urlFrom/urlTo` are exactly what the user chose (drive the
  // shareable URL); `from/to` are what we actually query. In focus mode with no
  // explicit dates, auto-window ±FOCUS_WINDOW_DAYS around the focused txn so
  // surrounding activity (transfers, withdrawals) shows.
  const urlFrom = sp.from ?? ''
  const urlTo = sp.to ?? ''
  const autoWindow = focusTxn !== null && !urlFrom && !urlTo
  const from = autoWindow ? shiftDate(focusTxn!.txn_date, -FOCUS_WINDOW_DAYS) : urlFrom
  const to = autoWindow ? shiftDate(focusTxn!.txn_date, FOCUS_WINDOW_DAYS) : urlTo

  // Headline + per-account aggregates for the current filter (one round-trip).
  const { data: reportRaw } = await supabase.rpc('bank_txn_report', {
    p_account: account,
    p_q: q || null,
    p_from: from || null,
    p_to: to || null,
    p_dir: dir,
    p_customer: cust,
    p_min: minCents,
    p_max: maxCents,
  })
  const report = (reportRaw ?? {
    total_count: 0, money_in: 0, money_out: 0, net: 0, min_date: null, max_date: null, accounts: [], all_accounts: [],
  }) as Report

  // Paginated row listing for the table, plus the customer list for the picker.
  let rowQuery = supabase
    .from('bank_transactions')
    .select('id, account_label, txn_date, description, amount_cents, txn_type, allocated_customer_id, matched_document_id, allocated:customers!allocated_customer_id(id, full_name), matched:fin_documents!matched_document_id(id, supplier_name)')
    .order('txn_date', { ascending: sort === 'asc' })
    .order('id', { ascending: true })
    .range(page * per, page * per + per - 1)

  if (account !== 'all') rowQuery = rowQuery.eq('account_label', account)
  if (q) rowQuery = rowQuery.ilike('description', `%${q}%`)
  if (from) rowQuery = rowQuery.gte('txn_date', from)
  if (to) rowQuery = rowQuery.lte('txn_date', to)
  if (dir === 'in') rowQuery = rowQuery.gt('amount_cents', 0)
  if (dir === 'out') rowQuery = rowQuery.lt('amount_cents', 0)
  if (cust === 'none') rowQuery = rowQuery.is('allocated_customer_id', null)
  else if (cust !== 'all') rowQuery = rowQuery.eq('allocated_customer_id', cust)
  // Amount window is sign-agnostic: |amount| in [lo, hi]  ==  amount in [lo,hi] OR [-hi,-lo].
  if (minCents !== null || maxCents !== null) {
    const lo = minCents ?? 0
    const hi = maxCents ?? Number.MAX_SAFE_INTEGER
    rowQuery = rowQuery.or(
      `and(amount_cents.gte.${lo},amount_cents.lte.${hi}),and(amount_cents.gte.${-hi},amount_cents.lte.${-lo})`
    )
  }

  const [{ data: rowsRaw }, { data: customersRaw }] = await Promise.all([
    rowQuery,
    supabase.from('customers').select('id, full_name').order('full_name'),
  ])

  type RawRow = {
    id: string; account_label: string | null; txn_date: string; description: string
    amount_cents: number; txn_type: string; allocated_customer_id: string | null
    matched_document_id: string | null
    allocated?: { id: string; full_name: string } | { id: string; full_name: string }[] | null
    matched?: { id: string; supplier_name: string | null } | { id: string; supplier_name: string | null }[] | null
  }
  const baseRows = ((rowsRaw ?? []) as unknown as RawRow[])

  // Split / company allocations for the visible transactions (one round-trip).
  type SplitRaw = {
    txn_id: string; target: 'customer' | 'company'; customer_id: string | null
    category: string | null; amount_cents: number
    allocated?: { full_name: string } | { full_name: string }[] | null
  }
  const splitMap = new Map<string, { target: 'customer' | 'company'; name: string | null; amount_cents: number }[]>()
  if (baseRows.length > 0) {
    const { data: splitsRaw } = await supabase
      .from('bank_txn_allocations')
      .select('txn_id, target, customer_id, category, amount_cents, allocated:customers!customer_id(full_name)')
      .in('txn_id', baseRows.map((r) => r.id))
    for (const s of (splitsRaw ?? []) as unknown as SplitRaw[]) {
      const a = Array.isArray(s.allocated) ? s.allocated[0] : s.allocated
      const name = s.target === 'company' ? (s.category ?? 'Company') : (a?.full_name ?? 'Customer')
      const list = splitMap.get(s.txn_id) ?? []
      list.push({ target: s.target, name, amount_cents: s.amount_cents })
      splitMap.set(s.txn_id, list)
    }
  }

  // For transactions matched to an invoice, the customer assignment lives on
  // the invoice (its fin_allocations) — the bank txn's own allocation is
  // suppressed on statements (migration 072). Surface that "via invoice"
  // assignment here so a matched payment doesn't look unassigned.
  const matchedDocIds = [...new Set(baseRows.map((r) => r.matched_document_id).filter(Boolean) as string[])]
  const matchedCustMap = new Map<string, string[]>()
  if (matchedDocIds.length > 0) {
    type AllocRaw = { document_id: string; customer?: { full_name: string } | { full_name: string }[] | null }
    const { data: allocRaw } = await supabase
      .from('fin_allocations')
      .select('document_id, customer:customers(full_name)')
      .eq('target', 'customer')
      .in('document_id', matchedDocIds)
    for (const al of (allocRaw ?? []) as unknown as AllocRaw[]) {
      const c = Array.isArray(al.customer) ? al.customer[0] : al.customer
      if (!c?.full_name) continue
      const list = matchedCustMap.get(al.document_id) ?? []
      if (!list.includes(c.full_name)) list.push(c.full_name)
      matchedCustMap.set(al.document_id, list)
    }
  }

  const rows: BankRow[] = baseRows.map((r) => {
    const a = Array.isArray(r.allocated) ? r.allocated[0] : r.allocated
    const m = Array.isArray(r.matched) ? r.matched[0] : r.matched
    return {
      id: r.id, account_label: r.account_label, txn_date: r.txn_date, description: r.description,
      amount_cents: r.amount_cents, txn_type: r.txn_type, allocated_customer_id: r.allocated_customer_id,
      allocated_name: a?.full_name ?? null,
      matched_document_id: r.matched_document_id,
      matched_supplier_name: m?.supplier_name ?? null,
      matched_customer_names: r.matched_document_id ? (matchedCustMap.get(r.matched_document_id) ?? []) : [],
      splits: splitMap.get(r.id) ?? [],
    }
  })
  const customers = (customersRaw ?? []) as { id: string; full_name: string }[]

  const base: SP = { account, q, from: urlFrom, to: urlTo, dir, sort, focus: focusId, cust, min: minStr, max: maxStr, per: String(per) }

  // Card list: an "All accounts" pseudo-card + one per account (alphabetical).
  const allCard: AccountAgg = {
    label: 'All accounts',
    n: report.accounts.reduce((s, a) => s + a.n, 0),
    money_in: report.accounts.reduce((s, a) => s + a.money_in, 0),
    money_out: report.accounts.reduce((s, a) => s + a.money_out, 0),
    net: report.accounts.reduce((s, a) => s + a.net, 0),
  }

  return (
    <PageShell width="wide">
      <PageHeader
        icon={Landmark}
        title="Finance — Bank Statements"
        description="All imported FNB transactions across every account. Filter by account, search, or date to cross-reference against invoices."
      />

      <FinanceTabs />

      {/* Quick actions: billing backlog + auto-rules */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildHref({}, { cust: 'none', dir: 'in', sort: 'desc' })}
          className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
            cust === 'none' && dir === 'in'
              ? 'border-accent bg-accent/5 text-primary'
              : 'border-border hover:bg-muted'
          }`}
        >
          <Inbox className="h-4 w-4" /> Billing inbox
          <span className="text-xs font-normal text-muted-foreground">unallocated money in</span>
        </Link>
        <BankRulesManager customers={customers} categories={COMPANY_CATEGORIES} />
      </div>

      {/* Focus banner — shown when deep-linked from a statement transaction */}
      {focusTxn && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-accent bg-accent/5 px-4 py-3 text-sm">
          <Crosshair className="h-4 w-4 shrink-0 text-accent" />
          <span>
            Centred on{' '}
            <span className={`font-semibold tabular-nums ${focusTxn.amount_cents < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(focusTxn.amount_cents)}
            </span>{' '}
            on <span className="font-medium">{formatDate(focusTxn.txn_date)}</span>
            {focusTxn.description ? <span className="text-muted-foreground"> · {focusTxn.description}</span> : null}
          </span>
          {autoWindow && (
            <span className="text-muted-foreground">
              Showing all accounts ±{FOCUS_WINDOW_DAYS} days — adjust the dates below to widen the window.
            </span>
          )}
          <Link
            href={buildHref({ account, q, from: urlFrom, to: urlTo, dir, sort }, {})}
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" /> Clear focus
          </Link>
        </div>
      )}

      {/* Account cards — click to view one account or all together */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[allCard, ...report.accounts].map((a) => {
          const key = a.label === 'All accounts' ? 'all' : a.label
          const active = account === key
          return (
            <Link
              key={key}
              href={buildHref(base, { account: key })}
              className={`rounded-lg border p-3 transition-colors ${
                active ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
              }`}
            >
              <div className="truncate text-xs font-medium text-muted-foreground" title={a.label}>
                {a.label}
              </div>
              <div className={`mt-1 text-lg font-bold ${a.net < 0 ? 'text-red-600' : 'text-primary'}`}>
                {formatCurrency(a.net)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{a.n.toLocaleString()} txns</div>
            </Link>
          )
        })}
      </div>

      {/* Filter bar (GET form — no client JS needed) */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="sort" value={sort} />
            {focusId && <input type="hidden" name="focus" value={focusId} />}
            {per !== DEFAULT_PAGE_SIZE && <input type="hidden" name="per" value={String(per)} />}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Account</label>
              <select name="account" defaultValue={account}
                className="h-10 w-44 rounded-md border border-border bg-background px-3 text-sm">
                <option value="all">All accounts</option>
                {report.all_accounts.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Search description</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text" name="q" defaultValue={q} placeholder="e.g. Key Electric, Damien, fuel…"
                  className="h-10 w-64 rounded-md border border-border bg-background pl-8 pr-3 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <input type="date" name="from" defaultValue={from}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input type="date" name="to" defaultValue={to}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Direction</label>
              <select name="dir" defaultValue={dir}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option value="all">All</option>
                <option value="in">Money in</option>
                <option value="out">Money out</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              <select name="cust" defaultValue={cust}
                className="h-10 w-48 rounded-md border border-border bg-background px-3 text-sm">
                <option value="all">All</option>
                <option value="none">Unallocated</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Amount R (min)</label>
              <input type="number" inputMode="decimal" step="0.01" min="0" name="min" defaultValue={minStr} placeholder="0"
                className="h-10 w-28 rounded-md border border-border bg-background px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Amount R (max)</label>
              <input type="number" inputMode="decimal" step="0.01" min="0" name="max" defaultValue={maxStr} placeholder="∞"
                className="h-10 w-28 rounded-md border border-border bg-background px-3 text-sm" />
            </div>
            <button type="submit"
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              Apply
            </button>
            <Link href={buildHref({ account }, {})}
              className="h-10 rounded-md border border-border px-4 text-sm font-medium leading-10 text-muted-foreground hover:text-foreground">
              Reset
            </Link>
          </form>
        </CardContent>
      </Card>

      {/* Headline totals for the current filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Transactions" value={report.total_count.toLocaleString()} />
        <SummaryStat label="Money in" value={formatCurrency(report.money_in)} tone="in" />
        <SummaryStat label="Money out" value={formatCurrency(report.money_out)} tone="out" />
        <SummaryStat label="Net" value={formatCurrency(report.net)} tone={report.net < 0 ? 'out' : 'in'} />
      </div>

      {/* Transactions table with selection + allocation */}
      <Card>
        <CardContent className="p-3">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No transactions match this filter.
            </p>
          ) : (
            <BankTxnTable
              rows={rows}
              customers={customers}
              categories={COMPANY_CATEGORIES}
              showAccount={account === 'all'}
              sort={sort}
              sortHref={buildHref(base, { sort: sort === 'asc' ? 'desc' : 'asc' })}
              focusId={focusId || null}
            />
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <Pagination
        page={page}
        pageSize={per}
        total={report.total_count}
        sizeOptions={PAGE_SIZES}
        makeHref={({ page: p, per: pr }) => {
          const ov: Partial<SP> = {}
          if (p != null) ov.page = String(p)
          if (pr != null) ov.per = String(pr)
          return buildHref(base, ov)
        }}
      />
    </PageShell>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'in' | 'out' }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${
        tone === 'in' ? 'text-green-600' : tone === 'out' ? 'text-red-600' : 'text-primary'
      }`}>
        {value}
      </div>
    </div>
  )
}
