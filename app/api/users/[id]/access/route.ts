import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PORTAL_SECTIONS } from '@/lib/auth/sections'

export const runtime = 'nodejs'

/**
 * Set (or clear) a user's per-section ACCESS override — migration 084's
 * `user_section_permissions`. Admin-only; RLS authorises the admin to write,
 * so the caller's own session client is used.
 *
 * Body: { section, state }. state 'allow' | 'block' upserts a force-on / force-off
 * override; 'default' (or null) removes it so the user follows their role.
 *
 * `dashboard` and `users` are not overridable: dashboard is everyone's home, and
 * `users` (access control) stays role-driven so the portal is always recoverable.
 */
const NON_OVERRIDABLE = new Set(['dashboard', 'users'])

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

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const { id } = await params

  let body: { section?: string; state?: string | null }
  try { body = await req.json() } catch { return new Response('Invalid body', { status: 400 }) }

  const section = String(body.section ?? '')
  const known = PORTAL_SECTIONS.some((s) => s.key === section)
  if (!known || NON_OVERRIDABLE.has(section)) {
    return new Response('Unknown or non-overridable section', { status: 400 })
  }

  const state = body.state
  if (state == null || state === 'default') {
    const { error } = await supabase
      .from('user_section_permissions')
      .delete().eq('user_id', id).eq('section', section)
    if (error) { console.error('[users] access clear', error); return new Response('Update failed', { status: 500 }) }
    return NextResponse.json({ ok: true, state: 'default' })
  }

  if (state !== 'allow' && state !== 'block') {
    return new Response('Invalid state', { status: 400 })
  }

  const { error } = await supabase
    .from('user_section_permissions')
    .upsert(
      { user_id: id, section, allowed: state === 'allow', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,section' },
    )
  if (error) {
    console.error('[users] access set', error)
    return new Response('Update failed', { status: 500 })
  }
  return NextResponse.json({ ok: true, state })
}
