import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SCOPEABLE_SECTIONS } from '@/lib/auth/sections'

export const runtime = 'nodejs'

/**
 * Set (or clear) a user's record-level visibility scope for one section —
 * migration 071's `user_section_visibility`. Admin-only; RLS already authorises
 * an admin to write that table, so the caller's own session client is used.
 *
 * Body: { section, scope }. scope 'own' | 'all' upserts an override; 'default'
 * (or null) removes it so the user falls back to their role default.
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

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const { id } = await params

  let body: { section?: string; scope?: string | null }
  try { body = await req.json() } catch { return new Response('Invalid body', { status: 400 }) }

  const section = String(body.section ?? '')
  if (!SCOPEABLE_SECTIONS.some((s) => s.key === section)) {
    return new Response('Unknown or non-scopeable section', { status: 400 })
  }

  const scope = body.scope
  if (scope == null || scope === 'default') {
    const { error } = await supabase
      .from('user_section_visibility')
      .delete().eq('user_id', id).eq('section', section)
    if (error) return new Response('Update failed', { status: 500 })
    return NextResponse.json({ ok: true, scope: 'default' })
  }

  if (scope !== 'own' && scope !== 'all') {
    return new Response('Invalid scope', { status: 400 })
  }

  const { error } = await supabase
    .from('user_section_visibility')
    .upsert(
      { user_id: id, section, scope, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,section' },
    )
  if (error) {
    console.error('[users] visibility', error)
    return new Response('Update failed', { status: 500 })
  }
  return NextResponse.json({ ok: true, scope })
}
