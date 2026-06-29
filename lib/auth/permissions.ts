import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient, getUser } from '@/lib/supabase/server'
import type { Role } from '@/types/database'
import { PORTAL_SECTIONS, type PortalSectionKey } from './sections'

export interface UserAccess {
  user: User
  role: Role
  name: string
  /** Section keys this user may access. Admin ⇒ every section. */
  sections: Set<string>
}

/**
 * The current user's role + the set of portal sections they may access.
 *
 * Admins always get every section (hard-coded — they can never be locked out).
 * Everyone else is resolved from the `role_permissions` table; if that table is
 * empty/unseeded we fall back to the registry defaults so the portal still works.
 *
 * Request-cached: the portal layout, the employee layout, and every page guard
 * can call this freely without extra DB round-trips.
 */
export const getUserAccess = cache(async (): Promise<UserAccess | null> => {
  const user = await getUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'customer') as Role
  const name = profile?.full_name || user.email || 'User'

  if (role === 'admin') {
    return { user, role, name, sections: new Set(PORTAL_SECTIONS.map((s) => s.key)) }
  }

  const sections = new Set<string>()
  if (role !== 'customer') {
    const { data: perms } = await supabase
      .from('role_permissions')
      .select('section, allowed')
      .eq('role', role)

    if (perms && perms.length > 0) {
      for (const p of perms) if (p.allowed) sections.add(p.section)
    } else {
      // Table not seeded yet — preserve historical defaults.
      for (const s of PORTAL_SECTIONS) if (s.defaultRoles.includes(role)) sections.add(s.key)
    }
  }

  return { user, role, name, sections }
})

export function canAccess(access: UserAccess | null, key: PortalSectionKey): boolean {
  return !!access && access.sections.has(key)
}

/**
 * Server-component guard for a gated section page. Redirects unauthenticated
 * users to login, customers to their portal, and employees who lack the section
 * to the employee dashboard. Returns `{ user, role }` so the page can reuse them.
 */
export async function requireSection(
  key: PortalSectionKey,
): Promise<{ user: User; role: Role }> {
  const access = await getUserAccess()
  if (!access) redirect('/auth/login')
  if (access.role === 'customer') redirect('/portal/customer')
  if (!access.sections.has(key)) redirect('/portal/employee')
  return { user: access.user, role: access.role }
}
