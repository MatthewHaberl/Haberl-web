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
  phaseConfigToPhases,
  DEFAULT_SITE_CONDITIONS,
  defaultSupply,
  type SiteConditions,
  type SupplyConfig,
  type SystemDesign,
  type EnergyProfile,
  type PanelGroup,
  type InverterUnit,
  type BatteryUnit,
  type EarthingConfig,
  type DcCombiner,
  type NodePosition,
} from '@/lib/solar/system-design'
import type {
  BatteryBank, AcCombiner, ExtraComponent, ExtraSubComponent,
  BankCable, MonitoringDevice, DataLink, DcComponent, UserEdge,
  EnergyProfileField,
} from '@/lib/solar/system-design'
import {
  defaultAcCombiner, defaultExtra, defaultExtraSubComponent,
  defaultBankCable, defaultMonitoring, defaultDataLink,
  defaultDcComponent, defaultUserEdge,
} from '@/lib/solar/system-design'

// ── Actions ──────────────────────────────────────────────────────────────────

export type DesignAction =
  | { type: 'replace'; design: SystemDesign }
  | { type: 'setEnergy'; patch: Partial<EnergyProfile> }
  | { type: 'setHour'; hour: number; value: number }
  | { type: 'clearHourly' }
  // Energy shaping overlays (items 37–40)
  | { type: 'setProfileCell'; field: EnergyProfileField; index: number; value: number }
  | { type: 'clearProfile'; field: EnergyProfileField }
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
  | { type: 'setStoreys'; storeys: number }
  | { type: 'setSite'; patch: Partial<SiteConditions> }
  | { type: 'setSupply'; patch: Partial<SupplyConfig> }
  | { type: 'addCombiner' }
  | { type: 'updateCombiner'; id: string; patch: Partial<DcCombiner> }
  | { type: 'removeCombiner'; id: string }
  // DC combiner internals (item 44) — mirror the AC component actions
  | { type: 'addDcComponent'; combinerId: string; kind?: DcComponent['kind']; label?: string }
  | { type: 'updateDcComponent'; combinerId: string; componentId: string; patch: Partial<DcComponent> }
  | { type: 'removeDcComponent'; combinerId: string; componentId: string }
  | { type: 'setBank'; patch: Partial<BatteryBank> }
  | { type: 'addAcCombiner' }
  | { type: 'updateAcCombiner'; id: string; patch: Partial<AcCombiner> }
  | { type: 'removeAcCombiner'; id: string }
  | { type: 'addExtra'; extraType: string; label: string }
  | { type: 'updateExtra'; id: string; patch: Partial<ExtraComponent> }
  | { type: 'removeExtra'; id: string }
  // Extra sub-components (item 31)
  | { type: 'addExtraComponent'; extraId: string; kind?: string; label?: string }
  | { type: 'updateExtraComponent'; extraId: string; componentId: string; patch: Partial<ExtraSubComponent> }
  | { type: 'removeExtraComponent'; extraId: string; componentId: string }
  // Inter-bank cables (item 28)
  | { type: 'addBankCable'; cable?: Partial<BankCable> }
  | { type: 'updateBankCable'; id: string; patch: Partial<BankCable> }
  | { type: 'removeBankCable'; id: string }
  // Monitoring (item 26)
  | { type: 'addMonitoring'; role?: 'bundled' | 'additional'; label?: string }
  | { type: 'updateMonitoring'; id: string; patch: Partial<MonitoringDevice> }
  | { type: 'removeMonitoring'; id: string }
  // Data links (item 30)
  | { type: 'addDataLink'; link?: Partial<DataLink> }
  | { type: 'updateDataLink'; id: string; patch: Partial<DataLink> }
  | { type: 'removeDataLink'; id: string }
  // Reorder user-built lists (item 25)
  | { type: 'reorderExtra'; from: number; to: number }
  | { type: 'reorderExtraComponent'; extraId: string; from: number; to: number }
  | { type: 'reorderBankCable'; from: number; to: number }
  | { type: 'reorderMonitoring'; from: number; to: number }
  | { type: 'reorderDataLink'; from: number; to: number }
  | { type: 'reorderCombinerComponent'; combinerId: string; list: 'inputStringIds' | 'outputs'; from: number; to: number }
  | { type: 'reorderAcComponent'; combinerId: string; from: number; to: number }
  | { type: 'reorderDcComponent'; combinerId: string; from: number; to: number }
  // User-drawn cables (item 53) — the canvas wires onConnect / onEdgesDelete here.
  | { type: 'addUserEdge'; edge: Partial<UserEdge> & Pick<UserEdge, 'source' | 'target'> }
  | { type: 'removeUserEdge'; id: string }
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

/** Move an item from one index to another, returning a new array (item 25). */
function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = list.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
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
    // Carried through on duplicate so a cloned string is a faithful copy (item W85).
    distanceFromCombinerM: group?.distanceFromCombinerM,
    jumpers: group?.jumpers,
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
      // Items 50/51: phase config + capability toggles edited on the diagram.
      if ('phaseConfig' in patch) {
        next.phaseConfig = patch.phaseConfig as InverterUnit['phaseConfig']
        if (next.phaseConfig) next.phases = next.phaseConfig === 'three_phase' ? 3 : 1
      }
      if ('acceptsPv' in patch) next.acceptsPv = !!patch.acceptsPv
      if ('acceptsBattery' in patch) next.acceptsBattery = !!patch.acceptsBattery
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

    // ── Energy shaping overlays (items 37–40) ───────────────────────────────────
    case 'setProfileCell': {
      const lengths: Record<EnergyProfileField, number> = { weekly: 7, monthlyProfile: 5, annualProfile: 12 }
      if (action.index < 0 || action.index >= lengths[action.field]) return d
      const current = (d.energy[action.field] as number[] | null | undefined) ?? []
      const next = current.length ? current.slice() : new Array(lengths[action.field]).fill(0)
      next[action.index] = Math.max(0, action.value)
      return { ...d, energy: { ...d.energy, [action.field]: next } }
    }

    case 'clearProfile':
      return { ...d, energy: { ...d.energy, [action.field]: null } }

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

    case 'updateInverter': {
      if (!d.inverters.length) return d
      const merged = { ...d.inverters[0], ...action.patch }
      // The Phase-configuration select is THE phase control (item 50) — keep the
      // legacy `phases` field derived so raw readers (canvas panel, AC board
      // subtitle) can never disagree with the user's selection.
      if (action.patch.phaseConfig) merged.phases = phaseConfigToPhases(action.patch.phaseConfig)
      return { ...d, inverters: [merged, ...d.inverters.slice(1)] }
    }

    case 'removeInverter':
      return { ...d, inverters: [] }

    case 'setBattery': {
      const b = action.battery
      const bat: BatteryUnit = {
        id: d.batteries[0]?.id ?? mkId('bat'),
        catalogId: b.catalogId ?? null,
        model: b.model ?? '',
        kwh: b.kwh ?? 0,
        qty: b.qty ?? d.batteries[0]?.qty ?? 1,
        // Series-stack + catalog-derived voltage metadata (item W85).
        seriesStack: b.seriesStack,
        stackSize: b.stackSize,
        perModuleKwh: b.perModuleKwh,
        perModuleVoltage: b.perModuleVoltage,
        minModules: b.minModules,
        maxModules: b.maxModules,
        voltageClass: b.voltageClass,
        nominalVoltage: b.nominalVoltage,
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

    case 'setStoreys':
      return { ...d, storeys: Math.max(1, Math.min(3, Math.round(action.storeys) || 1)) }
    case 'setSite':
      return { ...d, site: { ...(d.site ?? DEFAULT_SITE_CONDITIONS), ...action.patch } }

    case 'setSupply':
      return { ...d, supply: { ...(d.supply ?? defaultSupply()), ...action.patch } }

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

    // ── DC combiner internals (item 44) — mirror the AC component actions ────────
    case 'addDcComponent':
      return {
        ...d,
        dcCombiners: d.dcCombiners.map((c) => {
          if (c.id !== action.combinerId) return c
          const comp = defaultDcComponent(action.kind, [])
          if (action.label) comp.label = action.label
          return { ...c, components: [...(c.components ?? []), comp] }
        }),
      }

    case 'updateDcComponent':
      return {
        ...d,
        dcCombiners: d.dcCombiners.map((c) => c.id === action.combinerId
          ? { ...c, components: (c.components ?? []).map((k) => k.id === action.componentId ? { ...k, ...action.patch } : k) }
          : c),
      }

    case 'removeDcComponent':
      return {
        ...d,
        dcCombiners: d.dcCombiners.map((c) => c.id === action.combinerId
          ? {
              ...c,
              components: (c.components ?? [])
                .filter((k) => k.id !== action.componentId)
                .map((k) => ({ ...k, fedFrom: (k.fedFrom ?? []).map((f) => (f === action.componentId ? '' : f)) })),
            }
          : c),
      }

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

    // ── Extra sub-components (item 31) ──────────────────────────────────────────
    case 'addExtraComponent':
      return {
        ...d,
        extras: d.extras.map((x) => x.id === action.extraId
          ? { ...x, components: [...(x.components ?? []), defaultExtraSubComponent(action.kind, action.label ?? '')] }
          : x),
      }

    case 'updateExtraComponent':
      return {
        ...d,
        extras: d.extras.map((x) => x.id === action.extraId
          ? { ...x, components: (x.components ?? []).map((c) => c.id === action.componentId ? { ...c, ...action.patch } : c) }
          : x),
      }

    case 'removeExtraComponent':
      return {
        ...d,
        extras: d.extras.map((x) => x.id === action.extraId
          ? { ...x, components: (x.components ?? []).filter((c) => c.id !== action.componentId) }
          : x),
      }

    // ── Inter-bank cables (item 28) ─────────────────────────────────────────────
    case 'addBankCable':
      return { ...d, bank: { ...d.bank, cables: [...(d.bank.cables ?? []), { ...defaultBankCable(), ...action.cable }] } }

    case 'updateBankCable':
      return {
        ...d,
        bank: { ...d.bank, cables: (d.bank.cables ?? []).map((c) => c.id === action.id ? { ...c, ...action.patch } : c) },
      }

    case 'removeBankCable':
      return { ...d, bank: { ...d.bank, cables: (d.bank.cables ?? []).filter((c) => c.id !== action.id) } }

    // ── Monitoring (item 26) ────────────────────────────────────────────────────
    case 'addMonitoring':
      return { ...d, monitoring: [...(d.monitoring ?? []), defaultMonitoring(action.role, action.label)] }

    case 'updateMonitoring':
      return { ...d, monitoring: (d.monitoring ?? []).map((m) => m.id === action.id ? { ...m, ...action.patch } : m) }

    case 'removeMonitoring':
      return { ...d, monitoring: (d.monitoring ?? []).filter((m) => m.id !== action.id) }

    // ── Data links (item 30) ────────────────────────────────────────────────────
    case 'addDataLink':
      return { ...d, data: { links: [...(d.data?.links ?? []), { ...defaultDataLink(), ...action.link }] } }

    case 'updateDataLink':
      return { ...d, data: { links: (d.data?.links ?? []).map((l) => l.id === action.id ? { ...l, ...action.patch } : l) } }

    case 'removeDataLink':
      return { ...d, data: { links: (d.data?.links ?? []).filter((l) => l.id !== action.id) } }

    // ── Reorder user-built lists (item 25) ──────────────────────────────────────
    case 'reorderExtra':
      return { ...d, extras: reorder(d.extras, action.from, action.to) }

    case 'reorderExtraComponent':
      return {
        ...d,
        extras: d.extras.map((x) => x.id === action.extraId
          ? { ...x, components: reorder(x.components ?? [], action.from, action.to) }
          : x),
      }

    case 'reorderBankCable':
      return { ...d, bank: { ...d.bank, cables: reorder(d.bank.cables ?? [], action.from, action.to) } }

    case 'reorderMonitoring':
      return { ...d, monitoring: reorder(d.monitoring ?? [], action.from, action.to) }

    case 'reorderDataLink':
      return { ...d, data: { links: reorder(d.data?.links ?? [], action.from, action.to) } }

    case 'reorderCombinerComponent':
      return {
        ...d,
        dcCombiners: d.dcCombiners.map((c) => c.id === action.combinerId
          ? { ...c, [action.list]: reorder(c[action.list] as unknown[], action.from, action.to) }
          : c),
      }

    case 'reorderAcComponent':
      return {
        ...d,
        acCombiners: d.acCombiners.map((c) => c.id === action.combinerId
          ? { ...c, components: reorder(c.components, action.from, action.to) }
          : c),
      }

    case 'reorderDcComponent':
      return {
        ...d,
        dcCombiners: d.dcCombiners.map((c) => c.id === action.combinerId
          ? { ...c, components: reorder(c.components ?? [], action.from, action.to) }
          : c),
      }

    // ── User-drawn cables (item 53) ─────────────────────────────────────────────
    case 'addUserEdge':
      return {
        ...d,
        layout: { ...d.layout, userEdges: [...(d.layout.userEdges ?? []), { ...defaultUserEdge(), ...action.edge }] },
      }

    case 'removeUserEdge':
      return {
        ...d,
        layout: { ...d.layout, userEdges: (d.layout.userEdges ?? []).filter((u) => u.id !== action.id) },
      }

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
  record: { monthly_kwh?: string | number | null; municipality?: string | null } | null
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
  record: { monthly_kwh?: string | number | null; municipality?: string | null } | null
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
