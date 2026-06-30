import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CalendarClock, Search, ArrowDownLeft, ArrowUpRight, Receipt, Landmark, Crosshair } from 'lucide-react'
import type { Metadata } from 'next'
import { PageShell, PageHeader } from '@/components/layout/page'
import { FinanceTabs } from '@/components/finance/FinanceTabs'
import { FIN_DOC_TYPE_LABEL, type FinDocType } from '@/lib/finance/types'

export const metadata: Metadata = { title: 'Finance — Timeline' }
export const dynamic = 'force-dynamic'

// Per-source row cap. The timeline merges + sorts in memory, so we bound each
// source. With a date window or search the result is well under this; the
// banner warns when a source is truncated so the user can narrow.
const SOURCE_CAP = 600

// Statements are the *source* of the bank lines (and supplier rollups), not
// individual transactions — excluding them keeps the stream to real events.
const EXCLUDED_DOC_TYPES = ['bank_statement', 'supplier_statement']

type SP = { q?: string; from?: string; to?: string; source?: string; dir?: string }

// A single thing that happened on a date — a bank movement or a document.
interface TimelineItem {
  kind: 'bank' | 'doc'
  id: string
  date: string
  title: string
  subtitle: string | null
  // Signed cash amount for bank lines; null for documents (no cash movement).
  cash_cents: number | null
  // Face value for documents (what the paper is worth); null for bank lines.
  doc_cents: number | null
  href: string
  badge: string
}

function buildHref(base: SP, override: Partial<SP>): string {
  const m = { ...base, ...override }
  const p = new URLSearchParams()
  if (m.q) p.set('q', m.q)
  if (m.from) p.set('from', m.from)
  if (m.to) p.set('to', m.to)
  if (m.source && m.source !== 'all') p.set('source', m.source)
  if (m.dir && m.dir !== 'all') p.set('dir', m.dir)
  const qs = p.toString()
  return `/portal/employee/finance/timeline${qs ? `?${qs}` : ''}`
}

export default async function FinanceTimelinePage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const q = sp.q ?? ''
  const from = sp.from ?? ''
  const to = sp.to ?? ''
  const source = sp.source ?? 'all'   // 'all' | 'bank' | 'docs'
  const dir = sp.dir ?? 'all'         // 'all' | 'in' | 'out'  (bank only)

  // Bank data is manager/admin only — mirror the Bank Statements guard.
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  // --- Fetch both sources under the same filters -----------------------------
  const wantBank = source !== 'docs'
  const wantDocs = source !== 'bank'

  let bankQuery = supabase
    .from('bank_transactions')
    .select('id, account_label, txn_date, description, amount_cents')
    .order('txn_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(SOURCE_CAP)
  if (q) bankQuery = bankQuery.ilike('description', `%${q}%`)
  if (from) bankQuery = bankQuery.gte('txn_date', from)
  if (to) bankQuery = bankQuery.lte('txn_date', to)
  if (dir === 'in') bankQuery = bankQuery.gt('amount_cents', 0)
  if (dir === 'out') bankQuery = bankQuery.lt('amount_cents', 0)

  let docsQuery = supabase
    .from('fin_documents')
    .select('id, doc_type, supplier_name, doc_number, doc_date, total_cents, file_name')
    .not('doc_type', 'in', `(${EXCLUDED_DOC_TYPES.join(',')})`)
    .not('doc_date', 'is', null)
    .order('doc_date', { ascending: false })
    .limit(SOURCE_CAP)
  if (q) docsQuery = docsQuery.or(`file_name.ilike.%${q}%,supplier_name.ilike.%${q}%,doc_number.ilike.%${q}%`)
  if (from) docsQuery = docsQuery.gte('doc_date', from)
  if (to) docsQuery = docsQuery.lte('doc_date', to)

  const [{ data: bankRaw }, { data: docsRaw }] = await Promise.all([
    wantBank ? bankQuery : Promise.resolve({ data: [] }),
    wantDocs ? docsQuery : Promise.resolve({ data: [] }),
  ])

  type BankRaw = { id: string; account_label: string | null; txn_date: string; description: string | null; amount_cents: number }
  type DocRaw = { id: string; doc_type: FinDocType; supplier_name: string | null; doc_number: string | null; doc_date: string; total_cents: number | null; file_name: string | null }

  const bankRows = (bankRaw ?? []) as unknown as BankRaw[]
  const docRows = (docsRaw ?? []) as unknown as DocRaw[]
  const bankTruncated = bankRows.length >= SOURCE_CAP
  const docsTruncated = docRows.length >= SOURCE_CAP

  const items: TimelineItem[] = [
    ...bankRows.map((r): TimelineItem => ({
      kind: 'bank',
      id: r.id,
      date: r.txn_date,
      title: r.description || '—',
      subtitle: shortAccount(r.account_label),
      cash_cents: r.amount_cents,
      doc_cents: null,
      href: `/portal/employee/finance/bank?focus=${r.id}`,
      badge: r.amount_cents < 0 ? 'Money out' : 'Money in',
    })),
    ...docRows.map((d): TimelineItem => ({
      kind: 'doc',
      id: d.id,
      date: d.doc_date,
      title: d.supplier_name || d.file_name || 'Document',
      subtitle: d.doc_number ? `No. ${d.doc_number}` : null,
      cash_cents: null,
      doc_cents: d.total_cents,
      href: `/portal/employee/finance/${d.id}`,
      badge: FIN_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type,
    })),
  ]

  // Newest first, bank lines before documents on the same day.
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.kind !== b.kind) return a.kind === 'bank' ? -1 : 1
    return 0
  })

  // Group into calendar days, each with its own bank net so a single big
  // deposit standing next to that day's stock invoices + wage payments is obvious.
  const days: { date: string; items: TimelineItem[]; moneyIn: number; moneyOut: number }[] = []
  for (const it of items) {
    let day = days[days.length - 1]
    if (!day || day.date !== it.date) {
      day = { date: it.date, items: [], moneyIn: 0, moneyOut: 0 }
      days.push(day)
    }
    day.items.push(it)
    if (it.cash_cents != null) {
      if (it.cash_cents >= 0) day.moneyIn += it.cash_cents
      else day.moneyOut += it.cash_cents
    }
  }

  const totalIn = bankRows.reduce((s, r) => s + (r.amount_cents > 0 ? r.amount_cents : 0), 0)
  const totalOut = bankRows.reduce((s, r) => s + (r.amount_cents < 0 ? r.amount_cents : 0), 0)
  const filtered = !!(q || from || to || source !== 'all' || dir !== 'all')
  const base: SP = { q, from, to, source, dir }
  const fieldCls = 'h-10 rounded-md border border-border bg-background px-3 text-sm'

  return (
    <PageShell width="wide">
      <PageHeader
        icon={CalendarClock}
        title="Finance — Timeline"
        description="Bank transactions and documents interleaved in date order, grouped by day. Search a name (e.g. Damien) to see payments landing next to the stock invoices and wages they cover."
      />

      <FinanceTabs />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="text" name="q" defaultValue={q} placeholder="e.g. Damien, wages, Key Electric…"
                  className={`${fieldCls} w-64 pl-8`} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <input type="date" name="from" defaultValue={from} className={fieldCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input type="date" name="to" defaultValue={to} className={fieldCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Show</label>
              <select name="source" defaultValue={source} className={fieldCls}>
                <option value="all">Bank + documents</option>
                <option value="bank">Bank only</option>
                <option value="docs">Documents only</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Direction</label>
              <select name="dir" defaultValue={dir} className={fieldCls}>
                <option value="all">All</option>
                <option value="in">Money in</option>
                <option value="out">Money out</option>
              </select>
            </div>
            <button type="submit"
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              Apply
            </button>
            {filtered && (
              <Link href="/portal/employee/finance/timeline"
                className="h-10 rounded-md border border-border px-4 text-sm font-medium leading-10 text-muted-foreground hover:text-foreground">
                Reset
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Headline — bank cash totals over what's loaded */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Events" value={items.length.toLocaleString()} />
        <Stat label="Money in" value={formatCurrency(totalIn)} tone="in" />
        <Stat label="Money out" value={formatCurrency(totalOut)} tone="out" />
        <Stat label="Net" value={formatCurrency(totalIn + totalOut)} tone={totalIn + totalOut < 0 ? 'out' : 'in'} />
      </div>

      {(bankTruncated || docsTruncated) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Showing the most recent {SOURCE_CAP.toLocaleString()}{' '}
          {bankTruncated && docsTruncated ? 'bank lines and documents' : bankTruncated ? 'bank lines' : 'documents'}.
          Narrow with a date range or search to see everything in a period.
        </div>
      )}

      {days.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <p className="py-10 text-center text-sm text-muted-foreground">
              {filtered ? 'Nothing matches this filter.' : 'No transactions or documents yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const net = day.moneyIn + day.moneyOut
            return (
              <Card key={day.date}>
                <CardContent className="p-0">
                  {/* Day header with its bank net */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/30 px-4 py-2.5">
                    <span className="text-sm font-semibold">{formatDate(day.date)}</span>
                    <span className="text-xs text-muted-foreground">
                      {day.items.length} event{day.items.length === 1 ? '' : 's'}
                    </span>
                    {(day.moneyIn > 0 || day.moneyOut < 0) && (
                      <span className="ml-auto inline-flex items-center gap-3 text-xs tabular-nums">
                        {day.moneyIn > 0 && <span className="text-green-600">in {formatCurrency(day.moneyIn)}</span>}
                        {day.moneyOut < 0 && <span className="text-red-600">out {formatCurrency(day.moneyOut)}</span>}
                        <span className={`font-semibold ${net < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          net {formatCurrency(net)}
                        </span>
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-border">
                    {day.items.map((it) => (
                      <li key={`${it.kind}-${it.id}`}>
                        <Link href={it.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                          <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            it.kind === 'bank'
                              ? it.cash_cents! < 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                              : 'bg-accent/10 text-accent'
                          }`}>
                            {it.kind === 'bank'
                              ? (it.cash_cents! < 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />)
                              : <Receipt className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium" title={it.title}>{it.title}</span>
                              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {it.badge}
                              </span>
                            </div>
                            {it.subtitle && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {it.kind === 'bank' ? <Landmark className="h-3 w-3" /> : null}
                                <span className="truncate">{it.subtitle}</span>
                              </div>
                            )}
                          </div>
                          {it.kind === 'bank' ? (
                            <span className={`shrink-0 text-right font-medium tabular-nums ${it.cash_cents! < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatCurrency(it.cash_cents!)}
                            </span>
                          ) : (
                            <span className="shrink-0 text-right font-medium tabular-nums text-muted-foreground">
                              {it.doc_cents != null ? formatCurrency(it.doc_cents) : '—'}
                            </span>
                          )}
                          {it.kind === 'bank' && (
                            <Crosshair className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}

function shortAccount(label: string | null): string {
  if (!label) return '—'
  return label.replace(/^FNB\s+/, '').replace(/\s*\(.*\)$/, '')
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'in' | 'out' }) {
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
