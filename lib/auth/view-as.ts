import { cookies } from 'next/headers'
import type { Role } from '@/types/database'
import { VIEW_AS_COOKIE, canViewAs } from './roles'

/**
 * The role the portal should behave as for this request.
 *
 * This is a **preview**, not a security boundary: it can only ever narrow what
 * the UI offers, and the database still answers every query as the real user
 * (RLS is unchanged). Nothing here can grant access the account doesn't have,
 * so a hand-edited cookie is worthless — the target role is re-checked against
 * the real profile role on every read.
 */
export async function resolveViewAs(realRole: Role): Promise<{ role: Role; viewingAs: Role | null }> {
  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value as Role | undefined
  if (raw && canViewAs(realRole, raw)) {
    return { role: raw, viewingAs: raw }
  }
  return { role: realRole, viewingAs: null }
}
