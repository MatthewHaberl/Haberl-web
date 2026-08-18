import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VIEW_AS_COOKIE, canViewAs } from '@/lib/auth/roles'
import type { Role } from '@/types/database'

export const runtime = 'nodejs'

/**
 * Start or stop previewing the portal as a less-privileged role.
 *
 * The real role is read from the profile on every call, so the cookie can only
 * ever hold a role the account is genuinely allowed to preview — a hand-edited
 * cookie is re-validated on read as well (lib/auth/view-as.ts) and the database
 * still answers as the real user throughout.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  let body: { role?: string | null }
  try { body = await req.json() } catch { return new Response('Invalid body', { status: 400 }) }

  const res = NextResponse.json({ ok: true, viewingAs: body.role ?? null })

  // Null / missing role ⇒ stop previewing.
  if (!body.role) {
    res.cookies.delete(VIEW_AS_COOKIE)
    return res
  }

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  const realRole = (profile?.role ?? 'customer') as Role

  if (!canViewAs(realRole, body.role as Role)) {
    return new Response('Forbidden — you can only preview a role below your own', { status: 403 })
  }

  res.cookies.set(VIEW_AS_COOKIE, body.role, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
