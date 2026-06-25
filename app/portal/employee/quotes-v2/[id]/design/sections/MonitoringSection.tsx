'use client'

import { useMemo } from 'react'
import { Plus, Trash2, Radio } from 'lucide-react'
import { type MonitoringDevice } from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { ProductPicker } from '../ProductPicker'
import { SectionCard, ReorderButtons, SearchableSelect, LOCKED_FIELD, LockNote } from '../section-ui'

// Comms media (free metadata on the device — see research brief).
const COMMS_TYPES: Array<{ value: string; label: string }> = [
  { value: 'wifi', label: 'WiFi' },
  { value: 'lan', label: 'Ethernet / LAN' },
  { value: 'gsm', label: '4G / cellular' },
  { value: 'rs485', label: 'RS485' },
  { value: 'can', label: 'CAN' },
  { value: 've-can', label: 'VE.Can' },
  { value: 've-direct', label: 'VE.Direct' },
  { value: 'other', label: 'Other…' },
]

// Brands that ship monitoring in the box → default to a bundled, no-cost device.
const BUNDLED_BRANDS = ['sunsynk', 'deye', 'solis', 'sigen', 'solaredge', 'sungrow']
// Brands with no bundled monitoring → a Cerbo GX (or equivalent) MUST be added.
const FORCE_ADDED_BRANDS = ['victron']

type Bundling = 'bundled' | 'forced' | 'unknown'

function bundlingFor(brand: string | undefined): Bundling {
  const b = (brand ?? '').trim().toLowerCase()
  if (!b) return 'unknown'
  if (FORCE_ADDED_BRANDS.some((x) => b.includes(x))) return 'forced'
  if (BUNDLED_BRANDS.some((x) => b.includes(x))) return 'bundled'
  return 'unknown'
}

export function MonitoringSection() {
  const { design, dispatch } = useDesign()
  const { items } = useCatalog()
  const monitoring = design.monitoring ?? []

  // The representative inverter and its brand drive the default state.
  const unit = design.inverters[0]
  const inverterItem = useMemo(
    () => byCategory(items, 'inverter').find((i) => i.id === unit?.catalogId) ?? null,
    [items, unit?.catalogId],
  )
  const brand = inverterItem?.brand
  const bundling = bundlingFor(brand)
  const inverterLabel = unit?.model || inverterItem?.description || 'Inverter'

  // "On device" targets (item 52): any node the device can hang off — an inverter, a
  // monitoring gateway already added, or a panel string (for SolarEdge optimisers).
  // Node ids mirror designToFlow: inverters fall on the representative node ('inverter'),
  // gateways are 'monitoring-<id>', panel strings 'panel-<i>'.
  const deviceTargets = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = []
    design.inverters.forEach((u, i) => {
      opts.push({ value: i === 0 ? 'inverter' : `inverter-${i}`, label: u.model || `Inverter ${i + 1}` })
    })
    monitoring.forEach((m) => {
      opts.push({ value: `monitoring-${m.id}`, label: m.label || 'Gateway' })
    })
    design.panels.forEach((p, i) => {
      opts.push({ value: `panel-${i}`, label: p.label || `String ${i + 1}` })
    })
    return opts
  }, [design.inverters, design.panels, monitoring])

  function up(id: string, patch: Partial<MonitoringDevice>) {
    dispatch({ type: 'updateMonitoring', id, patch })
  }
  function pick(m: MonitoringDevice, id: string | null) {
    const item = id ? items.find((x) => x.id === id) : null
    // Preset-lock: when a catalog product is chosen, adopt its description as the label.
    up(m.id, { catalogId: id, ...(item ? { label: item.description } : {}) })
  }

  // Brand-aware defaults for the add button: Victron forces an 'additional' (required)
  // device, bundled brands seed a 'bundled' no-cost line, otherwise an additional one.
  // The reducer seeds comms='wifi'; the user adjusts comms (VE.Can for Victron) below.
  function add() {
    const role: MonitoringDevice['role'] = bundling === 'bundled' ? 'bundled' : 'additional'
    const label =
      bundling === 'forced' ? 'Cerbo GX (required)'
        : bundling === 'bundled' ? `${brand ? brand : 'Inverter'} bundled monitoring`
        : 'Monitoring'
    dispatch({ type: 'addMonitoring', role, label })
  }

  return (
    <SectionCard
      title="Monitoring & comms gateway"
      subtitle="The logger/dongle/gateway that reports to the portal, and what protocol it speaks to the inverter. Bundled or added — brand drives the default."
      action={
        <button type="button" onClick={add} className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Add device
        </button>
      }
    >
      {/* Brand hint banner */}
      {bundling === 'forced' && (
        <div className="mb-3 rounded-md border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          ⚠ {inverterLabel} ({brand}) ships <strong>no monitoring</strong> — a Cerbo GX (or Ekrano) gateway plus VE.Can/VE.Bus comms and GX power must be added. Add it as an <strong>Additional</strong> device.
        </div>
      )}
      {bundling === 'bundled' && (
        <div className="mb-3 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
          ✓ {inverterLabel} ({brand}) usually ships a bundled WiFi dongle — add a <strong>Bundled</strong> device (no cost line) unless you need a LAN/4G or 3rd-party upgrade.
        </div>
      )}

      {monitoring.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          No monitoring device yet. Add the bundled dongle or the gateway this site needs.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {monitoring.map((m, i) => {
            const locked = !!m.catalogId
            return (
              <div key={m.id} className="rounded-md border border-border/70 bg-muted/20 p-2.5">
                <div className="flex items-center gap-2">
                  <Radio className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <input value={m.label} onChange={(e) => up(m.id, { label: e.target.value })} disabled={locked} className={`h-8 flex-1 rounded border border-border bg-background px-2 text-xs ${LOCKED_FIELD}`} placeholder="Label" />
                  <ReorderButtons index={i} count={monitoring.length} onMove={(from, to) => dispatch({ type: 'reorderMonitoring', from, to })} />
                  <button type="button" onClick={() => dispatch({ type: 'removeMonitoring', id: m.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Role</span>
                    <select value={m.role} onChange={(e) => up(m.id, { role: e.target.value as MonitoringDevice['role'] })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                      <option value="bundled">Bundled (in box)</option>
                      <option value="additional">Additional</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Comms</span>
                    <select value={m.commsType} onChange={(e) => up(m.id, { commsType: e.target.value })} className="h-7 rounded border border-border bg-background px-1.5 text-[11px]">
                      {COMMS_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">On device</span>
                    <SearchableSelect
                      value={m.targetId ?? null}
                      onChange={(v) => up(m.id, { targetId: v })}
                      // Can't hang a device off itself.
                      options={deviceTargets.filter((o) => o.value !== `monitoring-${m.id}`)}
                      noneLabel={inverterLabel}
                      placeholder={inverterLabel}
                    />
                  </label>
                  <ProductPicker items={items} category="other" label="Product" value={m.catalogId} onChange={(v) => pick(m, v)} noneLabel="None (quote)" />
                </div>
                {m.commsType === 'other' && (
                  <label className="mt-2 flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Comms detail</span>
                    <input value={m.commsOther ?? ''} onChange={(e) => up(m.id, { commsOther: e.target.value })} className="h-7 rounded border border-border bg-background px-2 text-[11px]" placeholder="e.g. GX Touch 50 → Cerbo GX via HDMI+USB" />
                  </label>
                )}
                {m.role === 'bundled' && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">Bundled — no separate cost line unless a product is picked.</p>
                )}
                {locked && <LockNote>Label set by the selected product</LockNote>}
              </div>
            )
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Two cost buckets: gateway/logger hardware (here) and the data-comms cabling (RS485/CAN/Ethernet runs) on the <strong>Data</strong> step.
      </p>
    </SectionCard>
  )
}
