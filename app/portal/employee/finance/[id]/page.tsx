import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Receipt, ExternalLink, ArrowLeft, FileText, AlertTriangle } from 'lucide-react'
import type { Metadata } from 'next'
import { FIN_DOC_TYPE_LABEL, type FinDocument, type FinLineItem } from '@/lib/finance/types'
import { PageShell, PageHeader } from '@/components/layout/page'

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

  const lineSum = lines.reduce((s, l) => s + (l.line_total_cents ?? 0), 0)
  // notes carry the duplicate / non-purchase flags from ingest
  const flags = (doc.notes ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  const hasWarning = flags.some((f) => f.startsWith('⚠') || /duplicate|not a purchase|not a tax|statement|low confidence/i.test(f))

  return (
    <PageShell width="content">
      <PageHeader
        icon={Receipt}
        title={doc.supplier_name ?? 'Document'}
        description={
          [FIN_DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type, doc.doc_number, doc.doc_date ? formatDate(doc.doc_date) : null]
            .filter(Boolean)
            .join('  ·  ')
        }
      />

      <Link
        href="/portal/employee/finance"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All documents
      </Link>

      {/* Summary + original */}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-6">
          <Field label="Supplier" value={doc.supplier_name ?? '—'} />
          <Field label="Document no." value={doc.doc_number ?? '—'} />
          <Field label="Date" value={doc.doc_date ? formatDate(doc.doc_date) : '—'} />
          <Field
            label="Total (incl VAT)"
            value={doc.total_cents != null ? formatCurrency(doc.total_cents) : '—'}
          />
          <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3 pt-1">
            <Badge variant="outline">{FIN_DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}</Badge>
            {doc.customer?.full_name && <Badge variant="accent">{doc.customer.full_name}</Badge>}
            <a
              href={`/api/finance/documents/${doc.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" /> Open original ({doc.file_name?.split('.').pop()?.toUpperCase() || 'file'})
            </a>
          </div>
        </CardContent>
      </Card>

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

      {/* Simple transaction view */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Transaction lines
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No itemised lines for this document — open the original to view it.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium w-12 text-right">Qty</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium text-right w-32">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l) => (
                    <tr key={l.id} className="align-top">
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {l.qty != null ? Number(l.qty) : ''}
                      </td>
                      <td className="px-4 py-2">{l.description}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrency(l.line_total_cents ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-medium">
                    <td />
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      Lines total {doc.total_cents != null && Math.abs(lineSum - cents(doc)) > 200 ? '(excl VAT)' : ''}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(lineSum)}</td>
                  </tr>
                  {doc.total_cents != null && (
                    <tr className="text-muted-foreground">
                      <td />
                      <td className="px-4 py-1 text-right">Document total (incl VAT)</td>
                      <td className="px-4 py-1 text-right tabular-nums">{formatCurrency(doc.total_cents)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}

function cents(doc: { total_cents: number | null }) {
  return doc.total_cents ?? 0
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  )
}
