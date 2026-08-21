import { createClient, getUser } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Receipt } from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'
import { loadInvoiceCompany, loadInvoiceWithLines } from '@/lib/invoices/query'
import { loadInvoiceSurroundings } from '@/lib/invoices/document'
import { KIND_LABEL, STATUS_LABEL } from '@/lib/invoices/invoice'
import { InvoiceEditor } from './InvoiceEditor'

/**
 * One invoice, as the customer will read it — with the controls to change it
 * while that is still allowed.
 *
 * The preview is not an approximation. The editor renders through the same
 * renderInvoice() the issue route freezes, from the same document data, so
 * "check it, then issue it" means what it says. Once issued the page serves the
 * frozen HTML instead and the editing comes off, because at that point the
 * document is a record rather than a draft.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? 'field_worker'
  // Money — the same line Finance draws. RLS refuses anyway; this is so a field
  // worker gets a 404 rather than a page that renders empty.
  if (!['manager', 'admin'].includes(role)) notFound()

  const loaded = await loadInvoiceWithLines(supabase, id)
  if (!loaded) notFound()
  const { invoice, lines } = loaded

  const [company, around] = await Promise.all([
    loadInvoiceCompany(supabase),
    loadInvoiceSurroundings(supabase, invoice),
  ])

  return (
    <PageShell width="wide">
      <Button variant="ghost" size="sm" asChild className="self-start -ml-2">
        <Link href={invoice.job_id ? `/portal/employee/jobs/${invoice.job_id}` : '/portal/employee/jobs'}>
          <ChevronLeft className="h-4 w-4" /> {around.jobTitle ?? 'Jobs'}
        </Link>
      </Button>

      <PageHeader
        icon={Receipt}
        title={invoice.invoice_number ?? 'Draft invoice'}
        description={`${KIND_LABEL[invoice.kind]} invoice for ${invoice.bill_to_name}`}
        actions={
          <Badge
            variant={
              invoice.status === 'paid'
                ? 'success'
                : invoice.status === 'void'
                  ? 'destructive'
                  : invoice.status === 'draft'
                    ? 'outline'
                    : 'default'
            }
          >
            {STATUS_LABEL[invoice.status]}
          </Badge>
        }
      />

      <InvoiceEditor
        invoice={invoice}
        lines={lines}
        company={company}
        around={around}
        frozenHtml={invoice.status === 'draft' ? null : invoice.document_html}
      />
    </PageShell>
  )
}
