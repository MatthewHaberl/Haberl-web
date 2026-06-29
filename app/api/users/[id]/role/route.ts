import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/types/database'

export const runtime = 'nodejs'

const VALID_ROLES: Role[] = ['customer', 'field_worker', 'manager', 'admin']

/**
 * Changing a user's role is admin-only. RLS already authorises an admin to
 * update any profile (migration 001), so we use the caller's own session
 * client — the change is attributable and works without the service-role key.
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
  return { supabase }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const { id } = await params

  let body: { role?: string }
  try { body = await req.json() } catch { return new Response('Invalid body', { status: 400 }) }
  const role = body.role as Role
  if (!VALID_ROLES.includes(role)) return new Response('Invalid role', { status: 400 })

  const { data: target } = await supabase
    .from('user_profiles').select('id, role').eq('id', id).maybeSingle()
  if (!target) return new Response('User not found', { status: 404 })
  if (target.role === role) return NextResponse.json({ ok: true, role })

  // Last-admin protection: never demote the only remaining admin.
  if (target.role === 'admin' && role !== 'admin') {
    const { count } = await supabase
      .from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    if ((count ?? 0) <= 1) {
      return new Response('Cannot change the role of the last remaining admin', { status: 409 })
    }
  }

  const { error } = await supabase.from('user_profiles').update({ role }).eq('id', id)
  if (error) {
    console.error('[users] role change', error)
    return new Response('Update failed', { status: 500 })
  }
  return NextResponse.json({ ok: true, role })
}
