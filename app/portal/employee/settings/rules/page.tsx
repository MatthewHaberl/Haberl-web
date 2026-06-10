import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RulesExplorer } from './RulesExplorer'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

export default async function RulesPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    redirect('/portal/employee')
  }

  // Real catalog specs feed the live string designer
  const { data: equipment } = await supabase
    .from('equipment_catalog')
    .select('*')
    .in('category', ['inverter', 'panel', 'battery'])
    .eq('active', true)
    .order('sort_order')

  const items = (equipment ?? []) as EquipmentCatalogItem[]

  return (
    <RulesExplorer
      inverters={items.filter((item) => item.category === 'inverter')}
      panels={items.filter((item) => item.category === 'panel')}
      batteries={items.filter((item) => item.category === 'battery')}
    />
  )
}
