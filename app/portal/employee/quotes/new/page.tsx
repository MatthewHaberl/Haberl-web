import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuoteForm } from './QuoteForm'
import type { EquipmentBrand } from '@/types/database'

export default async function NewQuotePage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const { data: brands } = await supabase
    .from('equipment_brands')
    .select('*')
    .eq('active', true)
    .order('category')
    .order('brand')

  return <QuoteForm brands={(brands ?? []) as EquipmentBrand[]} />
}
