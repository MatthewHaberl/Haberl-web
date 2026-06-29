import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { PORTAL_SECTIONS, EDITABLE_ROLES, sectionDefaultAllowed } from '@/lib/auth/sections'
import { PermissionsMatrix } from './PermissionsMatrix'
import type { Role } from '@/types/database'

export const metadata: Metadata = { title: 'Permissions' }
export const dynamic = 'force-dynamic'

export default async function PermissionsPage() {
  await requireSection('users')
  const supabase = await createClient()

  const { data: stored } = await supabase
    .from('role_permissions')
    .select('role, section, allowed')

  const storedMap = new Map<string, boolean>()
  for (const p of stored ?? []) storedMap.set(`${p.role}:${p.section}`, p.allowed)

  // initial[role][section] — stored value, or the historical default if unseeded.
  const initial: Record<string, Record<string, boolean>> = {}
  for (const role of EDITABLE_ROLES) {
    initial[role] = {}
    for (const s of PORTAL_SECTIONS) {
      const key = `${role}:${s.key}`
      initial[role][s.key] = storedMap.has(key)
        ? !!storedMap.get(key)
        : sectionDefaultAllowed(s.key, role as Role)
    }
  }

  const sections = PORTAL_SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    description: s.description,
  }))

  return (
    <PageShell width="content">
      <Link
        href="/portal/employee/users"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Users
      </Link>

      <PageHeader
        icon={ShieldCheck}
        title="Section permissions"
        description="Choose which portal sections each role can open. Admins always have full access. The customer portal is separate and not configurable here."
      />

      <PermissionsMatrix
        sections={sections}
        editableRoles={EDITABLE_ROLES}
        initial={initial}
      />
    </PageShell>
  )
}
