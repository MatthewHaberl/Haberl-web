import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { PageShell, PageHeader } from '@/components/layout/page'
import { getSettingsCapability } from '@/lib/monitoring/settings/capabilities'
import { parseSettings } from '@/lib/monitoring/settings/types'
import type { MonitoringBrand } from '@/lib/monitoring/types'
import { SettingsOptimiser } from '@/components/monitoring/SettingsOptimiser'
import { AllSettingsPanel } from '@/components/monitoring/AllSettingsPanel'

export const metadata: Metadata = { title: 'Settings & Optimisation' }

const BRAND_LABELS: Record<string, string> = {
  sunsynk: 'Sunsynk', sigenergy: 'Sigenergy', foxess: 'FoxESS',
  deye: 'Deye', growatt: 'Growatt', victron: 'Victron',
  goodwe: 'GoodWe', solax: 'SolaX', solis: 'Solis',
  huawei: 'Huawei', luxpower: 'LuxPower', local: 'Local',
}

export default async function SettingsOptimisationPage({ params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  await requireSection('monitoring')
  const supabase = await createClient()

  const { data: system } = await supabase
    .from('monitoring_systems')
    .select('id, brand, label, capacity_kw, battery_kwh, sites ( name )')
    .eq('id', systemId)
    .single()
  if (!system) notFound()

  const siteArr = system.sites as unknown as Array<{ name: string }> | { name: string } | null
  const site = Array.isArray(siteArr) ? siteArr[0] : siteArr

  const { data: snapshot } = await supabase
    .from('monitoring_settings_snapshots')
    .select('id, captured_at, source, settings, note')
    .eq('system_id', systemId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: recommendations } = await supabase
    .from('monitoring_recommendations')
    .select('*')
    .eq('system_id', systemId)
    .order('severity', { ascending: true })
    .order('projected_annual_saving_r', { ascending: false, nullsFirst: false })

  const brand = system.brand as MonitoringBrand

  return (
    <PageShell width="wide">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/portal/employee/monitoring/${systemId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to system
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{site?.name ?? 'System'} — settings</span>
      </div>

      <PageHeader
        icon={SlidersHorizontal}
        title="Settings & optimisation"
        description={
          <>
            {BRAND_LABELS[brand] ?? brand}
            {system.label && ` · ${system.label}`}
            {site?.name && ` · ${site.name}`}
          </>
        }
      />

      <SettingsOptimiser
        systemId={systemId}
        brand={brand}
        brandLabel={BRAND_LABELS[brand] ?? brand}
        capability={getSettingsCapability(brand)}
        batteryKwh={system.battery_kwh}
        capacityKw={system.capacity_kw}
        initialSnapshot={
          snapshot
            ? { id: snapshot.id, captured_at: snapshot.captured_at, source: snapshot.source, note: snapshot.note, settings: parseSettings(snapshot.settings) }
            : null
        }
        initialRecommendations={recommendations ?? []}
      />

      <AllSettingsPanel systemId={systemId} brand={brand} brandLabel={BRAND_LABELS[brand] ?? brand} />
    </PageShell>
  )
}
