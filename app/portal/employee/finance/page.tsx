import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Receipt, Download, FileText, Search } from 'lucide-react'
import type { Metadata } from 'next'
import { UploadForm } from './UploadForm'
import { DeleteDocButton } from './DeleteDocButton'
import { FIN_DOC_TYPES, FIN_DOC_TYPE_LABEL, type FinDocumentWithCustomer } from '@/lib/finance/types'
import { PageShell, PageHeader } from '@/components/layout/page'
import { FinanceTabs } from '@/components/finance/FinanceTabs'

export const metadata: Metadata = { title: 'Finance — Documents' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

type SP = { q?: string; type?: string; page?: string }

function buildHref(base: SP, override: Partial<SP>): string {
  const m = { ...base, ...override }
  const p = new URLSearchParams()
  if (m.q) p.set('q', m.q)
  if (m.type && m.type !== 'all') p.set('type', m.type)
  if (m.page && m.page !== '0') p.set('page', m.page)
  const qs = p.toString()
  return `/portal/employee/finance${qs ? `?${qs}` : ''}`
}

export default async function FinanceDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  await requireSection('finance')
  const sp = await searchParams
  const q = sp.q ?? ''
  const type = sp.type ?? 'all'
  const page = Math.max(0, parseInt(sp.page ?? '0', 10) || 0)

  const supabase = await createClient()

  let docsQuery = supabase
    .from('fin_documents')
    .select('*, customer:customers(id, full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (q) docsQuery = docsQuery.or(`file_name.ilike.%${q}%,supplier_name.ilike.%${q}%,doc_number.ilike.%${q}%`)
  if (type !== 'all') docsQuery = docsQuery.eq('doc_type', type)

  const [{ data: docsRaw, count }, { data: customersRaw }] = await Promise.all([
    docsQuery,
    supabase.from('customers').select('id, full_name').order('full_name'),
  ])

  const docs = (docsRaw ?? []) as unknown as FinDocumentWithCustomer[]
  const customers = (customersRaw ?? []) as unknown as { id: string; full_name: string }[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const base: SP = { q, type }
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = Math.min(total, page * PAGE_SIZE + docs.length)

  return (
    <PageShell width="full">
      <PageHeader
        icon={Receipt}
        title="Finance — Documents"
        description="Receipts, invoices and statements. Click a document to see its extracted line-item view and the original."
      />

      <FinanceTabs />

      <UploadForm customers={customers} />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text" name="q" defaultValue={q} placeholder="supplier, file name or doc number…"
                  className="h-10 w-72 rounded-md border border-border bg-background pl-8 pr-3 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select name="type" defaultValue={type}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option value="all">All types</option>
                {FIN_DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <button type="submit"
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              Apply
            </button>
            {(q || type !== 'all') && (
              <Link href="/portal/employee/finance"
                className="h-10 rounded-md border border-border px-4 text-sm font-medium leading-10 text-muted-foreground hover:text-foreground">
                Reset
              </Link>
            )}
            <span className="ml-auto self-center text-sm text-muted-foreground">
              {total.toLocaleString()} document{total === 1 ? '' : 's'}
            </span>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {q || type !== 'all' ? 'No documents match this filter.' : 'No documents yet — upload your first receipt above.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Document</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Supplier</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {docs.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/portal/employee/finance/${d.id}`}
                          className="flex items-center gap-2 min-w-0 text-accent hover:underline"
                          title="Open line-item view"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate max-w-[260px]">
                            {d.file_name ?? d.doc_number ?? 'Document'}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{FIN_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</Badge>
                      </td>
                      <td className="px-4 py-3">{d.supplier_name ?? '—'}</td>
                      <td className="px-4 py-3">{d.doc_date ? formatDate(d.doc_date) : '—'}</td>
                      <td className="px-4 py-3">{d.customer?.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {d.total_cents != null ? formatCurrency(d.total_cents) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <a
                            href={`/api/finance/documents/${d.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:underline"
                          >
                            <Download className="h-4 w-4" /> Open
                          </a>
                          <DeleteDocButton id={d.id} name={d.file_name ?? 'this document'} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of {total.toLocaleString()}</span>
          <div className="flex items-center gap-2">
            {page > 0 && (
              <Link href={buildHref(base, { page: String(page - 1) })}
                className="rounded-md border border-border px-3 py-1.5 hover:text-foreground">← Prev</Link>
            )}
            <span>Page {page + 1} of {totalPages}</span>
            {page + 1 < totalPages && (
              <Link href={buildHref(base, { page: String(page + 1) })}
                className="rounded-md border border-border px-3 py-1.5 hover:text-foreground">Next →</Link>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}
