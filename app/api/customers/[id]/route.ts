import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * Archiving a customer is admin-only and a soft delete: the record and all
 * its history are kept, the customer is just hidden from the active list.
 * We never hard-delete — sites.customer_id cascades through jobs/checklists/
 * monitoring, which would destroy real business records (migration 056).
 */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return { error: new Response('Forbidden — admins only', { status: 403 }) }
  }
  return { user }
}

/** Archive (soft delete) a customer. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { id } = await params

  const admin = createAdminClient()
  const { data: customer } = await admin
    .from('customers').select('id, archived_at').eq('id', id).maybeSingle()
  if (!customer) return new Response('Customer not found', { status: 404 })

  const { error } = await admin
    .from('customers')
    .update({ archived_at: new Date().toISOString(), archived_by: gate.user.id })
    .eq('id', id)
  if (error) {
    console.error('[customers] archive', error)
    return new Response('Archive failed', { status: 500 })
  }
  return NextResponse.json({ ok: true, status: 'archived' })
}

/** Restore an archived customer. */
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { id } = await params

  const admin = createAdminClient()
  const { data: customer } = await admin
    .from('customers').select('id').eq('id', id).maybeSingle()
  if (!customer) return new Response('Customer not found', { status: 404 })

  const { error } = await admin
    .from('customers')
    .update({ archived_at: null, archived_by: null })
    .eq('id', id)
  if (error) {
    console.error('[customers] restore', error)
    return new Response('Restore failed', { status: 500 })
  }
  return NextResponse.json({ ok: true, status: 'active' })
}
