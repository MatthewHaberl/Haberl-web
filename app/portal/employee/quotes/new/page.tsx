import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuoteForm } from './QuoteForm'
import type { EquipmentBrand } from '@/types/database'

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; lead?: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { from, lead } = await searchParams

  const [{ data: brands }, prefillResult, leadResult] = await Promise.all([
    supabase
      .from('equipment_brands')
      .select('*')
      .eq('active', true)
      .order('category')
      .order('brand'),
    from
      ? supabase
          .from('quote_requests')
          .select(
            'customer_name, customer_phone, customer_email, address, municipality, site_number, grid_supply, roof_type, storeys, monthly_kwh, system_type, battery_hours, essential_load, ev_charger, inverter_brand, battery_brand, panel_brand',
          )
          .eq('id', from)
          .single()
      : Promise.resolve({ data: null }),
    lead
      ? supabase.from('leads').select('id, name, phone, suburb').eq('id', lead).single()
      : Promise.resolve({ data: null }),
  ])

  // Website lead → seed the survey with what the customer gave us
  const leadPrefill = leadResult.data
    ? {
        customer_name: leadResult.data.name,
        customer_phone: leadResult.data.phone,
        address: leadResult.data.suburb ?? null,
      }
    : null

  return (
    <QuoteForm
      brands={(brands ?? []) as EquipmentBrand[]}
      prefill={prefillResult.data ?? leadPrefill}
      leadId={leadResult.data?.id ?? null}
    />
  )
}
