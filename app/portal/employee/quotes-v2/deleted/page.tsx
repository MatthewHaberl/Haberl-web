import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { DeletedQuotesList, type DeletedRow } from './DeletedQuotesList'

// Admin-only archive of soft-deleted quotes. Quotes are shrunk on delete
// (quote_html + bom_snapshot stripped); generated_quote is kept so a restore is
// lossless — re-open and recalculate to regenerate the printable version.
export default async function DeletedQuotesPage() {
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user!.id).single()

  if (profile?.role !== 'admin') redirect('/portal/employee/quotes-v2')

  const { data: rows } = await supabase
    .from('quote_requests')
    .select('id, customer_name, quote_number, total_amount, created_at, deleted_at, site_label, address, deleter:user_profiles!deleted_by(full_name)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <Link href="/portal/employee/quotes-v2" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Quotes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary">Deleted quotes</h1>
        <p className="mt-1 text-muted-foreground">
          Archived quotes, shrunk to the essentials. Admin-only. Restoring brings a quote
          back — re-open and recalculate to regenerate the printable version.
        </p>
      </div>
      <DeletedQuotesList rows={(rows ?? []) as unknown as DeletedRow[]} />
    </div>
  )
}
