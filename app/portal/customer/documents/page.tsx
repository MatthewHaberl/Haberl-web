import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentCustomerId } from '@/lib/customers/current'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Download } from 'lucide-react'
import type { Metadata } from 'next'
import { PageShell, PageHeader } from '@/components/layout/page'
import { FIN_DOC_TYPE_LABEL, type FinDocType } from '@/lib/finance/types'

export const metadata: Metadata = { title: 'My Documents' }
export const dynamic = 'force-dynamic'

type Doc = {
  id: string
  doc_type: FinDocType
  supplier_name: string | null
  doc_number: string | null
  doc_date: string | null
  total_cents: number | null
  file_name: string | null
}

export default async function CustomerDocumentsPage() {
  const customerId = await getCurrentCustomerId()

  // fin_documents is staff-only under RLS — read via service role, scoped hard
  // to this customer's shared (visible) documents only.
  let docs: Doc[] = []
  if (customerId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('fin_documents')
      .select('id, doc_type, supplier_name, doc_number, doc_date, total_cents, file_name')
      .eq('customer_id', customerId)
      .eq('visible_to_customer', true)
      .order('doc_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    docs = (data ?? []) as unknown as Doc[]
  }

  return (
    <PageShell width="content">
      <PageHeader
        icon={FileText}
        title="My Documents"
        description="Invoices and paperwork Haberl has shared with you."
      />

      {docs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Anything Haberl shares with you will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {d.supplier_name ?? d.file_name ?? 'Document'}
                      {d.doc_number ? <span className="text-muted-foreground"> · {d.doc_number}</span> : null}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{FIN_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</Badge>
                      {d.doc_date ? formatDate(d.doc_date) : ''}
                    </p>
                  </div>
                  {d.total_cents != null && (
                    <span className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(d.total_cents)}</span>
                  )}
                  <a
                    href={`/api/customer/documents/${d.id}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-sm text-accent hover:underline"
                  >
                    <Download className="h-4 w-4" /> Open
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}
