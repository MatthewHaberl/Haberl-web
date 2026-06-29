import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Landmark, ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react'
import type { Metadata } from 'next'
import { PageShell, PageHeader } from '@/components/layout/page'
import { FinanceTabs } from '@/components/finance/FinanceTabs'

export const metadata: Metadata = { title: 'Finance — Bank Statements' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 300

interface BankTxn {
  id: string
  account_label: string | null
  txn_date: string
  description: string
  amount_cents: number
  txn_type: string
  reconciled: boolean
  allocated_customer_id: string | null
  notes: string | null
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
}

const TXN_TYPE_LABEL: Record<string, string> = {
  unallocated: 'Unallocated',
  customer_payment: 'Customer payment',
  supplier_payment: 'Supplier payment',
  company_expense: 'Company expense',
  transfer: 'Transfer',
  other: 'Other',
}

type SP = {
  account?: string
  q?: string
  from?: string
  to?: string
  dir?: string
  sort?: string
  page?: string
}

function buildHref(base: SP, override: Partial<SP>): string {
  const merged = { ...base, ...override }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== 'all' && !(k === 'sort' && v === 'asc') && k !== 'page') params.set(k, v)
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
  const from = sp.from ?? ''
  const to = sp.to ?? ''
  const dir = sp.dir ?? 'all'
  const sort = sp.sort === 'desc' ? 'desc' : 'asc'
  const page = Math.max(0, parseInt(sp.page ?? '0', 10) || 0)

  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  // Headline + per-account aggregates for the current filter (one round-trip).
  const { data: reportRaw } = await supabase.rpc('bank_txn_report', {
    p_account: account,
    p_q: q || null,
    p_from: from || null,
    p_to: to || null,
    p_dir: dir,
  })
  const report = (reportRaw ?? {
    total_count: 0, money_in: 0, money_out: 0, net: 0, min_date: null, max_date: null, accounts: [],
  }) as Report

  // Paginated row listing for the table.
  let rowQuery = supabase
    .from('bank_transactions')
    .select('id, account_label, txn_date, description, amount_cents, txn_type, reconciled, allocated_customer_id, notes')
    .order('txn_date', { ascending: sort === 'asc' })
    .order('id', { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (account !== 'all') rowQuery = rowQuery.eq('account_label', account)
  if (q) rowQuery = rowQuery.ilike('description', `%${q}%`)
  if (from) rowQuery = rowQuery.gte('txn_date', from)
  if (to) rowQuery = rowQuery.lte('txn_date', to)
  if (dir === 'in') rowQuery = rowQuery.gt('amount_cents', 0)
  if (dir === 'out') rowQuery = rowQuery.lt('amount_cents', 0)

  const { data: rowsRaw } = await rowQuery
  const rows = (rowsRaw ?? []) as BankTxn[]

  const base: SP = { account, q, from, to, dir, sort }
  const totalPages = Math.max(1, Math.ceil(report.total_count / PAGE_SIZE))
  const showingFrom = report.total_count === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = Math.min(report.total_count, page * PAGE_SIZE + rows.length)

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
            <input type="hidden" name="account" value={account} />
            <input type="hidden" name="sort" value={sort} />
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

      {/* Transactions table */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No transactions match this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">
                      <Link href={buildHref(base, { sort: sort === 'asc' ? 'desc' : 'asc' })} className="hover:text-foreground">
                        Date {sort === 'asc' ? '↑' : '↓'}
                      </Link>
                    </th>
                    {account === 'all' && <th className="px-4 py-3 font-medium">Account</th>}
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                        {formatDate(t.txn_date)}
                      </td>
                      {account === 'all' && (
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-muted-foreground">{shortAccount(t.account_label)}</span>
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <span className="block max-w-[420px] truncate" title={t.description}>
                          {t.description || <span className="text-muted-foreground">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.txn_type !== 'unallocated' && (
                          <Badge variant="outline">{TXN_TYPE_LABEL[t.txn_type] ?? t.txn_type}</Badge>
                        )}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums ${
                        t.amount_cents < 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        <span className="inline-flex items-center justify-end gap-1">
                          {t.amount_cents < 0
                            ? <ArrowUpRight className="h-3.5 w-3.5" />
                            : <ArrowDownLeft className="h-3.5 w-3.5" />}
                          {formatCurrency(t.amount_cents)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {report.total_count > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of {report.total_count.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            {page > 0 && (
              <Link href={buildHref(base, { page: String(page - 1) })}
                className="rounded-md border border-border px-3 py-1.5 hover:text-foreground">
                ← Prev
              </Link>
            )}
            <span>Page {page + 1} of {totalPages}</span>
            {page + 1 < totalPages && (
              <Link href={buildHref(base, { page: String(page + 1) })}
                className="rounded-md border border-border px-3 py-1.5 hover:text-foreground">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
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

// "FNB Fusion Premier (cheque)" → "Fusion Premier"; keeps the table compact.
function shortAccount(label: string | null): string {
  if (!label) return '—'
  return label.replace(/^FNB\s+/, '').replace(/\s*\(.*\)$/, '')
}
