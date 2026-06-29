import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, ArrowLeft, Landmark } from 'lucide-react'
import type { Metadata } from 'next'
import { PageShell, PageHeader } from '@/components/layout/page'

export const metadata: Metadata = { title: 'Customer statement' }
export const dynamic = 'force-dynamic'

interface Entry { d: string; memo: string; amt: number; src: string; ref: string | null }
interface Statement {
  payments: Entry[]
  charges: Entry[]
  total_paid: number
  total_charged: number
  payment_count: number
  charge_count: number
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
    payments: [], charges: [], total_paid: 0, total_charged: 0, payment_count: 0, charge_count: 0,
  }) as Statement

  const balance = s.total_charged - s.total_paid // positive = customer owes

  return (
    <PageShell width="wide">
      <PageHeader
        icon={FileText}
        title={`Statement — ${customer.full_name}`}
        description="Charges (what was bought for them) minus payments (what they paid in). Allocate transactions on Bank Statements or invoices to populate this."
      />

      <Link
        href={`/portal/employee/customers/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to customer
      </Link>

      {/* Headline */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Charged" value={formatCurrency(s.total_charged)} sub={`${s.charge_count} item${s.charge_count === 1 ? '' : 's'}`} />
        <Stat label="Paid" value={formatCurrency(s.total_paid)} sub={`${s.payment_count} payment${s.payment_count === 1 ? '' : 's'}`} tone="in" />
        <Stat
          label={balance > 0 ? 'Balance owing' : balance < 0 ? 'In credit' : 'Settled'}
          value={formatCurrency(Math.abs(balance))}
          tone={balance > 0 ? 'out' : 'in'}
        />
      </div>

      {s.payment_count === 0 && s.charge_count === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing allocated to {customer.full_name} yet. Go to{' '}
            <Link href="/portal/employee/finance/bank" className="text-accent hover:underline">Bank Statements</Link>,
            search their name, select the transactions and allocate them here.
          </CardContent>
        </Card>
      )}

      {s.charge_count > 0 && (
        <EntryTable title="Charges" icon={FileText} entries={s.charges} tone="out" />
      )}
      {s.payment_count > 0 && (
        <EntryTable title="Payments" icon={Landmark} entries={s.payments} tone="in" />
      )}
    </PageShell>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'in' | 'out' }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${
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
          <span className="text-muted-foreground font-normal">({entries.length})</span>
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
                    <Badge variant="outline">{e.src === 'bank' ? (e.ref ?? 'Bank') : (e.ref ?? 'Invoice')}</Badge>
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
