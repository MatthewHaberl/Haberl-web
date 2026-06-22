import { createClient, getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuoteFormV2, type PrefillV2 } from './QuoteFormV2'
import type { EquipmentBrand } from '@/types/database'

export default async function NewQuoteV2Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; lead?: string; newSite?: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { from, lead, newSite } = await searchParams

  const [{ data: brands }, prefillResult, leadResult] = await Promise.all([
    supabase.from('equipment_brands').select('*').eq('active', true).order('category').order('brand'),
    from
      ? supabase
          .from('quote_requests')
          .select(
            'customer_name, customer_phone, customer_email, customer_address, is_business, contact_name, contact_email, address, site_label, municipality, site_number, grid_supply, roof_type, storeys, monthly_kwh, load_profile, inverter_brand, battery_brand, panel_brand',
          )
          .eq('id', from)
          .single()
      : Promise.resolve({ data: null }),
    lead ? supabase.from('leads').select('id, name, phone, suburb').eq('id', lead).single() : Promise.resolve({ data: null }),
  ])

  const leadPrefill: PrefillV2 | null = leadResult.data
    ? { customer_name: leadResult.data.name, customer_phone: leadResult.data.phone, address: leadResult.data.suburb ?? null }
    : null

  // "Add site" → keep the customer, start a fresh location (blank site label + address, next site number)
  const base = (prefillResult.data ?? leadPrefill) as PrefillV2 | null
  const prefill: PrefillV2 | null =
    newSite && prefillResult.data
      ? { ...prefillResult.data, site_label: null, address: null, site_number: (prefillResult.data.site_number ?? 1) + 1 }
      : base

  return (
    <QuoteFormV2
      brands={(brands ?? []) as EquipmentBrand[]}
      prefill={prefill}
      leadId={leadResult.data?.id ?? null}
    />
  )
}
