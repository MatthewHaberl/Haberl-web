import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, ArrowLeft, Landmark, Receipt, Crosshair } from 'lucide-react'
import type { Metadata } from 'next'
import { PageShell, PageHeader } from '@/components/layout/page'

export const metadata: Metadata = { title: 'Customer statement' }
export const dynamic = 'force-dynamic'

interface Entry { d: string; memo: string; amt: number; src: string; ref: string | null; doc_id: string | null; txn_id: string | null }
interface LedgerRow extends Entry { kind: 'debit' | 'credit'; balance: number }
interface Statement {
  credits: Entry[]   // in their favour: their payments + what we owe them
  debits: Entry[]    // owed to us: charges
  total_credit: number
  total_debit: number
  credit_count: number
  debit_count: number
}

export default async function CustomerStatementPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const from = sp.from || ''
  const to = sp.to || ''
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  const { data: customer } = await supabase
    .from('customers').select('id, full_name').eq('id', id).maybeSingle()
  if (!customer) notFound()

  const { data: stmtRaw } = await supabase.rpc('customer_statement', { p_customer_id: id })
  const s = (stmtRaw ?? {
    credits: [], debits: [], total_credit: 0, total_debit: 0, credit_count: 0, debit_count: 0,
  }) as Statement

  const empty = s.credit_count === 0 && s.debit_count === 0

  // Every entry on one timeline (oldest first). ISO dates sort lexically;
  // undated entries go last.
  const merged: (Entry & { kind: 'debit' | 'credit' })[] = [
    ...s.debits.map((e) => ({ ...e, kind: 'debit' as const })),
    ...s.credits.map((e) => ({ ...e, kind: 'credit' as const })),
  ]
  merged.sort((a, b) => (a.d || '9999-99-99').localeCompare(b.d || '9999-99-99'))
  const signed = (e: { kind: 'debit' | 'credit'; amt: number }) => (e.kind === 'debit' ? e.amt : -e.amt)

  // Opening balance = net of everything dated strictly before `from`. The
  // running total then continues accurately from there for the chosen window.
  const opening = from ? merged.reduce((t, e) => (e.d && e.d < from ? t + signed(e) : t), 0) : 0

  // Entries inside the window. Undated entries only show when no window is set.
  const inRange = (e: Entry) => (!from || (!!e.d && e.d >= from)) && (!to || (!!e.d && e.d <= to))
  const rangeEntries = merged.filter(inRange)

  let running = opening
  const ledger: LedgerRow[] = rangeEntries.map((e) => {
    running += signed(e)
    return { ...e, balance: running }
  })
  const rangeDebits = rangeEntries.filter((e) => e.kind === 'debit')
  const rangeCredits = rangeEntries.filter((e) => e.kind === 'credit')
  const totalDebit = rangeDebits.reduce((t, e) => t + e.amt, 0)
  const totalCredit = rangeCredits.reduce((t, e) => t + e.amt, 0)
  const closing = opening + totalDebit - totalCredit // >0 they owe us; <0 we owe them
  const filtered = !!from || !!to

  const datedInRange = rangeEntries.map((e) => e.d).filter(Boolean).sort()
  const shownFrom = from || datedInRange[0] || null
  const shownTo = to || datedInRange[datedInRange.length - 1] || null

  return (
    <PageShell width="wide">
      <PageHeader
        icon={FileText}
        title={`Statement — ${customer.full_name}`}
        description="Charges owed to us minus money in their favour (their payments + bills they covered for us)."
      />

      <Link
        href={`/portal/employee/customers/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to customer
      </Link>

      {/* Date range selector — opening balance carries everything before "From" */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-wrap items-end gap-3">
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
            <button type="submit"
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              Apply
            </button>
            {filtered && (
              <Link href={`/portal/employee/customers/${id}/statement`}
                className="h-10 rounded-md border border-border px-4 text-sm font-medium leading-10 text-muted-foreground hover:text-foreground">
                Reset
              </Link>
            )}
            {shownFrom && shownTo && (
              <span className="ml-auto self-center text-sm text-muted-foreground">
                {formatDate(shownFrom)} → {formatDate(shownTo)} · {ledger.length} entr{ledger.length === 1 ? 'y' : 'ies'}
              </span>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Headline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={from ? `Opening (before ${formatDate(from)})` : 'Opening balance'}
          value={formatCurrency(opening)}
          tone={opening > 0 ? 'out' : opening < 0 ? 'in' : undefined}
        />
        <Stat label="Charged to them" value={formatCurrency(totalDebit)} sub={`${rangeDebits.length} item${rangeDebits.length === 1 ? '' : 's'}`} tone="out" />
        <Stat label="In their favour" value={formatCurrency(totalCredit)} sub={`${rangeCredits.length} item${rangeCredits.length === 1 ? '' : 's'}`} tone="in" />
        <Stat
          label={closing > 0 ? `${customer.full_name} owes us` : closing < 0 ? `We owe ${customer.full_name}` : 'Settled'}
          value={formatCurrency(Math.abs(closing))}
          big
          tone={closing > 0 ? 'out' : 'in'}
        />
      </div>

      {empty && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing allocated to {customer.full_name} yet. Allocate bank transactions on{' '}
            <Link href="/portal/employee/finance/bank" className="text-accent hover:underline">Bank Statements</Link>{' '}
            or open an invoice under{' '}
            <Link href="/portal/employee/finance" className="text-accent hover:underline">Documents</Link>{' '}
            and use &ldquo;Allocate to customer&rdquo;.
          </CardContent>
        </Card>
      )}

      {!empty && rangeEntries.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No entries in this date range. Opening and closing balance:{' '}
            <span className="font-medium text-foreground">{formatCurrency(opening)}</span>.
          </CardContent>
        </Card>
      )}

      {ledger.length > 0 && (
        <LedgerTable rows={ledger} opening={opening} closing={closing} from={from} />
      )}

      {rangeDebits.length > 0 && (
        <EntryTable title="Charged to them (owed to us)" icon={Receipt} entries={rangeDebits} tone="out" />
      )}
      {rangeCredits.length > 0 && (
        <EntryTable title="In their favour (payments + bills they covered)" icon={Landmark} entries={rangeCredits} tone="in" />
      )}
    </PageShell>
  )
}

function Stat({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: 'in' | 'out'; big?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${big ? 'border-accent bg-accent/5' : 'border-border'}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 ${big ? 'text-3xl' : 'text-2xl'} font-bold tabular-nums ${
        tone === 'in' ? 'text-green-600' : tone === 'out' ? 'text-red-600' : 'text-primary'
      }`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function SourceCell({ e }: { e: Entry }) {
  if (e.doc_id) {
    return <Link href={`/portal/employee/finance/${e.doc_id}`} className="text-accent hover:underline">{e.ref ?? 'Invoice'}</Link>
  }
  if (e.txn_id) {
    return (
      <Link
        href={`/portal/employee/finance/bank?focus=${e.txn_id}`}
        title="View in bank statements, around this date, across all accounts"
        className="inline-flex items-center gap-1 text-accent hover:underline"
      >
        <Crosshair className="h-3.5 w-3.5" /> {e.ref ?? 'Bank'}
      </Link>
    )
  }
  return <Badge variant="outline">{e.ref ?? 'Bank'}</Badge>
}

// Combined chronological ledger: every entry, oldest first, with a running
// balance (positive = they owe us). Charges and money-in-their-favour share one
// timeline so the statement reads top-to-bottom like a bank statement.
function balanceCls(v: number): string {
  return `whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums ${
    v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-muted-foreground'
  }`
}

function LedgerTable({ rows, opening, closing, from }: { rows: LedgerRow[]; opening: number; closing: number; from: string }) {
  const showOpening = !!from || opening !== 0
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <FileText className="h-4 w-4 text-muted-foreground" /> Statement (chronological)
          <span className="font-normal text-muted-foreground">({rows.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 text-right font-medium">Charge</th>
                <th className="px-4 py-2 text-right font-medium">In their favour</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {showOpening && (
                <tr className="bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{from ? formatDate(from) : '—'}</td>
                  <td className="px-4 py-2 font-medium" colSpan={4}>Opening balance</td>
                  <td className={balanceCls(opening)}>{formatCurrency(opening)}</td>
                </tr>
              )}
              {rows.map((e, i) => (
                <tr key={i} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{e.d ? formatDate(e.d) : '—'}</td>
                  <td className="px-4 py-2"><span className="block max-w-[360px] truncate" title={e.memo}>{e.memo}</span></td>
                  <td className="px-4 py-2"><SourceCell e={e} /></td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-red-600">
                    {e.kind === 'debit' ? formatCurrency(e.amt) : ''}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-green-600">
                    {e.kind === 'credit' ? formatCurrency(e.amt) : ''}
                  </td>
                  <td className={balanceCls(e.balance)}>{formatCurrency(e.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className="px-4 py-2" colSpan={5}>Closing balance</td>
                <td className={balanceCls(closing)}>{formatCurrency(closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function EntryTable({
  title, icon: Icon, entries, tone,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  entries: Entry[]
  tone: 'in' | 'out'
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" /> {title}
          <span className="font-normal text-muted-foreground">({entries.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e, i) => (
                <tr key={i} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{e.d ? formatDate(e.d) : '—'}</td>
                  <td className="px-4 py-2"><span className="block max-w-[420px] truncate" title={e.memo}>{e.memo}</span></td>
                  <td className="px-4 py-2"><SourceCell e={e} /></td>
                  <td className={`whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums ${
                    tone === 'in' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(e.amt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
