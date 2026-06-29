import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Receipt, ArrowLeft, AlertTriangle, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import { FIN_DOC_TYPE_LABEL, type FinDocument, type FinLineItem } from '@/lib/finance/types'
import { PageShell, PageHeader } from '@/components/layout/page'
import { DocAllocations, type DocAllocation } from './DocAllocations'
import { DocViewer } from './DocViewer'
import { DocSummaryEdit } from './DocSummaryEdit'
import { DocLinesEdit } from './DocLinesEdit'
import { DocStatus } from './DocStatus'
import { BankMatchFinder } from './BankMatchFinder'

export const metadata: Metadata = { title: 'Finance — Document' }

export default async function FinanceDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireSection('finance')

  const supabase = await createClient()
  const { data: docRaw } = await supabase
    .from('fin_documents')
    .select('*, customer:customers(id, full_name)')
    .eq('id', id)
    .maybeSingle()
  if (!docRaw) notFound()
  const doc = docRaw as unknown as FinDocument & { customer?: { id: string; full_name: string } | null }

  const { data: linesRaw } = await supabase
    .from('fin_line_items')
    .select('*')
    .eq('document_id', id)
    .order('line_no', { ascending: true })
  const lines = (linesRaw ?? []) as unknown as FinLineItem[]

  const [{ data: customersRaw }, { data: allocsRaw }, { data: prevDoc }, { data: nextDoc }, { data: matchedRaw }] = await Promise.all([
    supabase.from('customers').select('id, full_name').order('full_name'),
    supabase
      .from('fin_allocations')
      .select('id, target, customer_id, direction, category, basis, percent, amount_cents, note, customer:customers(id, full_name)')
      .eq('document_id', id)
      .order('created_at', { ascending: true }),
    supabase.from('fin_documents').select('id').lt('created_at', doc.created_at)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('fin_documents').select('id').gt('created_at', doc.created_at)
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('bank_transactions')
      .select('id, txn_date, description, amount_cents, account_label')
      .eq('matched_document_id', id),
  ])
  const customers = (customersRaw ?? []) as { id: string; full_name: string }[]
  const matchedLinked = (matchedRaw ?? []) as {
    id: string; txn_date: string; description: string; amount_cents: number; account_label: string | null
  }[]
  const allocations: DocAllocation[] = ((allocsRaw ?? []) as unknown as Array<{
    id: string; target: 'customer' | 'company'; customer_id: string | null
    direction: 'charge' | 'reimburse' | null; category: string | null
    basis: 'whole' | 'percent' | 'items' | 'custom'; percent: number | null
    amount_cents: number; note: string | null
    customer?: { id: string; full_name: string } | { id: string; full_name: string }[] | null
  }>).map((a) => {
    const c = Array.isArray(a.customer) ? a.customer[0] : a.customer
    return { ...a, customer_name: c?.full_name ?? null }
  })
  const status = ((doc as unknown as { status?: string }).status ?? 'open') as 'open' | 'unsure' | 'discarded'

  // notes carry the duplicate / non-purchase flags from ingest
  const flags = (doc.notes ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  const hasWarning = flags.some((f) => f.startsWith('⚠') || /duplicate|not a purchase|not a tax|statement|low confidence/i.test(f))

  const ext = (doc.file_name ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = doc.mime_type ?? ''
  const previewKind: 'pdf' | 'image' | 'other' =
    mime.includes('pdf') || ext === 'pdf' ? 'pdf'
    : mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? 'image'
    : 'other'

  return (
    <PageShell width="full">
      <PageHeader
        icon={Receipt}
        title={doc.supplier_name ?? 'Document'}
        description={
          [FIN_DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type, doc.doc_number, doc.doc_date ? formatDate(doc.doc_date) : null]
            .filter(Boolean)
            .join('  ·  ')
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/portal/employee/finance"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All documents
        </Link>
        <div className="flex items-center gap-1">
          {prevDoc?.id ? (
            <Link href={`/portal/employee/finance/${prevDoc.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-muted">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground/50">
              <ChevronLeft className="h-4 w-4" /> Prev
            </span>
          )}
          {nextDoc?.id ? (
            <Link href={`/portal/employee/finance/${nextDoc.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-muted">
              Next <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground/50">
              Next <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
        <div className="ml-auto">
          <DocStatus documentId={doc.id} status={status} />
        </div>
      </div>

      <DocViewer
        previewUrl={`/api/finance/documents/${doc.id}`}
        kind={previewKind}
        fileName={doc.file_name}
      >
      {/* Summary + original (editable) */}
      <DocSummaryEdit
        doc={{
          id: doc.id,
          supplier_name: doc.supplier_name,
          doc_number: doc.doc_number,
          doc_date: doc.doc_date,
          doc_type: doc.doc_type,
          total_cents: doc.total_cents,
          file_name: doc.file_name,
        }}
        customerName={doc.customer?.full_name ?? null}
      />

      {/* Flags / notes */}
      {hasWarning && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <ul className="text-sm space-y-1">
                {flags.map((f, i) => (
                  <li key={i} className="text-amber-900 dark:text-amber-200">{f}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Allocate to customer(s) — recon */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Allocate to customer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Tag this invoice (whole, a %, or specific lines) to a customer. &ldquo;They covered it&rdquo; means
            they paid and you owe them back; &ldquo;Bill them&rdquo; charges it to their account. It flows to their statement.
          </p>
          <DocAllocations
            documentId={doc.id}
            lines={lines.map((l) => ({ id: l.id, description: l.description, line_total_cents: l.line_total_cents ?? 0 }))}
            customers={customers}
            allocations={allocations}
          />
        </CardContent>
      </Card>

      {/* Transaction lines (editable) */}
      <DocLinesEdit
        documentId={doc.id}
        lines={lines.map((l) => ({ id: l.id, description: l.description, qty: l.qty, line_total_cents: l.line_total_cents }))}
        docTotalCents={doc.total_cents}
      />

      {/* Reconcile against the bank statement */}
      <BankMatchFinder documentId={doc.id} hasAllocations={allocations.length > 0} initialLinked={matchedLinked} />
      </DocViewer>
    </PageShell>
  )
}
