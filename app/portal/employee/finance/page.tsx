import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { Receipt, Search } from 'lucide-react'
import type { Metadata } from 'next'
import { UploadForm } from './UploadForm'
import { DocsTable, type DocRowVM } from './DocsTable'
import { FIN_DOC_TYPES, FIN_DOC_TYPE_LABEL, parseCombinedPages, type FinDocumentWithCustomer } from '@/lib/finance/types'
import { PageShell, PageHeader } from '@/components/layout/page'
import { FinanceTabs } from '@/components/finance/FinanceTabs'

export const metadata: Metadata = { title: 'Finance — Documents' }
export const dynamic = 'force-dynamic'

const PAGE_SIZES = [25, 50, 100, 200]
const DEFAULT_PAGE_SIZE = 50
const NIL = '00000000-0000-0000-0000-000000000000'

type SP = { q?: string; type?: string; supplier?: string; from?: string; to?: string; alloc?: string; books?: string; sort?: string; page?: string; per?: string }

function buildHref(base: SP, override: Partial<SP>): string {
  const m = { ...base, ...override }
  const p = new URLSearchParams()
  if (m.q) p.set('q', m.q)
  if (m.type && m.type !== 'all') p.set('type', m.type)
  if (m.supplier && m.supplier !== 'all') p.set('supplier', m.supplier)
  if (m.from) p.set('from', m.from)
  if (m.to) p.set('to', m.to)
  if (m.alloc && m.alloc !== 'all') p.set('alloc', m.alloc)
  if (m.books && m.books !== 'all') p.set('books', m.books)
  if (m.sort && m.sort !== 'newest') p.set('sort', m.sort)
  if (m.per && m.per !== String(DEFAULT_PAGE_SIZE)) p.set('per', m.per)
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
  const supplier = sp.supplier ?? 'all'
  const from = sp.from ?? ''
  const to = sp.to ?? ''
  const alloc = sp.alloc ?? 'all'
  const books = sp.books ?? 'all'
  const sort = sp.sort ?? 'newest'
  const per = PAGE_SIZES.includes(Number(sp.per)) ? Number(sp.per) : DEFAULT_PAGE_SIZE
  const page = Math.max(0, parseInt(sp.page ?? '0', 10) || 0)

  const supabase = await createClient()

  // Allocation filter needs the matching document ids first (allocations live
  // in a separate table). 'none' = exclude any doc that has an allocation.
  let restrictIds: string[] | null = null
  let excludeIds: string[] | null = null
  if (alloc !== 'all') {
    if (alloc === 'none') {
      const { data } = await supabase.from('fin_allocations').select('document_id')
      excludeIds = [...new Set((data ?? []).map((r: { document_id: string }) => r.document_id))]
    } else {
      let aq = supabase.from('fin_allocations').select('document_id')
      if (alloc === 'haberl') aq = aq.eq('target', 'company')
      else if (alloc !== 'any') aq = aq.eq('customer_id', alloc) // a customer id
      const { data } = await aq
      restrictIds = [...new Set((data ?? []).map((r: { document_id: string }) => r.document_id))]
      if (restrictIds.length === 0) restrictIds = [NIL] // force empty result
    }
  }

  let docsQuery = supabase
    .from('fin_documents')
    .select('*, customer:customers(id, full_name)', { count: 'exact' })

  // sorting
  if (sort === 'oldest') docsQuery = docsQuery.order('doc_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
  else if (sort === 'total_desc') docsQuery = docsQuery.order('total_cents', { ascending: false, nullsFirst: false })
  else if (sort === 'total_asc') docsQuery = docsQuery.order('total_cents', { ascending: true, nullsFirst: false })
  else docsQuery = docsQuery.order('doc_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })

  docsQuery = docsQuery.range(page * per, page * per + per - 1)

  if (q) docsQuery = docsQuery.or(`file_name.ilike.%${q}%,supplier_name.ilike.%${q}%,doc_number.ilike.%${q}%`)
  if (type !== 'all') docsQuery = docsQuery.eq('doc_type', type)
  if (books === 'on') docsQuery = docsQuery.eq('on_books', true)
  else if (books === 'reference') docsQuery = docsQuery.eq('on_books', false)
  if (supplier !== 'all') docsQuery = docsQuery.eq('supplier_name', supplier)
  if (from) docsQuery = docsQuery.gte('doc_date', from)
  if (to) docsQuery = docsQuery.lte('doc_date', to)
  if (restrictIds) docsQuery = docsQuery.in('id', restrictIds)
  if (excludeIds && excludeIds.length) docsQuery = docsQuery.not('id', 'in', `(${excludeIds.join(',')})`)

  const [{ data: docsRaw, count }, { data: customersRaw }, { data: supplierRaw }] = await Promise.all([
    docsQuery,
    supabase.from('customers').select('id, full_name').order('full_name'),
    supabase.from('fin_documents').select('supplier_name').not('supplier_name', 'is', null),
  ])

  const docs = (docsRaw ?? []) as unknown as FinDocumentWithCustomer[]
  const customers = (customersRaw ?? []) as unknown as { id: string; full_name: string }[]
  const suppliers = [...new Set((supplierRaw ?? []).map((r: { supplier_name: string | null }) => r.supplier_name).filter(Boolean) as string[])].sort()

  // who each shown doc is allocated to (for the "Allocated to" column)
  const docIds = docs.map((d) => d.id)
  const { data: allocRows } = docIds.length
    ? await supabase.from('fin_allocations')
        .select('document_id, target, customer:customers(full_name)').in('document_id', docIds)
    : { data: [] }
  const allocMap = new Map<string, { names: Set<string>; company: boolean }>()
  for (const r of (allocRows ?? []) as Array<{ document_id: string; target: string; customer?: { full_name: string } | { full_name: string }[] | null }>) {
    const m = allocMap.get(r.document_id) ?? { names: new Set<string>(), company: false }
    if (r.target === 'company') m.company = true
    else { const c = Array.isArray(r.customer) ? r.customer[0] : r.customer; if (c?.full_name) m.names.add(c.full_name) }
    allocMap.set(r.document_id, m)
  }

  const rows: DocRowVM[] = docs.map((d) => {
    const dStatus = (d as unknown as { status?: string }).status ?? 'open'
    const a = allocMap.get(d.id)
    const allocNames = a ? [...a.names] : []
    if (a?.company) allocNames.push('Haberl')
    return {
      id: d.id,
      file_name: d.file_name,
      doc_number: d.doc_number,
      doc_type_label: FIN_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type,
      status: dStatus,
      supplier_name: d.supplier_name,
      doc_date: d.doc_date,
      alloc_names: allocNames,
      customer_name: d.customer?.full_name ?? null,
      total_cents: d.total_cents,
      combined_pages: parseCombinedPages(d.notes),
      on_books: d.on_books,
      belongs_to: d.belongs_to,
    }
  })

  const total = count ?? 0
  const base: SP = { q, type, supplier, from, to, alloc, books, sort, per: String(per) }
  const dateSort = {
    href: buildHref(base, { sort: sort === 'oldest' ? 'newest' : 'oldest' }),
    arrow: sort === 'oldest' ? '↑' : sort === 'newest' ? '↓' : '',
  }
  const totalSort = {
    href: buildHref(base, { sort: sort === 'total_desc' ? 'total_asc' : 'total_desc' }),
    arrow: sort === 'total_desc' ? '↓' : sort === 'total_asc' ? '↑' : '',
  }
  const filtered = q || type !== 'all' || supplier !== 'all' || from || to || alloc !== 'all' || books !== 'all'

  const fieldCls = 'h-10 rounded-md border border-border bg-background px-3 text-sm'

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
            {per !== DEFAULT_PAGE_SIZE && <input type="hidden" name="per" value={String(per)} />}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="text" name="q" defaultValue={q} placeholder="supplier, file or doc no…"
                  className={`${fieldCls} w-60 pl-8`} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select name="type" defaultValue={type} className={fieldCls}>
                <option value="all">All types</option>
                {FIN_DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Supplier</label>
              <select name="supplier" defaultValue={supplier} className={`${fieldCls} max-w-[200px]`}>
                <option value="all">All suppliers</option>
                {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Allocated to</label>
              <select name="alloc" defaultValue={alloc} className={`${fieldCls} max-w-[200px]`}>
                <option value="all">Anyone / any</option>
                <option value="none">Not allocated</option>
                <option value="any">Allocated (any)</option>
                <option value="haberl">Haberl (business)</option>
                <optgroup label="Customer">
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Books</label>
              <select name="books" defaultValue={books} className={fieldCls}>
                <option value="all">All</option>
                <option value="on">On my books</option>
                <option value="reference">Reference only</option>
              </select>
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
              <label className="text-xs font-medium text-muted-foreground">Sort</label>
              <select name="sort" defaultValue={sort} className={fieldCls}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="total_desc">Total: high → low</option>
                <option value="total_asc">Total: low → high</option>
              </select>
            </div>
            <button type="submit"
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              Apply
            </button>
            {filtered && (
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
              {filtered ? 'No documents match this filter.' : 'No documents yet — upload your first receipt above.'}
            </p>
          ) : (
            <DocsTable rows={rows} dateSort={dateSort} totalSort={totalSort} />
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageSize={per}
        total={total}
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
