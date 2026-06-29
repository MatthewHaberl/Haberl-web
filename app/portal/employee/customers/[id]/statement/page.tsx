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
interface Statement {
  credits: Entry[]   // in their favour: their payments + what we owe them
  debits: Entry[]    // owed to us: charges
  total_credit: number
  total_debit: number
  credit_count: number
  debit_count: number
}

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const net = s.total_debit - s.total_credit // >0 they owe us; <0 we owe them
  const empty = s.credit_count === 0 && s.debit_count === 0

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

      {/* Headline */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Charged to them" value={formatCurrency(s.total_debit)} sub={`${s.debit_count} item${s.debit_count === 1 ? '' : 's'}`} tone="out" />
        <Stat label="In their favour" value={formatCurrency(s.total_credit)} sub={`${s.credit_count} item${s.credit_count === 1 ? '' : 's'}`} tone="in" />
        <Stat
          label={net > 0 ? `${customer.full_name} owes us` : net < 0 ? `We owe ${customer.full_name}` : 'Settled'}
          value={formatCurrency(Math.abs(net))}
          big
          tone={net > 0 ? 'out' : 'in'}
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

      {s.debit_count > 0 && (
        <EntryTable title="Charged to them (owed to us)" icon={Receipt} entries={s.debits} tone="out" />
      )}
      {s.credit_count > 0 && (
        <EntryTable title="In their favour (payments + bills they covered)" icon={Landmark} entries={s.credits} tone="in" />
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
                  <td className="px-4 py-2">
                    {e.doc_id ? (
                      <Link href={`/portal/employee/finance/${e.doc_id}`} className="text-accent hover:underline">{e.ref ?? 'Invoice'}</Link>
                    ) : e.txn_id ? (
                      <Link
                        href={`/portal/employee/finance/bank?focus=${e.txn_id}`}
                        title="View in bank statements, around this date, across all accounts"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        <Crosshair className="h-3.5 w-3.5" /> {e.ref ?? 'Bank'}
                      </Link>
                    ) : (
                      <Badge variant="outline">{e.ref ?? 'Bank'}</Badge>
                    )}
                  </td>
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
