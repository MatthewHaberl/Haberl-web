'use client'

import {
  createContext, useContext, useReducer, useEffect, useRef, useState, useCallback,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  emptyDesign,
  nodeIdToRef,
  mkId,
  defaultCombiner,
  enclosureCode,
  type SystemDesign,
  type EnergyProfile,
  type PanelGroup,
  type InverterUnit,
  type BatteryUnit,
  type EarthingConfig,
  type DcCombiner,
  type NodePosition,
} from '@/lib/solar/system-design'
import type { BatteryBank, AcCombiner, ExtraComponent } from '@/lib/solar/system-design'
import { defaultAcCombiner, defaultExtra } from '@/lib/solar/system-design'

// ── Actions ──────────────────────────────────────────────────────────────────

export type DesignAction =
  | { type: 'replace'; design: SystemDesign }
  | { type: 'setEnergy'; patch: Partial<EnergyProfile> }
  | { type: 'setHour'; hour: number; value: number }
  | { type: 'clearHourly' }
  | { type: 'addPanelGroup'; group?: Partial<PanelGroup> }
  | { type: 'updatePanelGroup'; id: string; patch: Partial<PanelGroup> }
  | { type: 'removePanelGroup'; id: string }
  | { type: 'setInverter'; inverter: Partial<InverterUnit> }
  | { type: 'updateInverter'; patch: Partial<InverterUnit> }
  | { type: 'removeInverter' }
  | { type: 'setBattery'; battery: Partial<BatteryUnit> }
  | { type: 'updateBattery'; patch: Partial<BatteryUnit> }
  | { type: 'removeBattery' }
  | { type: 'setEarthing'; patch: Partial<EarthingConfig> }
  | { type: 'addCombiner' }
  | { type: 'updateCombiner'; id: string; patch: Partial<DcCombiner> }
  | { type: 'removeCombiner'; id: string }
  | { type: 'setBank'; patch: Partial<BatteryBank> }
  | { type: 'addAcCombiner' }
  | { type: 'updateAcCombiner'; id: string; patch: Partial<AcCombiner> }
  | { type: 'removeAcCombiner'; id: string }
  | { type: 'addExtra'; extraType: string; label: string }
  | { type: 'updateExtra'; id: string; patch: Partial<ExtraComponent> }
  | { type: 'removeExtra'; id: string }
  // Diagram-origin — both forms and the canvas dispatch the same reducer.
  | { type: 'moveNode'; id: string; position: NodePosition }
  | { type: 'applyNodePatch'; id: string; patch: Record<string, unknown> }
  | { type: 'removeNode'; id: string }
  // Per-cable / per-component overrides from the diagram inspector.
  | { type: 'setEdgeOverride'; id: string; patch: Record<string, unknown> }
  | { type: 'clearEdgeOverride'; id: string }
  | { type: 'setNodeOverride'; id: string; patch: Record<string, unknown> }
  | { type: 'clearNodeOverride'; id: string }

function n(value: unknown): number {
  const x = typeof value === 'string' ? parseFloat(value) : (value as number)
  return Number.isFinite(x) ? x : 0
}

// Strip panel-* position overrides so reindexed groups don't inherit stale spots.
function clearPanelLayout(layout: SystemDesign['layout']): SystemDesign['layout'] {
  const nodes: Record<string, NodePosition> = {}
  for (const [k, v] of Object.entries(layout.nodes)) {
    if (!k.startsWith('panel-')) nodes[k] = v
  }
  return { ...layout, nodes }
}

function newPanelGroup(group?: Partial<PanelGroup>): PanelGroup {
  return {
    id: mkId('panel'),
    label: group?.label ?? 'Solar Array',
    panelCount: group?.panelCount ?? 0,
    panelWatts: group?.panelWatts ?? 0,
    panelModel: group?.panelModel ?? '',
    catalogId: group?.catalogId ?? null,
    azimuth: group?.azimuth ?? null,
    pitch: group?.pitch ?? null,
    roofType: group?.roofType ?? '',
  }
}

function applyNodePatch(d: SystemDesign, id: string, patch: Record<string, unknown>): SystemDesign {
  const ref = nodeIdToRef(id)
  if (!ref) return d

  if (ref.kind === 'panel') {
    const panels = d.panels.map((g, i) => {
      if (i !== ref.index) return g
      const next = { ...g }
      if ('panelCount' in patch) next.panelCount = Math.max(0, Math.round(n(patch.panelCount)))
      if ('wpPerPanel' in patch) next.panelWatts = Math.max(0, n(patch.wpPerPanel))
      if ('panelModel' in patch) next.panelModel = String(patch.panelModel ?? '')
      if ('label' in patch) next.label = String(patch.label ?? '')
      return next
    })
    return { ...d, panels }
  }

  if (ref.kind === 'inverter') {
    if (d.inverters.length === 0) return d
    const inverters = d.inverters.map((u, i) => {
      if (i !== 0) return u
      const next = { ...u }
      if ('model' in patch) next.model = String(patch.model ?? '')
      if ('kw' in patch) next.kw = Math.max(0, n(patch.kw))
      if ('phases' in patch) next.phases = n(patch.phases) >= 3 ? 3 : 1
      return next
    })
    return { ...d, inverters }
  }

  if (ref.kind === 'battery') {
    if (d.batteries.length === 0) return d
    const batteries = d.batteries.map((b, i) => {
      if (i !== 0) return b
      const next = { ...b }
      if ('qty' in patch) next.qty = Math.max(1, Math.round(n(patch.qty)))
      if ('model' in patch) next.model = String(patch.model ?? '')
      if ('totalKwh' in patch) next.kwh = n(patch.totalKwh) / Math.max(1, next.qty)
      return next
    })
    return { ...d, batteries }
  }

  if (ref.kind === 'earth') {
    const next = { ...d.earthing }
    if ('spikeCount' in patch) next.spikeCount = Math.max(0, Math.round(n(patch.spikeCount)))
    if ('spec' in patch) next.spec = String(patch.spec ?? '')
    return { ...d, earthing: next }
  }

  return d
}

function reducer(d: SystemDesign, action: DesignAction): SystemDesign {
  switch (action.type) {
    case 'replace':
      return action.design

    case 'setEnergy':
      return { ...d, energy: { ...d.energy, ...action.patch } }

    case 'setHour': {
      const hourly = (d.energy.hourly ?? new Array(24).fill(0)).slice()
      hourly[action.hour] = Math.max(0, action.value)
      return { ...d, energy: { ...d.energy, hourly } }
    }

    case 'clearHourly':
      return { ...d, energy: { ...d.energy, hourly: null } }

    case 'addPanelGroup':
      return { ...d, panels: [...d.panels, newPanelGroup(action.group)], layout: clearPanelLayout(d.layout) }

    case 'updatePanelGroup':
      return {
        ...d,
        panels: d.panels.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      }

    case 'removePanelGroup':
      return {
        ...d,
        panels: d.panels.filter((g) => g.id !== action.id),
        layout: clearPanelLayout(d.layout),
      }

    case 'setInverter': {
      const inv: InverterUnit = {
        id: d.inverters[0]?.id ?? mkId('inv'),
        catalogId: action.inverter.catalogId ?? null,
        model: action.inverter.model ?? '',
        kw: action.inverter.kw ?? 0,
        qty: action.inverter.qty ?? d.inverters[0]?.qty ?? 1,
        phases: action.inverter.phases ?? d.inverters[0]?.phases ?? 1,
      }
      return { ...d, inverters: [inv] }
    }

    case 'updateInverter':
      return d.inverters.length
        ? { ...d, inverters: [{ ...d.inverters[0], ...action.patch }, ...d.inverters.slice(1)] }
        : d

    case 'removeInverter':
      return { ...d, inverters: [] }

    case 'setBattery': {
      const bat: BatteryUnit = {
        id: d.batteries[0]?.id ?? mkId('bat'),
        catalogId: action.battery.catalogId ?? null,
        model: action.battery.model ?? '',
        kwh: action.battery.kwh ?? 0,
        qty: action.battery.qty ?? d.batteries[0]?.qty ?? 1,
      }
      return { ...d, batteries: [bat] }
    }

    case 'updateBattery':
      return d.batteries.length
        ? { ...d, batteries: [{ ...d.batteries[0], ...action.patch }, ...d.batteries.slice(1)] }
        : d

    case 'removeBattery':
      return { ...d, batteries: [] }

    case 'setEarthing':
      return { ...d, earthing: { ...d.earthing, ...action.patch } }

    case 'addCombiner':
      return { ...d, dcCombiners: [...d.dcCombiners, defaultCombiner(d.panels.map((p) => p.id))] }

    case 'updateCombiner':
      return {
        ...d,
        dcCombiners: d.dcCombiners.map((c) => {
          if (c.id !== action.id) return c
          const next = { ...c, ...action.patch }
          // Keep the product code in step with the enclosure unless the user locked it.
          const enclosureTouched = 'material' in action.patch || 'mount' in action.patch || 'ways' in action.patch || 'rows' in action.patch
          if (!next.productCodeLocked && enclosureTouched) next.productCode = enclosureCode(next)
          return next
        }),
      }

    case 'removeCombiner':
      return { ...d, dcCombiners: d.dcCombiners.filter((c) => c.id !== action.id) }

    case 'setBank':
      return { ...d, bank: { ...d.bank, ...action.patch } }

    case 'addAcCombiner':
      return { ...d, acCombiners: [...d.acCombiners, defaultAcCombiner()] }

    case 'updateAcCombiner':
      return {
        ...d,
        acCombiners: d.acCombiners.map((c) => {
          if (c.id !== action.id) return c
          const next = { ...c, ...action.patch }
          const enclosureTouched = 'material' in action.patch || 'mount' in action.patch || 'ways' in action.patch || 'rows' in action.patch
          if (!next.productCodeLocked && enclosureTouched) next.productCode = enclosureCode(next)
          return next
        }),
      }

    case 'removeAcCombiner':
      return { ...d, acCombiners: d.acCombiners.filter((c) => c.id !== action.id) }

    case 'addExtra':
      return { ...d, extras: [...d.extras, defaultExtra(action.extraType, action.label)] }

    case 'updateExtra':
      return { ...d, extras: d.extras.map((x) => x.id === action.id ? { ...x, ...action.patch } : x) }

    case 'removeExtra':
      return { ...d, extras: d.extras.filter((x) => x.id !== action.id) }

    case 'moveNode':
      return { ...d, layout: { ...d.layout, nodes: { ...d.layout.nodes, [action.id]: action.position } } }

    case 'applyNodePatch':
      return applyNodePatch(d, action.id, action.patch)

    case 'setEdgeOverride': {
      const cur = d.layout.edgeOverrides ?? {}
      return { ...d, layout: { ...d.layout, edgeOverrides: { ...cur, [action.id]: { ...(cur[action.id] ?? {}), ...action.patch } } } }
    }

    case 'clearEdgeOverride': {
      const cur = { ...(d.layout.edgeOverrides ?? {}) }
      delete cur[action.id]
      return { ...d, layout: { ...d.layout, edgeOverrides: cur } }
    }

    case 'setNodeOverride': {
      const cur = d.layout.nodeOverrides ?? {}
      return { ...d, layout: { ...d.layout, nodeOverrides: { ...cur, [action.id]: { ...(cur[action.id] ?? {}), ...action.patch } } } }
    }

    case 'clearNodeOverride': {
      const cur = { ...(d.layout.nodeOverrides ?? {}) }
      delete cur[action.id]
      return { ...d, layout: { ...d.layout, nodeOverrides: cur } }
    }

    case 'removeNode': {
      const ref = nodeIdToRef(action.id)
      if (ref?.kind === 'panel') {
        return {
          ...d,
          panels: d.panels.filter((_, i) => i !== ref.index),
          layout: clearPanelLayout(d.layout),
        }
      }
      if (ref?.kind === 'inverter') return { ...d, inverters: [] }
      if (ref?.kind === 'battery') return { ...d, batteries: [] }
      return d
    }

    default:
      return d
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface DesignContextValue {
  design: SystemDesign
  dispatch: React.Dispatch<DesignAction>
  gridSupply: string | undefined
  record: { monthly_kwh?: string | number | null } | null
  activeStep: number
  setActiveStep: (i: number) => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
}

const DesignContext = createContext<DesignContextValue | null>(null)

export function useDesign() {
  const ctx = useContext(DesignContext)
  if (!ctx) throw new Error('useDesign must be used inside <DesignProvider>')
  return ctx
}

interface ProviderProps {
  requestId: string
  initialDesign: SystemDesign
  gridSupply?: string
  record: { monthly_kwh?: string | number | null } | null
  canSave: boolean
  children: React.ReactNode
}

export function DesignProvider({
  requestId, initialDesign, gridSupply, record, canSave, children,
}: ProviderProps) {
  const [design, dispatch] = useReducer(reducer, initialDesign ?? emptyDesign())
  const [activeStep, setActiveStep] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const supabase = createClient()
  const firstRun = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced autosave — skips the initial hydration render.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (!canSave) return
    if (timer.current) clearTimeout(timer.current)
    setSaveState('saving')
    timer.current = setTimeout(async () => {
      const { error } = await supabase
        .from('quote_requests')
        .update({ system_design: design })
        .eq('id', requestId)
      setSaveState(error ? 'error' : 'saved')
    }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [design, canSave, requestId, supabase])

  const setStep = useCallback((i: number) => setActiveStep(i), [])

  return (
    <DesignContext.Provider
      value={{ design, dispatch, gridSupply, record, activeStep, setActiveStep: setStep, saveState }}
    >
      {children}
    </DesignContext.Provider>
  )
}
