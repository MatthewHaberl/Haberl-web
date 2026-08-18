import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient, getUser } from '@/lib/supabase/server'
import type { Role } from '@/types/database'
import { PORTAL_SECTIONS, type PortalSectionKey } from './sections'
import { resolveViewAs } from './view-as'

export interface UserAccess {
  user: User
  /** The role the portal behaves as — the preview role while one is active. */
  role: Role
  /** The role actually stored on the profile. Never changes with a preview. */
  realRole: Role
  /** Set when the user is previewing the portal as a less-privileged role. */
  viewingAs: Role | null
  name: string
  /** Section keys this user may access. Admin ⇒ every section. */
  sections: Set<string>
}

/**
 * The current user's role + the set of portal sections they may access.
 *
 * Resolution: the ROLE default (admin = all sections; everyone else from the
 * `role_permissions` matrix, or the registry defaults if it's unseeded) is then
 * adjusted by any PER-USER overrides in `user_section_permissions` (migration
 * 084) — so an admin can force a single section on or off for one person
 * (e.g. block Finance for Byron). An admin always keeps the `users` section so
 * access control can never be lost and the portal stays recoverable.
 *
 * If a role PREVIEW is active (lib/auth/view-as.ts) the effective role drops to
 * the previewed one and sections come from that role's plain defaults — no
 * per-user overrides, since those belong to the real person, not the role being
 * simulated. A preview can only ever narrow access.
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

  const realRole = (profile?.role ?? 'customer') as Role
  const name = profile?.full_name || user.email || 'User'
  const { role, viewingAs } = await resolveViewAs(realRole)

  const sections = new Set<string>()
  if (role === 'customer') {
    return { user, role, realRole, viewingAs, name, sections }
  }

  // 1. Role default.
  if (role === 'admin') {
    for (const s of PORTAL_SECTIONS) sections.add(s.key)
  } else {
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

  // 2. Per-user overrides (force a section on/off for this person specifically).
  if (!viewingAs) {
    const { data: overrides } = await supabase
      .from('user_section_permissions')
      .select('section, allowed')
      .eq('user_id', user.id)
    if (overrides) {
      for (const o of overrides) {
        if (o.allowed) sections.add(o.section)
        else sections.delete(o.section)
      }
    }
  }

  // 3. Safety: an admin never loses access control, so the portal is recoverable.
  if (role === 'admin') sections.add('users')

  return { user, role, realRole, viewingAs, name, sections }
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
