import { NextResponse } from 'next/server'
import { getCurrentCustomerId } from '@/lib/customers/current'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * Customer-facing original-file download. fin_documents is staff-only under RLS,
 * so we read via the service role but gate strictly on ownership: the document
 * must belong to the logged-in customer AND be marked visible_to_customer.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const customerId = await getCurrentCustomerId()
  if (!customerId) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('fin_documents')
    .select('file_url, customer_id, visible_to_customer')
    .eq('id', id)
    .maybeSingle()
  if (!doc || doc.customer_id !== customerId || !doc.visible_to_customer) {
    return new Response('Not found', { status: 404 })
  }

  const { data: signed, error } = await admin.storage
    .from('financial-docs').createSignedUrl(doc.file_url, 60)
  if (error || !signed) return new Response('Could not generate link', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
