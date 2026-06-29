import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PORTAL_SECTIONS, EDITABLE_ROLES } from '@/lib/auth/sections'
import type { Role } from '@/types/database'

export const runtime = 'nodejs'

/**
 * Saving the per-section permissions matrix is admin-only. Admin rows are
 * deliberately ignored — admin is hard-coded to all-access in the app, so it
 * can never be edited away and an admin can't lock themselves out.
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

export async function PUT(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  let body: { permissions?: { role?: string; section?: string; allowed?: boolean }[] }
  try { body = await req.json() } catch { return new Response('Invalid body', { status: 400 }) }
  if (!Array.isArray(body.permissions)) return new Response('Invalid body', { status: 400 })

  const validSections = new Set<string>(PORTAL_SECTIONS.map((s) => s.key))
  const editableRoles = new Set<Role>(EDITABLE_ROLES)

  const rows = body.permissions
    .filter((p) => editableRoles.has(p.role as Role) && validSections.has(p.section ?? ''))
    .map((p) => ({
      role: p.role as Role,
      section: p.section as string,
      allowed: !!p.allowed,
      updated_at: new Date().toISOString(),
    }))

  if (rows.length === 0) return NextResponse.json({ ok: true, updated: 0 })

  const { error } = await supabase
    .from('role_permissions')
    .upsert(rows, { onConflict: 'role,section' })
  if (error) {
    console.error('[permissions] save', error)
    return new Response('Save failed', { status: 500 })
  }
  return NextResponse.json({ ok: true, updated: rows.length })
}
