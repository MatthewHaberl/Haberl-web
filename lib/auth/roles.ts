import type { Role } from '@/types/database'

/**
 * Role vocabulary shared by the server guards and the client sidebar.
 *
 * Kept free of `next/headers` on purpose — the sidebar is a client component
 * and cannot import anything that reaches for request cookies. The server-only
 * half of the role preview lives in `lib/auth/view-as.ts`.
 */

/** Cookie holding the role the user is previewing the portal as. */
export const VIEW_AS_COOKIE = 'haberl.view_as'

/**
 * Privilege ranking. A user may only preview a role *below* their own — the
 * switcher is a way to see less, never more.
 */
export const ROLE_RANK: Record<Role, number> = {
  customer: 0,
  field_worker: 1,
  manager: 2,
  admin: 3,
}

export const ROLE_LABELS: Record<Role, string> = {
  customer: 'Customer',
  field_worker: 'Field worker',
  manager: 'Manager',
  admin: 'Admin',
}

/** Roles `realRole` is allowed to preview, most senior first. */
export function viewableRoles(realRole: Role): Role[] {
  return (Object.keys(ROLE_RANK) as Role[])
    .filter((r) => ROLE_RANK[r] < ROLE_RANK[realRole])
    .sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])
}

export function canViewAs(realRole: Role, target: Role): boolean {
  return target in ROLE_RANK && ROLE_RANK[target] < ROLE_RANK[realRole]
}
