'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DESIGN_RULES,
  RULE_CATEGORIES,
  type DesignRule,
  type RuleEnforcement,
} from '@/lib/solar/rules-registry'
import {
  computeStringLayout,
  estimateDcVoltageDropPct,
  parseBatteryClass,
  MAX_DC_VOLTAGE_DROP_PCT,
} from '@/lib/solar/compliance'
import {
  parseInverterSizingSpec,
  type EquipmentCatalogItem,
} from '@/lib/solar/quote-calculator'
import {
  ArrowLeft, BookOpenCheck, Calculator, Check, ChevronDown, Search, ShieldCheck, X, Zap,
} from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'

const ENFORCEMENT_META: Record<RuleEnforcement, { label: string; variant: 'success' | 'default' | 'warning' | 'outline' }> = {
  both:       { label: 'Auto-applied + verified', variant: 'success' },
  calculator: { label: 'Auto-applied in BOM',     variant: 'success' },
  verifier:   { label: 'Verified on every quote', variant: 'default' },
  site:       { label: 'Site reminder',           variant: 'warning' },
  commercial: { label: 'Commercial rule',         variant: 'outline' },
}

interface Props {
  inverters: EquipmentCatalogItem[]
  panels: EquipmentCatalogItem[]
  batteries: EquipmentCatalogItem[]
}

export function RulesExplorer({ inverters, panels, batteries }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('All')
  const [openRule, setOpenRule] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return DESIGN_RULES.filter((rule) => {
      if (category !== 'All' && rule.category !== category) return false
      if (!term) return true
      return [rule.id, rule.title, rule.rule, rule.why, rule.reference]
        .join(' ').toLowerCase().includes(term)
    })
  }, [search, category])

  const grouped = useMemo(() => {
    const map = new Map<string, DesignRule[]>()
    for (const rule of filtered) {
      const list = map.get(rule.category) ?? []
      list.push(rule)
      map.set(rule.category, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <PageShell width="content">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/portal/employee/settings"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <Link href="/portal/employee/settings" className="text-sm text-muted-foreground hover:text-foreground">
          Settings
        </Link>
      </div>

      <PageHeader
        icon={BookOpenCheck}
        title="Design Rules"
        description={
          <>
            Every rule the quoting engine enforces — SANS 10142-1, field-learned design rules, and
            datasheet physics. {DESIGN_RULES.length} rules. The same checks run automatically on every
            calculated quote and appear in the quote&apos;s BOM tab.
          </>
        }
      />

      <StringDesigner inverters={inverters} panels={panels} batteries={batteries} />

      {/* Search + category filter */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules — try 'armoured', 'Type B', 'Voc', 'deposit'…"
            className="pl-9"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {['All', ...RULE_CATEGORIES].map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setCategory(entry)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${category === entry
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>

      {/* Rules list */}
      {grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No rules match &quot;{search}&quot;.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([groupName, rules]) => (
          <div key={groupName}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {groupName} ({rules.length})
            </h2>
            <Card>
              <CardContent className="py-1">
                {rules.map((rule) => {
                  const open = openRule === rule.id
                  const enforcement = ENFORCEMENT_META[rule.enforcement]
                  return (
                    <div key={rule.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => setOpenRule(open ? null : rule.id)}
                        className="w-full flex items-center gap-3 py-3 text-left hover:bg-muted/40 transition-colors px-1"
                      >
                        <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{rule.id}</span>
                        <span className="text-sm font-medium flex-1 min-w-0">{rule.title}</span>
                        <Badge variant={enforcement.variant} className="shrink-0 hidden sm:inline-flex">
                          {enforcement.label}
                        </Badge>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div className="px-1 pb-4 pl-[4.5rem] flex flex-col gap-2 text-sm">
                          <p>{rule.rule}</p>
                          <p className="text-muted-foreground"><span className="font-medium text-foreground">Why: </span>{rule.why}</p>
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <Badge variant="outline">{rule.reference}</Badge>
                            <Badge variant={enforcement.variant} className="sm:hidden">{enforcement.label}</Badge>
                            {rule.checkId && (
                              <span className="text-muted-foreground flex items-center gap-1">
                                <ShieldCheck className="h-3.5 w-3.5" /> live check: <code className="font-mono">{rule.checkId}</code>
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        ))
      )}
    </PageShell>
  )
}

// ── Live string designer — real catalog specs, same engine as the calculator ──

function StringDesigner({ inverters, panels, batteries }: Props) {
  const [inverterId, setInverterId] = useState(inverters[0]?.id ?? '')
  const [panelId, setPanelId] = useState(panels[0]?.id ?? '')
  const [batteryId, setBatteryId] = useState(batteries[0]?.id ?? '')
  const [panelCount, setPanelCount] = useState('12')

  const inverter = inverters.find((item) => item.id === inverterId) ?? null
  const panel = panels.find((item) => item.id === panelId) ?? null
  const battery = batteries.find((item) => item.id === batteryId) ?? null

  const result = useMemo(() => {
    if (!inverter || !panel) return null
    const count = Math.max(1, Math.round(Number(panelCount) || 1))
    const spec = parseInverterSizingSpec(inverter.notes)
    const layout = computeStringLayout({ panelCount: count, panel, spec })

    const verdicts: { label: string; status: 'pass' | 'warn' | 'fail' | 'info'; detail: string }[] = []

    if (layout.stringVocDesignV != null && spec?.maxDcVoltage) {
      const ok = layout.stringVocDesignV <= spec.maxDcVoltage
      verdicts.push({
        label: 'Cold-weather string voltage (+ edge-of-cloud)',
        status: ok ? 'pass' : 'fail',
        detail: `${layout.panelsPerString} × ${panel.voc_volts}V at ${layout.conditions.minAmbientC}°C ≈ ${layout.stringVocColdV}V → ≈ ${layout.stringVocDesignV}V with +${layout.conditions.edgeOfCloudPct}% edge-of-cloud vs ${spec.maxDcVoltage}V max input${layout.maxSeriesAllowed != null ? ` (max ${layout.maxSeriesAllowed}/string)` : ''}`,
      })
    } else {
      verdicts.push({
        label: 'Cold-weather string voltage',
        status: 'info',
        detail: 'Voc or inverter max DC voltage missing from catalog specs.',
      })
    }

    if (layout.stringVmpHotV != null && spec?.mpptMinVoltage) {
      const ok = layout.stringVmpHotV >= spec.mpptMinVoltage
      verdicts.push({
        label: 'Hot-weather MPPT minimum',
        status: ok ? 'pass' : 'warn',
        detail: `string Vmp hot ≈ ${layout.stringVmpHotV}V vs ${spec.mpptMinVoltage}V MPPT minimum`,
      })
    }

    if (panel.isc_amps && spec?.maxIscPerMpptA) {
      const perMppt = panel.isc_amps * layout.parallelStringsPerMppt
      verdicts.push({
        label: 'String current per MPPT',
        status: perMppt <= spec.maxIscPerMpptA ? 'pass' : 'warn',
        detail: `${perMppt.toFixed(1)}A vs ${spec.maxIscPerMpptA}A MPPT rating`,
      })
    }

    const inverterKw = (inverter.watts_ac ?? 0) / 1000
    const kwp = (count * (panel.watts_dc ?? 0)) / 1000
    if (inverterKw > 0) {
      const ratio = kwp / inverterKw
      verdicts.push({
        label: 'DC:AC ratio',
        status: ratio >= 1 && ratio <= 1.3 ? 'pass' : 'warn',
        detail: `${kwp.toFixed(2)}kWp on ${inverterKw.toFixed(1)}kW = ${ratio.toFixed(2)} (window 1.0–1.3)`,
      })
    }

    if (panel.isc_amps && panel.voc_volts) {
      const drop = estimateDcVoltageDropPct({
        routeMetres: 15,
        iscAmps: panel.isc_amps,
        panelsPerString: layout.panelsPerString,
        vocVolts: panel.voc_volts,
      })
      if (drop != null) {
        verdicts.push({
          label: 'Voltage drop (15m, 4mm²)',
          status: drop <= MAX_DC_VOLTAGE_DROP_PCT ? 'pass' : 'warn',
          detail: `≈ ${drop}% (limit ${MAX_DC_VOLTAGE_DROP_PCT}%)`,
        })
      }
    }

    if (battery) {
      const batteryClass = parseBatteryClass(battery)
      const inverterClass = spec?.batteryClass ?? null
      if (inverterClass === 'PROPRIETARY' || batteryClass === 'PROPRIETARY') {
        const brandOk = inverter.brand.toLowerCase().includes('sigen') === battery.brand.toLowerCase().includes('sigen')
        verdicts.push({
          label: 'Battery compatibility',
          status: brandOk ? 'pass' : 'fail',
          detail: 'Proprietary stack — must stay within brand (Sigenergy ↔ SigenStor only).',
        })
      } else if (inverterClass && batteryClass) {
        verdicts.push({
          label: 'Battery voltage class',
          status: inverterClass === batteryClass ? 'pass' : 'fail',
          detail: `${batteryClass} battery on ${inverterClass} inverter${spec?.batteryVoltageRange ? ` (window ${spec.batteryVoltageRange}V)` : ''}`,
        })
      }
    }

    return { layout, spec, verdicts, kwp }
  }, [inverter, panel, battery, panelCount])

  const selectClass = 'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <Card className="border-accent/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent" /> String Designer — test any combination live
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Runs the exact engine the calculator uses, with the verified datasheet specs now stored in the catalog.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Inverter</span>
            <select value={inverterId} onChange={(e) => setInverterId(e.target.value)} className={selectClass}>
              {inverters.map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Panel</span>
            <select value={panelId} onChange={(e) => setPanelId(e.target.value)} className={selectClass}>
              {panels.map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Battery</span>
            <select value={batteryId} onChange={(e) => setBatteryId(e.target.value)} className={selectClass}>
              {batteries.map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Panel count</span>
            <Input type="number" min="1" value={panelCount} onChange={(e) => setPanelCount(e.target.value)} />
          </label>
        </div>

        {result && (
          <>
            <div className="flex items-center gap-4 flex-wrap rounded-md bg-muted/50 px-4 py-3 text-sm">
              <span className="flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-accent" />
                <strong>{result.layout.stringCount}</strong> string{result.layout.stringCount === 1 ? '' : 's'} ×
                <strong> {result.layout.panelsPerString}</strong> panels
              </span>
              <span className="text-muted-foreground">{result.kwp.toFixed(2)} kWp</span>
              {result.spec?.mpptCount && (
                <span className="text-muted-foreground">{result.spec.mpptCount} MPPTs available</span>
              )}
              {result.layout.parallelStringsPerMppt > 1 && (
                <Badge variant="warning">{result.layout.parallelStringsPerMppt} strings share an MPPT — fuses required</Badge>
              )}
              {result.layout.assumed && (
                <Badge variant="outline">series limit assumed — no voltage spec</Badge>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {result.verdicts.map((verdict) => (
                <div key={verdict.label} className="flex items-start gap-2 text-sm rounded-md border border-border px-3 py-2">
                  {verdict.status === 'pass' && <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />}
                  {verdict.status === 'fail' && <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                  {verdict.status === 'warn' && <span className="text-warning shrink-0 mt-0.5">⚠</span>}
                  {verdict.status === 'info' && <span className="text-muted-foreground shrink-0 mt-0.5">ℹ</span>}
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{verdict.label}</p>
                    <p className="text-xs text-muted-foreground">{verdict.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
