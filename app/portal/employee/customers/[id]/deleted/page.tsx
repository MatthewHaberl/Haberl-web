import { createClient, getUser } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'
import { DeletedQuotesList, type DeletedRow } from '@/app/portal/employee/quotes-v2/deleted/DeletedQuotesList'
import type { Customer } from '@/types/database'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Deleted documents' }

// Admin-only bin of soft-deleted documents for a single customer. Today that's
// deleted quotes; any other soft-deletable document type for this customer
// collects here too, so the main profile stays uncluttered. Restoring a quote
// brings it back — re-open and recalculate to regenerate the printable version.
export default async function CustomerDeletedDocsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'admin') redirect(`/portal/employee/customers/${id}`)

  const { data: customerRow } = await supabase
    .from('customers').select('id, full_name').eq('id', id).maybeSingle()
  if (!customerRow) notFound()
  const customer = customerRow as Pick<Customer, 'id' | 'full_name'>

  const { data: rows } = await supabase
    .from('quote_requests')
    .select('id, customer_name, quote_number, total_amount, created_at, deleted_at, site_label, address, deleter:user_profiles!deleted_by(full_name)')
    .eq('customer_id', id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  return (
    <PageShell width="content">
      <div>
        <Link
          href={`/portal/employee/customers/${id}`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {customer.full_name || 'Customer'}
        </Link>
        <PageHeader
          className="mt-2"
          icon={Trash2}
          title="Deleted documents"
          description="Soft-deleted documents for this customer. Admin-only. Restoring a quote brings it back — re-open and recalculate to regenerate the printable version."
        />
      </div>
      <DeletedQuotesList rows={(rows ?? []) as unknown as DeletedRow[]} />
    </PageShell>
  )
}
