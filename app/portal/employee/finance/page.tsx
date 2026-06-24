import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Receipt, Download, FileText } from 'lucide-react'
import type { Metadata } from 'next'
import { UploadForm } from './UploadForm'
import { DeleteDocButton } from './DeleteDocButton'
import { FIN_DOC_TYPE_LABEL, type FinDocumentWithCustomer } from '@/lib/finance/types'

export const metadata: Metadata = { title: 'Finance — Documents' }

export default async function FinanceDocumentsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) redirect('/portal/employee')

  const [{ data: docsRaw }, { data: customersRaw }] = await Promise.all([
    supabase
      .from('fin_documents')
      .select('*, customer:customers(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('customers').select('id, full_name').order('full_name'),
  ])

  const docs = (docsRaw ?? []) as unknown as FinDocumentWithCustomer[]
  const customers = (customersRaw ?? []) as unknown as { id: string; full_name: string }[]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Receipt className="h-6 w-6" /> Finance — Documents
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload receipts, invoices and statements. Extraction and per-line allocation come next.
        </p>
      </div>

      <UploadForm customers={customers} />

      <Card>
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              No documents yet — upload your first receipt above.
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
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate max-w-[220px]" title={d.file_name ?? ''}>
                            {d.file_name ?? d.doc_number ?? 'Document'}
                          </span>
                        </div>
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
    </div>
  )
}
