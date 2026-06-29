import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Copy, ArrowRight, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import { PageShell, PageHeader } from '@/components/layout/page'
import { FinanceTabs } from '@/components/finance/FinanceTabs'
import { FIN_DOC_TYPE_LABEL, type FinDocType } from '@/lib/finance/types'
import { findSimilarPairs, SIMILAR_DATE_DAYS } from '@/lib/finance/similar'

export const metadata: Metadata = { title: 'Finance — Possible duplicates' }
export const dynamic = 'force-dynamic'

type Row = {
  id: string
  doc_type: FinDocType
  supplier_name: string | null
  customer_id: string | null
  doc_date: string | null
  total_cents: number | null
  file_name: string | null
  customer?: { full_name: string } | { full_name: string }[] | null
}

function customerName(r: Row): string | null {
  const c = Array.isArray(r.customer) ? r.customer[0] : r.customer
  return c?.full_name ?? null
}

export default async function DuplicatesPage() {
  await requireSection('finance')
  const supabase = await createClient()

  const { data: poolRaw } = await supabase
    .from('fin_documents')
    .select('id, doc_type, supplier_name, customer_id, doc_date, total_cents, file_name, customer:customers(full_name)')
    .neq('doc_type', 'bank_statement')
    .not('doc_date', 'is', null)
    .not('total_cents', 'is', null)
    .order('doc_date', { ascending: false })
    .limit(1000)
  const pool = (poolRaw ?? []) as unknown as Row[]

  const pairs = findSimilarPairs(pool)

  // Which of the involved documents are allocated (an allocated pair is an
  // active double-billing risk, not just a possible one).
  const ids = [...new Set(pairs.flatMap(([a, b]) => [a.id, b.id]))]
  const allocated = new Set<string>()
  if (ids.length > 0) {
    const { data } = await supabase.from('fin_allocations').select('document_id').in('document_id', ids)
    for (const r of (data ?? []) as { document_id: string }[]) allocated.add(r.document_id)
  }

  // Highest risk first: both allocated, then most recent.
  const ranked = pairs
    .map(([a, b]) => {
      const bothAllocated = allocated.has(a.id) && allocated.has(b.id)
      const recent = Math.max(Date.parse(a.doc_date ?? ''), Date.parse(b.doc_date ?? ''))
      const sharedCustomer = !!a.customer_id && a.customer_id === b.customer_id
      const basis = sharedCustomer ? (customerName(a) ?? 'Same customer') : (a.supplier_name ?? 'Same supplier')
      return { a, b, bothAllocated, recent, basis }
    })
    .sort((x, y) => (Number(y.bothAllocated) - Number(x.bothAllocated)) || (y.recent - x.recent))

  return (
    <PageShell width="full">
      <PageHeader
        icon={Copy}
        title="Finance — Possible duplicates"
        description="Documents that look like the same purchase — a pro forma and its final invoice, or a re-issued bill. Bill only one to avoid charging the customer twice."
      />

      <FinanceTabs />

      <p className="text-sm text-muted-foreground">
        Pairs sharing a customer or supplier, dated within {SIMILAR_DATE_DAYS} days, with totals within ~15%.
        {pool.length >= 1000 && ' Showing the 1,000 most recent documents.'}
      </p>

      {ranked.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-green-600" />
            <p className="text-sm font-medium">No likely duplicates found.</p>
            <p className="text-sm text-muted-foreground">Nothing matches on customer/supplier, date and total right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ranked.map(({ a, b, bothAllocated, basis }) => (
            <Card key={`${a.id}-${b.id}`} className={bothAllocated ? 'border-amber-300' : ''}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{basis}</span>
                  {bothAllocated
                    ? <Badge variant="warning">Both allocated — double-billing risk</Badge>
                    : <Badge variant="outline">Review</Badge>}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <DocCell row={a} allocated={allocated.has(a.id)} />
                  <div className="flex items-center justify-center text-muted-foreground">
                    <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
                  </div>
                  <DocCell row={b} allocated={allocated.has(b.id)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}

function DocCell({ row, allocated }: { row: Row; allocated: boolean }) {
  return (
    <Link
      href={`/portal/employee/finance/${row.id}`}
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-md border border-border p-3 hover:border-accent/50 hover:bg-muted/40"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-accent" title={row.file_name ?? undefined}>
          {row.file_name ?? 'Document'}
        </span>
        <Badge variant="outline">{FIN_DOC_TYPE_LABEL[row.doc_type] ?? row.doc_type}</Badge>
        {allocated && <Badge variant="warning">Allocated</Badge>}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{row.supplier_name ?? customerName(row) ?? '—'}</span>
        <span className="flex items-center gap-3">
          <span>{row.doc_date ? formatDate(row.doc_date) : '—'}</span>
          <span className="font-medium tabular-nums text-foreground">
            {row.total_cents != null ? formatCurrency(row.total_cents) : '—'}
          </span>
        </span>
      </div>
    </Link>
  )
}
