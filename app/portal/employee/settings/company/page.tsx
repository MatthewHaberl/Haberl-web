import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { CompanySettingsForm } from './CompanySettingsForm'
import { PageShell, PageHeader } from '@/components/layout/page'

const SETTINGS_LINKS = [
  { href: '/portal/employee/settings/brands', label: 'Brands' },
  { href: '/portal/employee/settings/catalog', label: 'Equipment catalog' },
  { href: '/portal/employee/settings/tier-configs', label: 'Tier configs' },
  { href: '/portal/employee/settings/rules', label: 'Design rules' },
  { href: '/portal/employee/settings/suppliers', label: 'Suppliers' },
]

export default async function CompanySettingsPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal/employee')

  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle()

  return (
    <PageShell width="form">
      <PageHeader
        icon={Settings}
        title="Company Settings"
        description="Everything that used to be hardcoded: contact details, EFT banking, quote defaults, and the pricing policy the calculator uses. Changes apply to the next calculation — existing saved quotes keep their numbers."
      />
      <div className="flex items-center gap-2 flex-wrap">
        {SETTINGS_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </div>
      <CompanySettingsForm initial={settings ?? {}} />
    </PageShell>
  )
}
